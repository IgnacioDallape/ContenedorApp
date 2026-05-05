import { create } from 'zustand';
import { PB_COLORS, PB_PALLET_TYPES } from '../lib/constants.js';

export const PB_GRID_RES = 2;
const PB_HEIGHT_EPS = 0.1;
const PB_CELL_AREA = PB_GRID_RES * PB_GRID_RES;
export const PB_PALLET_BASE_H = 14;
const PB_PRECISE_MAX_UNITS = 4;
const PB_POLISH_MAX_UNITS = 10;
const PB_REBALANCE_MAX_UNITS = 180;
const PB_REBALANCE_MAX_SOURCE_UNITS = 24;
const PB_REPACK_MERGE_MAX_UNITS = 120;
const PB_REPACK_MERGE_MAX_SOURCE_UNITS = 18;
const PB_MULTI_STRATEGY_MAX_UNITS = 72;
const PB_MIN_LAYER_SUPPORT_COVERAGE = 0.45;

function pb_makeHM(palW, palL) {
  const cols = Math.ceil((palL + PB_GRID_RES) / PB_GRID_RES);
  const rows = Math.ceil((palW + PB_GRID_RES) / PB_GRID_RES);
  return { data: new Float32Array(cols * rows), cols, rows, palL, palW };
}

function pb_hmSet(hm, px, pz, dX, dZ, h) {
  const gx0 = Math.max(0, Math.floor(px / PB_GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / PB_GRID_RES));
  const gx1 = Math.min(hm.cols, Math.ceil((px + dX) / PB_GRID_RES));
  const gz1 = Math.min(hm.rows, Math.ceil((pz + dZ) / PB_GRID_RES));
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      hm.data[gz * hm.cols + gx] = h;
}

function pb_roundToGrid(value) {
  return Math.round(value / PB_GRID_RES) * PB_GRID_RES;
}

function pb_getPlateauStats(hm, px, pz, dX, dZ) {
  const gx0 = Math.max(0, Math.floor(px / PB_GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / PB_GRID_RES));
  const gx1 = Math.min(hm.cols, Math.ceil((px + dX) / PB_GRID_RES));
  const gz1 = Math.min(hm.rows, Math.ceil((pz + dZ) / PB_GRID_RES));

  let min = Infinity;
  let max = -Infinity;
  let cells = 0;

  for (let gz = gz0; gz < gz1; gz++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const value = hm.data[gz * hm.cols + gx];
      min = Math.min(min, value);
      max = Math.max(max, value);
      cells++;
    }
  }

  return {
    y: Number.isFinite(max) ? max : 0,
    flat: cells > 0 && max - min <= PB_HEIGHT_EPS,
    cells,
  };
}

function pb_getOrientations(unit, palL, palW) {
  if (unit.noRotate) {
    const locked = { dX: unit.dims.L, dZ: unit.dims.W, dY: unit.dims.H };
    return locked.dX <= palL + 0.1 && locked.dZ <= palW + 0.1 ? [locked] : [];
  }

  const options = [
    { dX: unit.dims.L, dZ: unit.dims.W, dY: unit.dims.H },
    { dX: unit.dims.W, dZ: unit.dims.L, dY: unit.dims.H },
    { dX: unit.dims.L, dZ: unit.dims.H, dY: unit.dims.W },
    { dX: unit.dims.H, dZ: unit.dims.L, dY: unit.dims.W },
    { dX: unit.dims.W, dZ: unit.dims.H, dY: unit.dims.L },
    { dX: unit.dims.H, dZ: unit.dims.W, dY: unit.dims.L },
  ];

  const unique = new Map();
  for (const option of options) {
    if (option.dX <= 0 || option.dZ <= 0 || option.dY <= 0) continue;
    if (option.dX > palL + 0.1 || option.dZ > palW + 0.1) continue;
    const key = `${option.dX}|${option.dZ}|${option.dY}`;
    if (!unique.has(key)) unique.set(key, option);
  }

  return [...unique.values()].sort((a, b) => {
    const footprintDiff = (b.dX * b.dZ) - (a.dX * a.dZ);
    if (Math.abs(footprintDiff) > 0.01) return footprintDiff;
    return a.dY - b.dY;
  });
}

function pb_collectAnchors(packed, palL, palW, ori) {
  const maxX = Math.max(0, pb_roundToGrid(palL - ori.dX));
  const maxZ = Math.max(0, pb_roundToGrid(palW - ori.dZ));
  const xs = new Set([0, maxX]);
  const zs = new Set([0, maxZ]);

  for (const box of packed) {
    xs.add(pb_roundToGrid(box.x));
    xs.add(pb_roundToGrid(box.x + box.dX));
    xs.add(pb_roundToGrid(box.x - ori.dX));
    xs.add(pb_roundToGrid(box.x + box.dX - ori.dX));

    zs.add(pb_roundToGrid(box.z));
    zs.add(pb_roundToGrid(box.z + box.dZ));
    zs.add(pb_roundToGrid(box.z - ori.dZ));
    zs.add(pb_roundToGrid(box.z + box.dZ - ori.dZ));
  }

  const anchors = [];
  const xList = [...xs].filter(x => x >= 0 && x <= maxX).sort((a, b) => a - b);
  const zList = [...zs].filter(z => z >= 0 && z <= maxZ).sort((a, b) => a - b);
  for (const x of xList) {
    for (const z of zList) anchors.push({ x, z });
  }
  return anchors;
}

function pb_computeAdjacency(packed, px, pz, ori, y) {
  let sharedEdge = 0;
  let sideContacts = 0;

  for (const item of packed) {
    if (Math.abs(item.y - y) > PB_HEIGHT_EPS) continue;

    const overlapX = Math.max(0, Math.min(px + ori.dX, item.x + item.dX) - Math.max(px, item.x));
    const overlapZ = Math.max(0, Math.min(pz + ori.dZ, item.z + item.dZ) - Math.max(pz, item.z));

    if (overlapZ > PB_HEIGHT_EPS) {
      if (Math.abs((px + ori.dX) - item.x) <= PB_HEIGHT_EPS || Math.abs((item.x + item.dX) - px) <= PB_HEIGHT_EPS) {
        sharedEdge += overlapZ;
        sideContacts++;
      }
    }
    if (overlapX > PB_HEIGHT_EPS) {
      if (Math.abs((pz + ori.dZ) - item.z) <= PB_HEIGHT_EPS || Math.abs((item.z + item.dZ) - pz) <= PB_HEIGHT_EPS) {
        sharedEdge += overlapX;
        sideContacts++;
      }
    }
  }

  return {
    sharedEdge,
    sideContacts,
    exposedPerimeter: Math.max(0, 2 * (ori.dX + ori.dZ) - sharedEdge),
  };
}

function pb_makeLayerMask(placements, palL, palW) {
  const cols = Math.ceil(palL / PB_GRID_RES);
  const rows = Math.ceil(palW / PB_GRID_RES);
  const mask = new Uint8Array(cols * rows);

  for (const placement of placements) {
    const gx0 = Math.max(0, Math.floor(placement.x / PB_GRID_RES));
    const gz0 = Math.max(0, Math.floor(placement.z / PB_GRID_RES));
    const gx1 = Math.min(cols, Math.ceil((placement.x + placement.dX) / PB_GRID_RES));
    const gz1 = Math.min(rows, Math.ceil((placement.z + placement.dZ) / PB_GRID_RES));
    for (let gz = gz0; gz < gz1; gz++) {
      for (let gx = gx0; gx < gx1; gx++) {
        mask[gz * cols + gx] = 1;
      }
    }
  }

  return { mask, cols, rows };
}

function pb_measureLayerShape(placements, palL, palW) {
  if (!placements.length) {
    return { occupiedCells: 0, bboxCells: 0, holeCells: 0, holeCount: 0, perimeter: 0, edgeTouch: 0 };
  }

  const { mask, cols, rows } = pb_makeLayerMask(placements, palL, palW);
  let minGX = cols;
  let maxGX = -1;
  let minGZ = rows;
  let maxGZ = -1;
  let occupiedCells = 0;
  let perimeter = 0;
  let edgeTouch = 0;

  const at = (gx, gz) => mask[gz * cols + gx];

  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      if (!at(gx, gz)) continue;
      occupiedCells++;
      minGX = Math.min(minGX, gx);
      maxGX = Math.max(maxGX, gx);
      minGZ = Math.min(minGZ, gz);
      maxGZ = Math.max(maxGZ, gz);

      const neighbors = [
        [gx - 1, gz],
        [gx + 1, gz],
        [gx, gz - 1],
        [gx, gz + 1],
      ];
      for (const [nx, nz] of neighbors) {
        const isOutside = nx < 0 || nz < 0 || nx >= cols || nz >= rows;
        if (isOutside || !at(nx, nz)) perimeter++;
      }

      if (gx === 0) edgeTouch++;
      if (gz === 0) edgeTouch++;
      if (gx === cols - 1) edgeTouch++;
      if (gz === rows - 1) edgeTouch++;
    }
  }

  if (!occupiedCells) {
    return { occupiedCells: 0, bboxCells: 0, holeCells: 0, holeCount: 0, perimeter: 0, edgeTouch: 0 };
  }

  const bboxCols = maxGX - minGX + 1;
  const bboxRows = maxGZ - minGZ + 1;
  const bboxCells = bboxCols * bboxRows;
  const visited = new Uint8Array(cols * rows);
  let holeCells = 0;
  let holeCount = 0;

  for (let gz = minGZ; gz <= maxGZ; gz++) {
    for (let gx = minGX; gx <= maxGX; gx++) {
      const idx = gz * cols + gx;
      if (visited[idx] || at(gx, gz)) continue;

      let queue = [[gx, gz]];
      visited[idx] = 1;
      let componentSize = 0;
      let touchesBoundary = false;

      while (queue.length) {
        const [cx, cz] = queue.pop();
        componentSize++;
        if (cx === minGX || cx === maxGX || cz === minGZ || cz === maxGZ) touchesBoundary = true;

        const neighbors = [
          [cx - 1, cz],
          [cx + 1, cz],
          [cx, cz - 1],
          [cx, cz + 1],
        ];
        for (const [nx, nz] of neighbors) {
          if (nx < minGX || nz < minGZ || nx > maxGX || nz > maxGZ) continue;
          const nIdx = nz * cols + nx;
          if (visited[nIdx] || at(nx, nz)) continue;
          visited[nIdx] = 1;
          queue.push([nx, nz]);
        }
      }

      if (!touchesBoundary) {
        holeCount++;
        holeCells += componentSize;
      }
    }
  }

  return { occupiedCells, bboxCells, holeCells, holeCount, perimeter, edgeTouch };
}

function pb_scoreCandidate(unit, candidate, packed, palL, palW) {
  const layerPlacements = packed.filter(item => Math.abs(item.y - candidate.y) <= PB_HEIGHT_EPS);
  const layerShape = pb_measureLayerShape([
    ...layerPlacements,
    { x: candidate.px, y: candidate.y, z: candidate.pz, dX: candidate.ori.dX, dY: candidate.ori.dY, dZ: candidate.ori.dZ },
  ], palL, palW);
  const adjacency = pb_computeAdjacency(layerPlacements, candidate.px, candidate.pz, candidate.ori, candidate.y);
  const occupiedArea = layerShape.occupiedCells * PB_CELL_AREA;
  const bboxArea = layerShape.bboxCells * PB_CELL_AREA;
  const fillGapArea = Math.max(0, bboxArea - occupiedArea);
  const topY = candidate.y + candidate.ori.dY;
  const centerX = candidate.px + candidate.ori.dX / 2;
  const centerZ = candidate.pz + candidate.ori.dZ / 2;
  const distToCenter = Math.hypot(centerX - palL / 2, centerZ - palW / 2);
  const touchesWall =
    (candidate.px <= PB_HEIGHT_EPS ? 1 : 0) +
    (candidate.pz <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs((candidate.px + candidate.ori.dX) - palL) <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs((candidate.pz + candidate.ori.dZ) - palW) <= PB_HEIGHT_EPS ? 1 : 0);
  const footprint = candidate.ori.dX * candidate.ori.dZ;
  const slenderness = candidate.ori.dY / Math.max(candidate.ori.dX, candidate.ori.dZ, 1);
  const isBase = candidate.y <= PB_HEIGHT_EPS;

  const holePenalty = layerShape.holeCells * 180 + layerShape.holeCount * 1600;
  const fillGapPenalty = fillGapArea * (isBase ? 2.2 : 4.6);
  const perimeterPenalty = layerShape.perimeter * (isBase ? 3.4 : 6.8);
  const topPenalty = topY * 120 + candidate.y * 24;
  const centerPenalty = isBase ? distToCenter * 0.45 : distToCenter * 2.6;
  const towerPenalty = candidate.y > PB_HEIGHT_EPS ? slenderness * 240 : slenderness * 40;
  const isolationPenalty = layerPlacements.length && adjacency.sideContacts === 0 ? 900 : 0;

  const footprintReward = footprint * (isBase ? 1.6 : 1.05);
  const adjacencyReward = adjacency.sharedEdge * 34 + adjacency.sideContacts * 170;
  const wallReward = isBase ? touchesWall * 220 + layerShape.edgeTouch * 3 : 0;
  const compactReward = occupiedArea * (isBase ? 1.9 : 1.2);
  const centerFillReward = candidate.y > PB_HEIGHT_EPS ? Math.max(0, 220 - distToCenter * 2.4) : 0;
  const basePriorityReward = unit.mustBeBase && isBase ? 400 : 0;

  return holePenalty + fillGapPenalty + perimeterPenalty + topPenalty + centerPenalty + towerPenalty + isolationPenalty
    - footprintReward - adjacencyReward - wallReward - compactReward - centerFillReward - basePriorityReward;
}

function pb_applyPackedToHM(hm, placement) {
  pb_hmSet(hm, placement.x, placement.z, placement.dX, placement.dZ, placement.y + placement.dY);
}

function pb_buildHMFromPacked(packed, palL, palW) {
  const hm = pb_makeHM(palW, palL);
  for (const placement of packed) pb_applyPackedToHM(hm, placement);
  return hm;
}

function pb_findLowestCandidatesForUnit(unit, existingPacked, hm, palL, palW, maxH) {
  let lowestY = Infinity;
  let candidates = [];
  const orientations = pb_getOrientations(unit, palL, palW);

  for (const ori of orientations) {
    const anchors = pb_collectAnchors(existingPacked, palL, palW, ori);
    for (const anchor of anchors) {
      const px = Math.max(0, pb_roundToGrid(anchor.x));
      const pz = Math.max(0, pb_roundToGrid(anchor.z));
      const plateau = pb_getPlateauStats(hm, px, pz, ori.dX, ori.dZ);
      if (!plateau.flat) continue;
      if (plateau.y + ori.dY > maxH + PB_HEIGHT_EPS) continue;
      if (unit.mustBeBase && plateau.y > PB_HEIGHT_EPS) continue;

      const candidate = { unit, px, pz, ori, y: plateau.y };
      if (candidate.y < lowestY - PB_HEIGHT_EPS) {
        lowestY = candidate.y;
        candidates = [candidate];
      } else if (Math.abs(candidate.y - lowestY) <= PB_HEIGHT_EPS) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.map(candidate => ({
    ...candidate,
    score: pb_scoreCandidate(unit, candidate, existingPacked, palL, palW),
  }));
}

function pb_unitSignature(unit) {
  return [
    unit._sourceId ?? unit.id,
    unit.dims?.L,
    unit.dims?.W,
    unit.dims?.H,
    unit.mustBeBase ? 1 : 0,
    unit.noRotate ? 1 : 0,
  ].join('|');
}

function pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH, scanLimit = remainingUnits.length) {
  const nextPacked = [
    ...packed,
    {
      x: candidate.px,
      y: candidate.y,
      z: candidate.pz,
      dX: candidate.ori.dX,
      dY: candidate.ori.dY,
      dZ: candidate.ori.dZ,
    },
  ];
  const nextHm = pb_buildHMFromPacked(nextPacked, palL, palW);
  let sameLayerArea = candidate.ori.dX * candidate.ori.dZ;
  let closePlacements = 0;
  const seen = new Set([pb_unitSignature(candidate.unit)]);
  let scanned = 0;

  for (let unitIdx = 0; unitIdx < remainingUnits.length; unitIdx++) {
    const unit = remainingUnits[unitIdx];
    if (unit.uid === candidate.unit.uid) continue;
    const signature = pb_unitSignature(unit);
    if (seen.has(signature)) continue;
    seen.add(signature);
    scanned++;
    if (scanned > scanLimit) break;

    const options = pb_findLowestCandidatesForUnit(unit, nextPacked, nextHm, palL, palW, maxH);
    const sameLayerOptions = options
      .filter(option => Math.abs(option.y - candidate.y) <= PB_HEIGHT_EPS)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);

    if (!sameLayerOptions.length) continue;
    closePlacements++;
    sameLayerArea += sameLayerOptions[0].ori.dX * sameLayerOptions[0].ori.dZ;
  }

  return { sameLayerArea, closePlacements };
}

function pb_scoreLayerPattern(placements, palL, palW) {
  const shape = pb_measureLayerShape(placements, palL, palW);
  const occupiedArea = shape.occupiedCells * PB_CELL_AREA;
  const bboxArea = shape.bboxCells * PB_CELL_AREA;
  const gapArea = Math.max(0, bboxArea - occupiedArea);
  const layerY = placements[0]?.y || 0;
  const layerContacts = placements.reduce((sum, placement) => {
    const adjacency = pb_computeAdjacency(placements.filter(p => p !== placement), placement.x, placement.z, placement, placement.y);
    return sum + adjacency.sharedEdge;
  }, 0);

  return (
    shape.holeCells * 260 +
    shape.holeCount * 2600 +
    gapArea * (layerY <= PB_HEIGHT_EPS ? 1.8 : 3.6) +
    shape.perimeter * (layerY <= PB_HEIGHT_EPS ? 2.8 : 5.4) -
    occupiedArea * (layerY <= PB_HEIGHT_EPS ? 2.6 : 1.8) -
    layerContacts * 24 -
    shape.edgeTouch * (layerY <= PB_HEIGHT_EPS ? 8 : 1)
  );
}

function pb_simulateLayerPattern(seedCandidate, remainingUnits, packed, palL, palW, maxH) {
  const placedUnits = new Set([seedCandidate.unit.uid]);
  const layerY = seedCandidate.y;
  const simulated = [
    ...packed,
    {
      x: seedCandidate.px,
      y: layerY,
      z: seedCandidate.pz,
      dX: seedCandidate.ori.dX,
      dY: seedCandidate.ori.dY,
      dZ: seedCandidate.ori.dZ,
    },
  ];
  const layerPlacements = simulated.filter(item => Math.abs(item.y - layerY) <= PB_HEIGHT_EPS);

  for (let step = 0; step < 9; step++) {
    const hm = pb_buildHMFromPacked(simulated, palL, palW);
    let best = null;

    for (const unit of remainingUnits) {
      if (placedUnits.has(unit.uid)) continue;
      const candidates = pb_findLowestCandidatesForUnit(unit, simulated, hm, palL, palW, maxH)
        .filter(candidate => Math.abs(candidate.y - layerY) <= PB_HEIGHT_EPS);
      for (const candidate of candidates) {
        const nextPlacement = {
          x: candidate.px,
          y: candidate.y,
          z: candidate.pz,
          dX: candidate.ori.dX,
          dY: candidate.ori.dY,
          dZ: candidate.ori.dZ,
        };
        const nextLayer = [...layerPlacements, nextPlacement];
        const patternScore = pb_scoreLayerPattern(nextLayer, palL, palW);
        const score = patternScore + candidate.score * 0.12 - (candidate.ori.dX * candidate.ori.dZ) * 1.4;
        if (!best || score < best.score) {
          best = { unit, candidate, placement: nextPlacement, score };
        }
      }
    }

    if (!best) break;
    placedUnits.add(best.unit.uid);
    simulated.push(best.placement);
    layerPlacements.push(best.placement);
  }

  const occupiedArea = layerPlacements.reduce((sum, placement) => sum + placement.dX * placement.dZ, 0);
  return {
    simulatedCount: layerPlacements.length,
    simulatedArea: occupiedArea,
    patternScore: pb_scoreLayerPattern(layerPlacements, palL, palW),
  };
}

function pb_chooseBestCandidate(remainingUnits, packed, hm, palL, palW, maxH) {
  let layerY = Infinity;
  const layerCandidates = [];
  const seenUnits = new Set();

  for (let unitIdx = 0; unitIdx < remainingUnits.length; unitIdx++) {
    const unit = remainingUnits[unitIdx];
    const signature = pb_unitSignature(unit);
    if (seenUnits.has(signature)) continue;
    seenUnits.add(signature);

    const candidates = pb_findLowestCandidatesForUnit(unit, packed, hm, palL, palW, maxH);
    if (!candidates.length) continue;

    for (const candidate of candidates) {
      if (candidate.y < layerY - PB_HEIGHT_EPS) {
        layerY = candidate.y;
        layerCandidates.length = 0;
        layerCandidates.push({ ...candidate, unitIdx });
        continue;
      }
      if (Math.abs(candidate.y - layerY) <= PB_HEIGHT_EPS) {
        layerCandidates.push({ ...candidate, unitIdx });
      }
    }
  }

  if (!layerCandidates.length) return null;

  const totalRemaining = remainingUnits.length;
  const candidateLimit = totalRemaining > 120 ? 3 : totalRemaining > 80 ? 4 : totalRemaining > 45 ? 6 : 12;
  const shouldEstimateLayer = totalRemaining <= 60;
  const shouldSimulatePatterns = totalRemaining <= 32;
  const estimateScanLimit = totalRemaining > 40 ? 18 : remainingUnits.length;
  const rankedCandidates = layerCandidates
    .sort((a, b) => a.score - b.score)
    .slice(0, candidateLimit)
    .map(candidate => {
      const estimate = shouldEstimateLayer
        ? pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH, estimateScanLimit)
        : { sameLayerArea: candidate.ori.dX * candidate.ori.dZ, closePlacements: 0 };
      const simulation = shouldSimulatePatterns
        ? pb_simulateLayerPattern(candidate, remainingUnits, packed, palL, palW, maxH)
        : {
            simulatedCount: estimate.closePlacements,
            simulatedArea: estimate.sameLayerArea,
            patternScore: candidate.score,
          };
      return {
        ...candidate,
        ...estimate,
        ...simulation,
      };
    });

  rankedCandidates.sort((a, b) => {
    if (Math.abs(a.patternScore - b.patternScore) > 0.01) return a.patternScore - b.patternScore;
    if (Math.abs(b.simulatedArea - a.simulatedArea) > 0.01) return b.simulatedArea - a.simulatedArea;
    if (b.simulatedCount !== a.simulatedCount) return b.simulatedCount - a.simulatedCount;
    if (Math.abs(b.sameLayerArea - a.sameLayerArea) > 0.01) return b.sameLayerArea - a.sameLayerArea;
    if (b.closePlacements !== a.closePlacements) return b.closePlacements - a.closePlacements;
    return a.score - b.score;
  });

  return rankedCandidates[0];
}

function pb_optimizePackedLayout(packed, unitsByUid, palL, palW, maxH) {
  let optimized = [...packed];
  const maxPasses = packed.length > 80 ? 1 : packed.length > 40 ? 2 : 3;

  for (let pass = 0; pass < maxPasses; pass++) {
    let movedInPass = false;
    const order = [...optimized].sort((a, b) => (b.y + b.dY) - (a.y + a.dY) || b.y - a.y);

    for (const placement of order) {
      const unit = unitsByUid.get(placement.uid);
      if (!unit) continue;

      const remaining = optimized.filter(item => item.uid !== placement.uid);
      const hm = pb_buildHMFromPacked(remaining, palL, palW);
      const candidates = pb_findLowestCandidatesForUnit(unit, remaining, hm, palL, palW, maxH);
      const candidate = candidates.sort((a, b) => a.score - b.score)[0];
      if (!candidate) continue;

      const lowersBase = candidate.y < placement.y - PB_HEIGHT_EPS;
      const lowersTop = candidate.y + candidate.ori.dY < placement.y + placement.dY - PB_HEIGHT_EPS;
      const improvesSameLevel = Math.abs(candidate.y - placement.y) <= PB_HEIGHT_EPS && candidate.score + 120 < placement.score;
      if (!lowersBase && !lowersTop && !improvesSameLevel) continue;

      const nextPlacement = {
        ...placement,
        x: candidate.px,
        y: candidate.y,
        z: candidate.pz,
        dX: candidate.ori.dX,
        dY: candidate.ori.dY,
        dZ: candidate.ori.dZ,
        score: candidate.score,
      };
      optimized = [...remaining, nextPlacement];
      movedInPass = true;
    }

    if (!movedInPass) break;
  }

  return optimized;
}

function pb_finalizeResultMeta(result, sourceProducts = result.products || []) {
  const boxes = result.boxes || [];
  const placedCounts = {};
  boxes.forEach(box => { placedCounts[box.id] = (placedCounts[box.id] || 0) + 1; });
  const totalHeight = boxes.reduce((maxY, box) => Math.max(maxY, box.y + box.dY), 0) + PB_PALLET_BASE_H;
  const products = sourceProducts.map(product => ({
    ...product,
    placedQty: placedCounts[product.id] || 0,
  }));
  const totalWeight = sourceProducts.reduce(
    (sum, product) => sum + (product.weight || 0) * (placedCounts[product.id] || 0),
    0
  );

  return {
    ...result,
    boxes,
    totalHeight,
    totalWeight,
    products,
  };
}

function pb_makeUnitFromBox(box, sourceProduct) {
  return {
    ...sourceProduct,
    id: box.id,
    uid: box.uid,
    color: box.color,
    name: box.name,
    mustBeBase: !!box.mustBeBase,
    noRotate: !!box.noRotate,
    dims: box.sourceDims ? {
      L: box.sourceDims.L,
      W: box.sourceDims.W,
      H: box.sourceDims.H,
    } : {
      L: box.dX,
      W: box.dZ,
      H: box.dY,
    },
  };
}

function pb_productsFromBoxes(boxes, sourceById) {
  const byId = new Map();

  for (const box of boxes) {
    if (!byId.has(box.id)) {
      const sourceProduct = sourceById.get(box.id) || {};
      byId.set(box.id, {
        ...sourceProduct,
        id: box.id,
        name: box.name || sourceProduct.name || 'Producto',
        color: box.color || sourceProduct.color,
        weight: Number(box.weight ?? sourceProduct.weight ?? 0),
        mustBeBase: !!(box.mustBeBase || sourceProduct.mustBeBase),
        noRotate: !!(box.noRotate || sourceProduct.noRotate),
        dims: box.sourceDims ? {
          L: box.sourceDims.L,
          W: box.sourceDims.W,
          H: box.sourceDims.H,
        } : {
          L: box.dX,
          W: box.dZ,
          H: box.dY,
        },
        qty: 0,
      });
    }
    byId.get(box.id).qty += 1;
  }

  return [...byId.values()];
}

export function pb_validatePlacement(boxes, movingBox, palL, palW, maxH, nextX, nextZ, nextDims = null) {
  const dX = nextDims?.dX ?? movingBox.dX;
  const dY = nextDims?.dY ?? movingBox.dY;
  const dZ = nextDims?.dZ ?? movingBox.dZ;
  const x = pb_roundToGrid(nextX);
  const z = pb_roundToGrid(nextZ);

  if (x < -PB_HEIGHT_EPS || z < -PB_HEIGHT_EPS) return { valid: false, reason: 'out-of-bounds' };
  if (x + dX > palL + PB_HEIGHT_EPS || z + dZ > palW + PB_HEIGHT_EPS) return { valid: false, reason: 'out-of-bounds' };

  const others = boxes.filter(box => box.uid !== movingBox.uid);
  const hm = pb_buildHMFromPacked(others, palL, palW);
  const plateau = pb_getPlateauStats(hm, x, z, dX, dZ);
  if (!plateau.flat) return { valid: false, reason: 'unsupported' };
  if (movingBox.mustBeBase && plateau.y > PB_HEIGHT_EPS) return { valid: false, reason: 'must-be-base' };
  if (plateau.y + dY > maxH + PB_HEIGHT_EPS) return { valid: false, reason: 'too-high' };

  const y = plateau.y;
  for (const other of others) {
    const overlapsX = x < other.x + other.dX - PB_HEIGHT_EPS && x + dX > other.x + PB_HEIGHT_EPS;
    const overlapsZ = z < other.z + other.dZ - PB_HEIGHT_EPS && z + dZ > other.z + PB_HEIGHT_EPS;
    const overlapsY = y < other.y + other.dY - PB_HEIGHT_EPS && y + dY > other.y + PB_HEIGHT_EPS;
    if (overlapsX && overlapsZ && overlapsY) {
      return { valid: false, reason: 'collision' };
    }
  }

  return { valid: true, x, y, z, dX, dY, dZ };
}

function pb_boxSupportOverlap(lower, upper) {
  const overlapX = Math.max(0, Math.min(lower.x + lower.dX, upper.x + upper.dX) - Math.max(lower.x, upper.x));
  const overlapZ = Math.max(0, Math.min(lower.z + lower.dZ, upper.z + upper.dZ) - Math.max(lower.z, upper.z));
  return overlapX * overlapZ;
}

function pb_directlySupports(lower, upper) {
  return Math.abs((lower.y + lower.dY) - upper.y) <= PB_HEIGHT_EPS && pb_boxSupportOverlap(lower, upper) > PB_HEIGHT_EPS;
}

export function pb_getSupportedStack(boxes, rootUid) {
  const group = new Set([rootUid]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const box of boxes) {
      if (group.has(box.uid)) continue;
      const hasGroupedSupport = boxes.some(support => group.has(support.uid) && pb_directlySupports(support, box));
      if (!hasGroupedSupport) continue;
      group.add(box.uid);
      changed = true;
    }
  }

  return [...group];
}

export function pb_validateGroupPlacement(boxes, rootUid, palL, palW, maxH, nextX, nextZ) {
  const root = boxes.find(box => box.uid === rootUid);
  if (!root) return { valid: false, reason: 'missing-root', groupUids: [], placements: [] };

  const x = pb_roundToGrid(nextX);
  const z = pb_roundToGrid(nextZ);
  const dx = x - root.x;
  const dz = z - root.z;
  const groupUids = pb_getSupportedStack(boxes, rootUid);
  const group = boxes.filter(box => groupUids.includes(box.uid));
  const staticBoxes = boxes.filter(box => !groupUids.includes(box.uid));
  const moved = group.map(box => ({
    ...box,
    x: pb_roundToGrid(box.x + dx),
    z: pb_roundToGrid(box.z + dz),
  }));

  for (const box of moved) {
    if (box.x < -PB_HEIGHT_EPS || box.z < -PB_HEIGHT_EPS) {
      return { valid: false, reason: 'out-of-bounds', groupUids, placements: moved };
    }
    if (box.x + box.dX > palL + PB_HEIGHT_EPS || box.z + box.dZ > palW + PB_HEIGHT_EPS) {
      return { valid: false, reason: 'out-of-bounds', groupUids, placements: moved };
    }
    if (box.y + box.dY > maxH + PB_HEIGHT_EPS) {
      return { valid: false, reason: 'too-high', groupUids, placements: moved };
    }
  }

  for (const box of moved) {
    if (pb_collides3D(staticBoxes, { x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, box.y, box.dY)) {
      return { valid: false, reason: 'collision', groupUids, placements: moved };
    }
  }

  for (const box of moved) {
    if (box.y <= PB_HEIGHT_EPS) continue;
    const supportRects = [...staticBoxes, ...moved]
      .filter(candidate => candidate.uid !== box.uid && Math.abs((candidate.y + candidate.dY) - box.y) <= PB_HEIGHT_EPS)
      .map(candidate => ({ x: candidate.x, z: candidate.z, dX: candidate.dX, dZ: candidate.dZ }));
    const support = pb_supportForRect({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, supportRects);
    if (!support.supported) {
      return { valid: false, reason: 'unsupported', groupUids, placements: moved };
    }
  }

  return {
    valid: true,
    groupUids,
    placements: moved.map(box => ({
      uid: box.uid,
      x: box.x,
      y: box.y,
      z: box.z,
      dX: box.dX,
      dY: box.dY,
      dZ: box.dZ,
    })),
  };
}

function pb_tryAppendUnitToPacked(unit, boxes, palL, palW, maxH) {
  const hm = pb_buildHMFromPacked(boxes, palL, palW);
  const candidates = pb_findLowestCandidatesForUnit(unit, boxes, hm, palL, palW, maxH)
    .sort((a, b) => a.score - b.score);
  const candidate = candidates[0];
  if (!candidate) return null;

  return {
    x: candidate.px,
    y: candidate.y,
    z: candidate.pz,
    dX: candidate.ori.dX,
    dY: candidate.ori.dY,
    dZ: candidate.ori.dZ,
    color: unit.color,
    name: unit.name,
    id: unit.id,
    uid: unit.uid,
    score: candidate.score,
    mustBeBase: !!unit.mustBeBase,
    noRotate: !!unit.noRotate,
    sourceDims: { ...unit.dims },
  };
}

function pb_nextUidForBoxId(boxes, id) {
  const used = new Set(boxes.map(box => box.uid));
  let idx = 0;
  let uid = `${id}::${idx}`;
  while (used.has(uid)) {
    idx += 1;
    uid = `${id}::${idx}`;
  }
  return uid;
}

function pb_rebalancePallets(pallets, products, palL, palW, maxH) {
  let working = pallets.map(pallet => ({
    ...pallet,
    boxes: pallet.boxes.map(box => ({ ...box })),
  }));
  const sourceById = new Map(products.map(product => [product.id, product]));

  for (let targetIdx = 0; targetIdx < working.length - 1; targetIdx++) {
    for (let sourceIdx = working.length - 1; sourceIdx > targetIdx; sourceIdx--) {
      let movedSomething = true;
      while (movedSomething) {
        movedSomething = false;
        const sourceBoxes = [...working[sourceIdx].boxes].sort((a, b) => {
          const aBase = a.mustBeBase ? 1 : 0;
          const bBase = b.mustBeBase ? 1 : 0;
          if (aBase !== bBase) return bBase - aBase;
          return (b.dX * b.dZ) - (a.dX * a.dZ);
        });

        for (const box of sourceBoxes) {
          const sourceProduct = sourceById.get(box.id) || { weight: 0 };
          const unit = pb_makeUnitFromBox(box, sourceProduct);
          const appended = pb_tryAppendUnitToPacked(unit, working[targetIdx].boxes, palL, palW, maxH);
          if (!appended) continue;

          appended.uid = pb_nextUidForBoxId(working[targetIdx].boxes, appended.id);
          working[targetIdx].boxes.push(appended);
          working[sourceIdx].boxes = working[sourceIdx].boxes.filter(item => item.uid !== box.uid);
          movedSomething = true;
          break;
        }
      }
    }
  }

  working = working
    .filter(pallet => pallet.boxes.length > 0)
    .map((pallet, idx) => pb_finalizeResultMeta({ ...pallet, idx }, products));

  return working;
}

function pb_mergeRepackPallets(pallets, products, palL, palW, maxH) {
  let working = pallets.map(pallet => ({
    ...pallet,
    boxes: pallet.boxes.map(box => ({ ...box })),
  }));
  const sourceById = new Map(products.map(product => [product.id, product]));

  for (let targetIdx = 0; targetIdx < working.length - 1; targetIdx++) {
    for (let sourceIdx = working.length - 1; sourceIdx > targetIdx; sourceIdx--) {
      const sourceCount = working[sourceIdx]?.boxes?.length || 0;
      if (!sourceCount || sourceCount > PB_REPACK_MERGE_MAX_SOURCE_UNITS) continue;

      const originalTargetBoxes = working[targetIdx].boxes.map(box => ({ ...box }));
      const combinedBoxes = [...originalTargetBoxes, ...working[sourceIdx].boxes];
      if (combinedBoxes.length > PB_REPACK_MERGE_MAX_UNITS) continue;

      const combinedProducts = pb_productsFromBoxes(combinedBoxes, sourceById);
      const repacked = pb_runPacking(combinedProducts, palL, palW, maxH);
      if (repacked.length <= working[targetIdx].boxes.length) continue;

      const repackedTop = repacked.reduce((maxY, box) => Math.max(maxY, box.y + box.dY), 0);
      if (repackedTop > maxH + PB_HEIGHT_EPS) continue;

      working[targetIdx].boxes = repacked;
      if (repacked.length >= combinedBoxes.length) {
        working[sourceIdx].boxes = [];
        continue;
      }

      const placedCounts = {};
      repacked.forEach(box => { placedCounts[box.id] = (placedCounts[box.id] || 0) + 1; });
      const remainingProducts = combinedProducts
        .map(product => ({
          ...product,
          qty: Math.max(0, (product.qty || 0) - (placedCounts[product.id] || 0)),
        }))
        .filter(product => product.qty > 0);
      const remainingCount = remainingProducts.reduce((sum, product) => sum + product.qty, 0);
      const remainingBoxes = remainingCount > 0
        ? pb_runPacking(remainingProducts, palL, palW, maxH)
        : [];

      if (remainingBoxes.length !== remainingCount) {
        working[targetIdx].boxes = originalTargetBoxes;
        continue;
      }

      working[sourceIdx].boxes = remainingBoxes;
    }
  }

  return working
    .filter(pallet => pallet.boxes.length > 0)
    .map((pallet, idx) => pb_finalizeResultMeta({ ...pallet, idx }, products));
}

function pb_polishPallets(pallets, products, palL, palW, maxH) {
  const sourceById = new Map(products.map(product => [product.id, product]));
  return pallets.map((pallet, idx) => {
    const unitsByUid = new Map();
    for (const box of pallet.boxes) {
      unitsByUid.set(box.uid, pb_makeUnitFromBox(box, sourceById.get(box.id) || { weight: 0 }));
    }
    const optimizedBoxes = pb_optimizePackedLayout(pallet.boxes, unitsByUid, palL, palW, maxH);
    return pb_finalizeResultMeta({ ...pallet, idx, boxes: optimizedBoxes }, products);
  });
}

function pb_finalizePallets(pallets, products, palL, palW, maxH) {
  let working = pallets;
  const totalUnits = products.reduce((sum, product) => sum + (product.qty || 0), 0);
  const hasSmallTail = working.some((pallet, idx) => idx > 0 && (pallet.boxes?.length || 0) <= PB_REBALANCE_MAX_SOURCE_UNITS);

  if (totalUnits > PB_REBALANCE_MAX_UNITS && !hasSmallTail) {
    return working
      .filter(pallet => pallet.boxes.length > 0)
      .map((pallet, idx) => pb_finalizeResultMeta({ ...pallet, idx }, products));
  }

  const maxPasses = hasSmallTail && totalUnits <= PB_REPACK_MERGE_MAX_UNITS ? 2 : totalUnits > 10 ? 1 : 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (totalUnits <= PB_REPACK_MERGE_MAX_UNITS) {
      working = pb_mergeRepackPallets(working, products, palL, palW, maxH);
    }
    working = pb_rebalancePallets(working, products, palL, palW, maxH);
    if (totalUnits <= PB_POLISH_MAX_UNITS) {
      working = pb_polishPallets(working, products, palL, palW, maxH);
    }
  }
  return working
    .filter(pallet => pallet.boxes.length > 0)
    .map((pallet, idx) => pb_finalizeResultMeta({ ...pallet, idx }, products));
}

function pb_sortUnitsForStrategy(units, strategy) {
  units.sort((a, b) => {
    const aBase = a.mustBeBase ? 1 : 0;
    const bBase = b.mustBeBase ? 1 : 0;
    if (aBase !== bBase) return bBase - aBase;

    const aVolume = a.dims.L * a.dims.W * a.dims.H;
    const bVolume = b.dims.L * b.dims.W * b.dims.H;
    const aFoot = Math.max(a.dims.L * a.dims.W, a.dims.L * a.dims.H, a.dims.W * a.dims.H);
    const bFoot = Math.max(b.dims.L * b.dims.W, b.dims.L * b.dims.H, b.dims.W * b.dims.H);
    const aMinH = Math.min(...pb_getOrientations(a, Infinity, Infinity).map(o => o.dY));
    const bMinH = Math.min(...pb_getOrientations(b, Infinity, Infinity).map(o => o.dY));
    const aMaxSide = Math.max(a.dims.L, a.dims.W, a.dims.H);
    const bMaxSide = Math.max(b.dims.L, b.dims.W, b.dims.H);

    if (strategy === 'low-height') {
      if (Math.abs(aMinH - bMinH) > 0.01) return aMinH - bMinH;
      return bFoot - aFoot;
    }

    if (strategy === 'footprint') {
      if (Math.abs(bFoot - aFoot) > 0.01) return bFoot - aFoot;
      return aMinH - bMinH;
    }

    if (strategy === 'long-side') {
      if (Math.abs(bMaxSide - aMaxSide) > 0.01) return bMaxSide - aMaxSide;
      return bVolume - aVolume;
    }

    if (strategy === 'count-fill') {
      if (Math.abs(aMinH - bMinH) > 0.01) return aMinH - bMinH;
      if (Math.abs(aVolume - bVolume) > 0.01) return aVolume - bVolume;
      return aFoot - bFoot;
    }

    if (Math.abs(bVolume - aVolume) > 0.01) return bVolume - aVolume;
    if (Math.abs(bFoot - aFoot) > 0.01) return bFoot - aFoot;
    return aMinH - bMinH;
  });
}

function pb_scorePackedLayout(packed, palL, palW, maxH) {
  if (!packed.length) return Infinity;
  const top = packed.reduce((maxY, box) => Math.max(maxY, box.y + box.dY), 0);
  const layerYs = [...new Set(packed.map(box => Math.round(box.y * 10) / 10))].sort((a, b) => a - b);
  let shapePenalty = 0;
  let isolatedPenalty = 0;
  let volume = 0;

  for (const y of layerYs) {
    const layer = packed.filter(box => Math.abs(box.y - y) <= PB_HEIGHT_EPS);
    const shape = pb_measureLayerShape(layer, palL, palW);
    const occupiedArea = shape.occupiedCells * PB_CELL_AREA;
    const bboxArea = shape.bboxCells * PB_CELL_AREA;
    shapePenalty += shape.holeCells * 280 + shape.holeCount * 3200 + Math.max(0, bboxArea - occupiedArea) * (y <= PB_HEIGHT_EPS ? 1.7 : 3.7) + shape.perimeter * 5;

    for (const box of layer) {
      const adjacency = pb_computeAdjacency(layer.filter(item => item !== box), box.x, box.z, box, box.y);
      if (layer.length > 1 && adjacency.sideContacts === 0) isolatedPenalty += y <= PB_HEIGHT_EPS ? 500 : 1400;
    }
  }

  for (const box of packed) {
    volume += box.dX * box.dY * box.dZ;
    const slenderness = box.dY / Math.max(box.dX, box.dZ, 1);
    if (box.y > PB_HEIGHT_EPS && slenderness > 1.1) isolatedPenalty += slenderness * 650;
  }

  const usedVolumeRatio = volume / Math.max(1, palL * palW * maxH);
  return top * 1500 + shapePenalty + isolatedPenalty - packed.length * 1200 - usedVolumeRatio * 18000;
}

function pb_runPackingFast(products, palL, palW, maxH) {
  const remaining = products
    .filter(product => (product.qty || 0) > 0)
    .map(product => ({ ...product, qty: product.qty || 0 }));
  const placedById = {};
  const packed = [];
  let y = 0;
  let layerSafety = 0;

  while (remaining.some(product => product.qty > 0) && layerSafety < 80) {
    layerSafety++;
    let best = null;
    const groups = new Map();

    for (const product of remaining) {
      if (product.qty <= 0) continue;
      if (product.mustBeBase && y > PB_HEIGHT_EPS) continue;

      const orientations = pb_getOrientations(product, palL, palW);
      for (const ori of orientations) {
        if (y + ori.dY > maxH + PB_HEIGHT_EPS) continue;
        const key = `${ori.dX}|${ori.dZ}|${ori.dY}|${product.mustBeBase ? 1 : 0}|${product.noRotate ? 1 : 0}`;
        if (!groups.has(key)) {
          groups.set(key, {
            ori,
            products: [],
            totalQty: 0,
            totalWeight: 0,
          });
        }
        const group = groups.get(key);
        group.products.push(product);
        group.totalQty += product.qty;
        group.totalWeight += product.qty * Number(product.weight || 0);
      }
    }

    for (const group of groups.values()) {
      const { ori } = group;
      const cols = Math.floor((palL + PB_HEIGHT_EPS) / ori.dX);
      const rows = Math.floor((palW + PB_HEIGHT_EPS) / ori.dZ);
      const capacity = cols * rows;
      if (capacity <= 0) continue;

      const count = Math.min(group.totalQty, capacity);
      const usedArea = count * ori.dX * ori.dZ;
      const fitRatio = usedArea / Math.max(1, palL * palW);
      const averageWeight = group.totalQty ? group.totalWeight / group.totalQty : 0;
      const score = count * 100000 + fitRatio * 10000 + usedArea + averageWeight * 40 - ori.dY * 120;
      if (!best || score > best.score) {
        best = { group, ori, cols, rows, count, score };
      }
    }

    if (!best) break;
    const groupProducts = best.group.products
      .filter(product => product.qty > 0)
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0) || (b.qty || 0) - (a.qty || 0));

    let placedThisLayer = 0;
    for (let row = 0; row < best.rows && placedThisLayer < best.count; row++) {
      for (let col = 0; col < best.cols && placedThisLayer < best.count; col++) {
        const product = groupProducts.find(item => item.qty > 0);
        if (!product) break;
        const idx = placedById[product.id] || 0;
        placedById[product.id] = idx + 1;
        packed.push({
          x: col * best.ori.dX,
          y,
          z: row * best.ori.dZ,
          dX: best.ori.dX,
          dY: best.ori.dY,
          dZ: best.ori.dZ,
          color: product.color,
          name: product.name,
          id: product.id,
          uid: `${product.id}::${idx}`,
          score: 0,
          weight: Number(product.weight || 0),
          mustBeBase: !!product.mustBeBase,
          noRotate: !!product.noRotate,
          sourceDims: { ...product.dims },
        });
        product.qty -= 1;
        placedThisLayer++;
      }
    }

    if (!placedThisLayer) break;
    y += best.ori.dY;
  }

  pb_topOffRemainingProducts(remaining, packed, placedById, palL, palW, maxH);
  return packed;
}

function pb_fastCandidateScore(candidate, packed, palL, palW) {
  const { px, pz, ori, y } = candidate;
  const layerPlacements = packed.filter(item => Math.abs(item.y - y) <= PB_HEIGHT_EPS);
  const adjacency = pb_computeAdjacency(layerPlacements, px, pz, ori, y);
  const topY = y + ori.dY;
  const centerX = px + ori.dX / 2;
  const centerZ = pz + ori.dZ / 2;
  const distToCenter = Math.hypot(centerX - palL / 2, centerZ - palW / 2);
  const touchesWall =
    (px <= PB_HEIGHT_EPS ? 1 : 0) +
    (pz <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs(px + ori.dX - palL) <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs(pz + ori.dZ - palW) <= PB_HEIGHT_EPS ? 1 : 0);
  const footprint = ori.dX * ori.dZ;
  const isBase = y <= PB_HEIGHT_EPS;

  return (
    topY * 100000 +
    y * 12000 +
    distToCenter * (isBase ? 4 : 16) +
    pz * 7 +
    px * 3 -
    adjacency.sharedEdge * 90 -
    adjacency.sideContacts * 420 -
    touchesWall * (isBase ? 650 : 120) -
    footprint * 1.15
  );
}

function pb_findGreedyCandidatesForUnit(unit, packed, hm, palL, palW, maxH) {
  const candidates = [];
  const orientations = pb_getOrientations(unit, palL, palW);

  for (const ori of orientations) {
    const anchors = pb_collectAnchors(packed, palL, palW, ori);
    for (const anchor of anchors) {
      const px = Math.max(0, pb_roundToGrid(anchor.x));
      const pz = Math.max(0, pb_roundToGrid(anchor.z));
      const plateau = pb_getPlateauStats(hm, px, pz, ori.dX, ori.dZ);
      if (!plateau.flat) continue;
      if (plateau.y + ori.dY > maxH + PB_HEIGHT_EPS) continue;
      if (unit.mustBeBase && plateau.y > PB_HEIGHT_EPS) continue;
      const candidate = { unit, px, pz, ori, y: plateau.y };
      candidates.push({
        ...candidate,
        score: pb_fastCandidateScore(candidate, packed, palL, palW),
      });
    }
  }

  return candidates.sort((a, b) => a.score - b.score);
}

function pb_rectsOverlap(a, b) {
  return (
    a.x < b.x + b.dX - PB_HEIGHT_EPS &&
    a.x + a.dX > b.x + PB_HEIGHT_EPS &&
    a.z < b.z + b.dZ - PB_HEIGHT_EPS &&
    a.z + a.dZ > b.z + PB_HEIGHT_EPS
  );
}

function pb_supportForRect(rect, supportRects) {
  if (!supportRects?.length) return { supported: false, supportPercent: 0, centerSupported: false };
  const centerX = rect.x + rect.dX / 2;
  const centerZ = rect.z + rect.dZ / 2;
  const baseArea = Math.max(1, rect.dX * rect.dZ);
  let supportArea = 0;
  let centerSupported = false;

  for (const support of supportRects) {
    const overlapX = Math.max(0, Math.min(rect.x + rect.dX, support.x + support.dX) - Math.max(rect.x, support.x));
    const overlapZ = Math.max(0, Math.min(rect.z + rect.dZ, support.z + support.dZ) - Math.max(rect.z, support.z));
    supportArea += overlapX * overlapZ;
    if (
      centerX >= support.x - PB_HEIGHT_EPS &&
      centerX <= support.x + support.dX + PB_HEIGHT_EPS &&
      centerZ >= support.z - PB_HEIGHT_EPS &&
      centerZ <= support.z + support.dZ + PB_HEIGHT_EPS
    ) {
      centerSupported = true;
    }
  }

  const supportPercent = Math.min(1, supportArea / baseArea);
  return {
    supported: supportPercent >= 0.8 && centerSupported,
    supportPercent,
    centerSupported,
  };
}

function pb_collectLayerAnchors(placements, palL, palW, ori) {
  const maxX = Math.max(0, pb_roundToGrid(palL - ori.dX));
  const maxZ = Math.max(0, pb_roundToGrid(palW - ori.dZ));
  const xs = new Set([0, maxX, pb_roundToGrid((palL - ori.dX) / 2)]);
  const zs = new Set([0, maxZ, pb_roundToGrid((palW - ori.dZ) / 2)]);

  for (const box of placements) {
    xs.add(pb_roundToGrid(box.x));
    xs.add(pb_roundToGrid(box.x + box.dX));
    xs.add(pb_roundToGrid(box.x - ori.dX));
    xs.add(pb_roundToGrid(box.x + box.dX - ori.dX));

    zs.add(pb_roundToGrid(box.z));
    zs.add(pb_roundToGrid(box.z + box.dZ));
    zs.add(pb_roundToGrid(box.z - ori.dZ));
    zs.add(pb_roundToGrid(box.z + box.dZ - ori.dZ));
  }

  const anchors = [];
  const xList = [...xs].filter(x => x >= -PB_HEIGHT_EPS && x <= maxX + PB_HEIGHT_EPS).sort((a, b) => a - b);
  const zList = [...zs].filter(z => z >= -PB_HEIGHT_EPS && z <= maxZ + PB_HEIGHT_EPS).sort((a, b) => a - b);
  for (const x of xList) {
    for (const z of zList) anchors.push({ x: Math.max(0, x), z: Math.max(0, z) });
  }
  return anchors;
}

function pb_supportCoverage(supportRects, palL, palW) {
  const supportArea = supportRects.reduce((sum, rect) => sum + rect.dX * rect.dZ, 0);
  return supportArea / Math.max(1, palL * palW);
}

function pb_buildLayerOptions(products, palL, palW, remainingHeight, layerH = null) {
  const options = [];
  for (const product of products) {
    if ((product.qty || 0) <= 0) continue;
    for (const ori of pb_getOrientations(product, palL, palW)) {
      if (ori.dY > remainingHeight + PB_HEIGHT_EPS) continue;
      if (layerH != null && Math.abs(ori.dY - layerH) > PB_HEIGHT_EPS) continue;
      options.push({
        product,
        ori,
        area: ori.dX * ori.dZ,
        weight: Number(product.weight || 0),
      });
    }
  }

  return options.sort((a, b) => {
    const areaDiff = b.area - a.area;
    if (Math.abs(areaDiff) > 0.01) return areaDiff;
    const weightDiff = b.weight - a.weight;
    if (Math.abs(weightDiff) > 0.01) return weightDiff;
    return Math.max(b.ori.dX, b.ori.dZ) - Math.max(a.ori.dX, a.ori.dZ);
  });
}

function pb_scoreFastLayerPlacement(option, rect, placements, palL, palW, support) {
  const centerX = rect.x + rect.dX / 2;
  const centerZ = rect.z + rect.dZ / 2;
  const distToCenter = Math.hypot(centerX - palL / 2, centerZ - palW / 2);
  let sharedEdge = 0;
  for (const box of placements) {
    const overlapX = Math.max(0, Math.min(rect.x + rect.dX, box.x + box.dX) - Math.max(rect.x, box.x));
    const overlapZ = Math.max(0, Math.min(rect.z + rect.dZ, box.z + box.dZ) - Math.max(rect.z, box.z));
    const touchesX = Math.abs(rect.x + rect.dX - box.x) <= PB_HEIGHT_EPS || Math.abs(box.x + box.dX - rect.x) <= PB_HEIGHT_EPS;
    const touchesZ = Math.abs(rect.z + rect.dZ - box.z) <= PB_HEIGHT_EPS || Math.abs(box.z + box.dZ - rect.z) <= PB_HEIGHT_EPS;
    if (touchesX && overlapZ > PB_HEIGHT_EPS) sharedEdge += overlapZ;
    if (touchesZ && overlapX > PB_HEIGHT_EPS) sharedEdge += overlapX;
  }
  const touchesWall =
    (rect.x <= PB_HEIGHT_EPS ? 1 : 0) +
    (rect.z <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs(rect.x + rect.dX - palL) <= PB_HEIGHT_EPS ? 1 : 0) +
    (Math.abs(rect.z + rect.dZ - palW) <= PB_HEIGHT_EPS ? 1 : 0);

  return (
    distToCenter * 10 +
    option.ori.dY * 42 -
    rect.dX * rect.dZ * 5.7 -
    option.weight * 24 -
    sharedEdge * 95 -
    touchesWall * 220 -
    support.supportPercent * 1800
  );
}

function pb_fillLayerGaps(products, placements, placedCounts, remaining, palL, palW, remainingHeight, supportRects) {
  const options = pb_buildLayerOptions(products, palL, palW, remainingHeight);
  let safety = 0;

  while (safety < 300) {
    safety++;
    let best = null;

    for (const option of options) {
      const qtyLeft = remaining.get(option.product.id) || 0;
      if (qtyLeft <= 0) continue;

      const anchors = pb_collectLayerAnchors(placements, palL, palW, option.ori);
      for (const anchor of anchors) {
        const candidateRect = { x: anchor.x, z: anchor.z, dX: option.ori.dX, dZ: option.ori.dZ };
        if (candidateRect.x + candidateRect.dX > palL + PB_HEIGHT_EPS) continue;
        if (candidateRect.z + candidateRect.dZ > palW + PB_HEIGHT_EPS) continue;
        if (placements.some(box => pb_rectsOverlap(candidateRect, box))) continue;

        const support = pb_supportForRect(candidateRect, supportRects);
        if (!support.supported) continue;

        const score = pb_scoreFastLayerPlacement(option, candidateRect, placements, palL, palW, support);

        if (!best || score < best.score) {
          best = { ...option, x: candidateRect.x, z: candidateRect.z, score };
        }
      }
    }

    if (!best) break;
    const idx = placedCounts[best.product.id] || 0;
    placedCounts[best.product.id] = idx + 1;
    remaining.set(best.product.id, (remaining.get(best.product.id) || 0) - 1);
    placements.push({
      x: best.x,
      z: best.z,
      dX: best.ori.dX,
      dY: best.ori.dY,
      dZ: best.ori.dZ,
      color: best.product.color,
      name: best.product.name,
      id: best.product.id,
      uid: `${best.product.id}::fill::${idx}`,
      score: best.score,
      weight: best.weight,
      mustBeBase: !!best.product.mustBeBase,
      noRotate: !!best.product.noRotate,
      sourceDims: { ...best.product.dims },
    });
  }
}

function pb_buildDenseGridSeed(option, supportRects, palL, palW) {
  const cols = Math.floor((palL + PB_HEIGHT_EPS) / option.ori.dX);
  const rows = Math.floor((palW + PB_HEIGHT_EPS) / option.ori.dZ);
  const maxQty = Math.min(option.product.qty || 0, cols * rows);
  if (cols <= 0 || rows <= 0 || maxQty <= 0) return null;

  const placements = [];
  const placedCounts = { [option.product.id]: 0 };

  for (let row = 0; row < rows && placements.length < maxQty; row++) {
    for (let col = 0; col < cols && placements.length < maxQty; col++) {
      const rect = {
        x: pb_roundToGrid(col * option.ori.dX),
        z: pb_roundToGrid(row * option.ori.dZ),
        dX: option.ori.dX,
        dZ: option.ori.dZ,
      };
      const support = pb_supportForRect(rect, supportRects);
      if (!support.supported) continue;

      const idx = placedCounts[option.product.id] || 0;
      placedCounts[option.product.id] = idx + 1;
      placements.push({
        x: rect.x,
        z: rect.z,
        dX: option.ori.dX,
        dY: option.ori.dY,
        dZ: option.ori.dZ,
        color: option.product.color,
        name: option.product.name,
        id: option.product.id,
        uid: `${option.product.id}::grid::${idx}`,
        score: 0,
        weight: option.weight,
        mustBeBase: !!option.product.mustBeBase,
        noRotate: !!option.product.noRotate,
        sourceDims: { ...option.product.dims },
      });
    }
  }

  if (!placements.length) return null;

  const area = placements.reduce((sum, box) => sum + box.dX * box.dZ, 0);
  const supportArea = supportRects.reduce((sum, rect) => sum + rect.dX * rect.dZ, 0);
  const coverage = area / Math.max(1, supportArea);
  const shape = pb_measureLayerShape(
    placements.map(box => ({ x: box.x, y: 0, z: box.z, dX: box.dX, dY: box.dY, dZ: box.dZ })),
    palL,
    palW
  );

  return {
    placements,
    placedCounts,
    area,
    coverage,
    score:
      coverage * 100000 +
      placements.length * 320 +
      area * 2 -
      option.ori.dY * 780 -
      shape.holeCells * 100 -
      shape.holeCount * 1600,
  };
}

function pb_collectSupportAnchors(supportRects, layerPlacements, palL, palW, ori) {
  const maxX = Math.max(0, pb_roundToGrid(palL - ori.dX));
  const maxZ = Math.max(0, pb_roundToGrid(palW - ori.dZ));
  const xs = new Set();
  const zs = new Set();

  for (const anchor of pb_collectLayerAnchors(layerPlacements, palL, palW, ori)) {
    xs.add(pb_roundToGrid(anchor.x));
    zs.add(pb_roundToGrid(anchor.z));
  }

  for (const support of supportRects) {
    xs.add(pb_roundToGrid(support.x));
    xs.add(pb_roundToGrid(support.x + support.dX - ori.dX));
    xs.add(pb_roundToGrid(support.x + (support.dX - ori.dX) / 2));
    xs.add(pb_roundToGrid(support.x + support.dX));
    xs.add(pb_roundToGrid(support.x - ori.dX));

    zs.add(pb_roundToGrid(support.z));
    zs.add(pb_roundToGrid(support.z + support.dZ - ori.dZ));
    zs.add(pb_roundToGrid(support.z + (support.dZ - ori.dZ) / 2));
    zs.add(pb_roundToGrid(support.z + support.dZ));
    zs.add(pb_roundToGrid(support.z - ori.dZ));
  }

  const anchors = [];
  for (const x of [...xs].filter(x => x >= -PB_HEIGHT_EPS && x <= maxX + PB_HEIGHT_EPS).sort((a, b) => a - b)) {
    for (const z of [...zs].filter(z => z >= -PB_HEIGHT_EPS && z <= maxZ + PB_HEIGHT_EPS).sort((a, b) => a - b)) {
      anchors.push({ x: Math.max(0, x), z: Math.max(0, z) });
    }
  }
  return anchors;
}

function pb_collides3D(packed, rect, y, dY) {
  return packed.some(box => {
    const overlapsX = rect.x < box.x + box.dX - PB_HEIGHT_EPS && rect.x + rect.dX > box.x + PB_HEIGHT_EPS;
    const overlapsZ = rect.z < box.z + box.dZ - PB_HEIGHT_EPS && rect.z + rect.dZ > box.z + PB_HEIGHT_EPS;
    const overlapsY = y < box.y + box.dY - PB_HEIGHT_EPS && y + dY > box.y + PB_HEIGHT_EPS;
    return overlapsX && overlapsZ && overlapsY;
  });
}

function pb_topOffRemainingProducts(remaining, packed, uidCounters, palL, palW, maxH) {
  let safety = 0;

  while (remaining.some(product => product.qty > 0) && safety < 400) {
    safety++;
    const levels = [
      0,
      ...packed
        .map(box => Math.round((box.y + box.dY) * 10) / 10)
        .filter(level => level > PB_HEIGHT_EPS && level < maxH - PB_HEIGHT_EPS),
    ].filter((level, index, arr) => arr.indexOf(level) === index).sort((a, b) => a - b);

    let best = null;

    for (const y of levels) {
      const supportRects = y <= PB_HEIGHT_EPS
        ? [{ x: 0, z: 0, dX: palL, dZ: palW }]
        : packed
            .filter(box => Math.abs((box.y + box.dY) - y) <= PB_HEIGHT_EPS)
            .map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }));
      if (!supportRects.length) continue;

      const layerPlacements = packed.filter(box => Math.abs(box.y - y) <= PB_HEIGHT_EPS);
      for (const product of remaining) {
        if (product.qty <= 0) continue;
        if (product.mustBeBase && y > PB_HEIGHT_EPS) continue;

        for (const ori of pb_getOrientations(product, palL, palW)) {
          if (y + ori.dY > maxH + PB_HEIGHT_EPS) continue;
          const option = {
            product,
            ori,
            area: ori.dX * ori.dZ,
            weight: Number(product.weight || 0),
          };

          for (const anchor of pb_collectSupportAnchors(supportRects, layerPlacements, palL, palW, ori)) {
            const rect = { x: anchor.x, z: anchor.z, dX: ori.dX, dZ: ori.dZ };
            if (rect.x + rect.dX > palL + PB_HEIGHT_EPS) continue;
            if (rect.z + rect.dZ > palW + PB_HEIGHT_EPS) continue;
            if (pb_collides3D(packed, rect, y, ori.dY)) continue;

            const support = pb_supportForRect(rect, supportRects);
            if (!support.supported) continue;

            const score =
              y * 900 +
              pb_scoreFastLayerPlacement(option, rect, layerPlacements, palL, palW, support) -
              option.area * 1.5 -
              support.supportPercent * 900;

            if (!best || score < best.score) {
              best = { product, ori, x: rect.x, z: rect.z, y, score };
            }
          }
        }
      }
    }

    if (!best) break;
    const idx = uidCounters[best.product.id] || 0;
    uidCounters[best.product.id] = idx + 1;
    best.product.qty -= 1;
    packed.push({
      x: best.x,
      y: best.y,
      z: best.z,
      dX: best.ori.dX,
      dY: best.ori.dY,
      dZ: best.ori.dZ,
      color: best.product.color,
      name: best.product.name,
      id: best.product.id,
      uid: `${best.product.id}::${idx}`,
      score: best.score,
      weight: Number(best.product.weight || 0),
      mustBeBase: !!best.product.mustBeBase,
      noRotate: !!best.product.noRotate,
      sourceDims: { ...best.product.dims },
    });
  }
}

function pb_packLayerForHeight(products, palL, palW, layerH, supportRects, allowMixedFill = false) {
  const remaining = new Map();
  for (const product of products) {
    if ((product.qty || 0) <= 0) continue;
    remaining.set(product.id, product.qty || 0);
  }

  const options = pb_buildLayerOptions(products, palL, palW, layerH, layerH);
  let bestSeed = null;
  for (const option of options) {
    const seed = pb_buildDenseGridSeed(option, supportRects, palL, palW);
    if (!seed || seed.coverage < 0.82) continue;
    if (!bestSeed || seed.score > bestSeed.score) bestSeed = seed;
  }

  const placements = bestSeed ? bestSeed.placements.map(box => ({ ...box })) : [];
  const placedCounts = bestSeed ? { ...bestSeed.placedCounts } : {};
  for (const [productId, count] of Object.entries(placedCounts)) {
    const key = [...remaining.keys()].find(value => String(value) === productId);
    if (key != null) remaining.set(key, Math.max(0, (remaining.get(key) || 0) - count));
  }
  let safety = 0;

  while (safety < 500) {
    safety++;
    let best = null;

    for (const option of options) {
      const qtyLeft = remaining.get(option.product.id) || 0;
      if (qtyLeft <= 0) continue;

      const anchors = pb_collectLayerAnchors(placements, palL, palW, option.ori);
      for (const anchor of anchors) {
        const candidateRect = { x: anchor.x, z: anchor.z, dX: option.ori.dX, dZ: option.ori.dZ };
        if (candidateRect.x + candidateRect.dX > palL + PB_HEIGHT_EPS) continue;
        if (candidateRect.z + candidateRect.dZ > palW + PB_HEIGHT_EPS) continue;
        if (placements.some(box => pb_rectsOverlap(candidateRect, box))) continue;
        const support = pb_supportForRect(candidateRect, supportRects);
        if (!support.supported) continue;
        const score = pb_scoreFastLayerPlacement(option, candidateRect, placements, palL, palW, support);
        if (!best || score < best.score) {
          best = { ...option, x: candidateRect.x, z: candidateRect.z, score };
        }
      }
    }

    if (!best) break;
    const idx = placedCounts[best.product.id] || 0;
    placedCounts[best.product.id] = idx + 1;
    remaining.set(best.product.id, (remaining.get(best.product.id) || 0) - 1);
    placements.push({
      x: best.x,
      z: best.z,
      dX: best.ori.dX,
      dY: best.ori.dY,
      dZ: best.ori.dZ,
      color: best.product.color,
      name: best.product.name,
      id: best.product.id,
      uid: `${best.product.id}::layer::${idx}`,
      score: best.score,
      weight: best.weight,
      mustBeBase: !!best.product.mustBeBase,
      noRotate: !!best.product.noRotate,
      sourceDims: { ...best.product.dims },
    });
  }

  if (allowMixedFill) {
    pb_fillLayerGaps(products, placements, placedCounts, remaining, palL, palW, layerH, supportRects);
  }

  const area = placements.reduce((sum, box) => sum + box.dX * box.dZ, 0);
  const shape = pb_measureLayerShape(
    placements.map(box => ({ x: box.x, y: 0, z: box.z, dX: box.dX, dY: box.dY, dZ: box.dZ })),
    palL,
    palW
  );
  const supportArea = supportRects.reduce((sum, rect) => sum + rect.dX * rect.dZ, 0);
  const coverage = area / Math.max(1, supportArea);
  const compactness = shape.bboxCells > 0 ? shape.occupiedCells / shape.bboxCells : 0;
  const totalWeight = placements.reduce((sum, box) => sum + Number(box.weight || 0), 0);
  const averageArea = placements.length ? area / placements.length : 0;
  return { placements, placedCounts, area, coverage, compactness, layerH, shape, totalWeight, averageArea };
}

function pb_chooseDenseLayer(products, palL, palW, remainingHeight, supportRects) {
  const heights = new Set();
  for (const product of products) {
    if ((product.qty || 0) <= 0) continue;
    for (const ori of pb_getOrientations(product, palL, palW)) {
      if (ori.dY <= remainingHeight + PB_HEIGHT_EPS) heights.add(Math.round(ori.dY * 10) / 10);
    }
  }

  let best = null;
  for (const layerH of heights) {
    const layer = pb_packLayerForHeight(products, palL, palW, layerH, supportRects, true);
    if (!layer.placements.length) continue;
    const score =
      layer.coverage * 140000 +
      layer.compactness * 20000 +
      layer.placements.length * 240 -
      layer.shape.holeCells * 80 -
      layer.shape.holeCount * 1400 -
      layer.layerH * 520 +
      layer.totalWeight * 30 +
      layer.averageArea * 2.4;
    if (!best || score > best.score) best = { ...layer, score };
  }
  return best;
}

function pb_runPackingLayered(products, palL, palW, maxH) {
  const remaining = products
    .filter(product => (product.qty || 0) > 0)
    .map(product => ({ ...product, qty: product.qty || 0 }));
  const packed = [];
  const uidCounters = {};
  const processedLevels = new Set();
  let safety = 0;

  while (remaining.some(product => product.qty > 0) && safety < 120) {
    safety++;
    const levels = [
      0,
      ...packed
        .map(box => Math.round((box.y + box.dY) * 10) / 10)
        .filter(level => level > PB_HEIGHT_EPS && level < maxH - PB_HEIGHT_EPS),
    ].filter((level, index, arr) => arr.indexOf(level) === index).sort((a, b) => a - b);

    let placedThisPass = false;

    for (const y of levels) {
      if (processedLevels.has(y)) continue;
      const supportRects = y <= PB_HEIGHT_EPS
        ? [{ x: 0, z: 0, dX: palL, dZ: palW }]
        : packed
            .filter(box => Math.abs((box.y + box.dY) - y) <= PB_HEIGHT_EPS)
            .map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }));
      if (!supportRects.length) {
        processedLevels.add(y);
        continue;
      }
      if (y > PB_HEIGHT_EPS && pb_supportCoverage(supportRects, palL, palW) < PB_MIN_LAYER_SUPPORT_COVERAGE) {
        processedLevels.add(y);
        continue;
      }

      const chosenLayer = pb_chooseDenseLayer(remaining, palL, palW, maxH - y, supportRects);
      processedLevels.add(y);
      if (!chosenLayer || !chosenLayer.placements.length) continue;

      const layer = pb_packLayerForHeight(remaining, palL, palW, chosenLayer.layerH, supportRects, true);
      if (!layer || !layer.placements.length) continue;

      for (const box of layer.placements) {
        const idx = uidCounters[box.id] || 0;
        uidCounters[box.id] = idx + 1;
        packed.push({
          ...box,
          y,
          uid: `${box.id}::${idx}`,
        });
      }

      for (const product of remaining) {
        product.qty -= layer.placedCounts[product.id] || 0;
      }

      placedThisPass = true;
      break;
    }

    if (!placedThisPass) break;
  }

  pb_topOffRemainingProducts(remaining, packed, uidCounters, palL, palW, maxH);
  return packed;
}

function pb_runPackingGreedy(products, palL, palW, maxH, strategy = 'footprint') {
  const packed = [];
  const units = [];

  for (const p of products.filter(p => (p.qty || 0) > 0)) {
    for (let i = 0; i < p.qty; i++) {
      units.push({ ...p, _idx: i, _sourceId: p.id, uid: `${p.id}::${i}` });
    }
  }

  pb_sortUnitsForStrategy(units, strategy);
  const hm = pb_makeHM(palW, palL);
  let safety = 0;

  while (units.length && safety < 1000) {
    safety++;
    let best = null;
    const scanLimit = strategy === 'count-fill'
      ? (units.length > 120 ? 14 : units.length > 60 ? 20 : 32)
      : (units.length > 120 ? 8 : units.length > 60 ? 12 : 18);
    const seen = new Set();
    let scanned = 0;

    for (let unitIdx = 0; unitIdx < units.length; unitIdx++) {
      const unit = units[unitIdx];
      const signature = pb_unitSignature(unit);
      if (seen.has(signature)) continue;
      seen.add(signature);
      scanned++;
      if (scanned > scanLimit) break;

      const candidates = pb_findGreedyCandidatesForUnit(unit, packed, hm, palL, palW, maxH);
      if (!candidates.length) continue;
      const candidate = candidates[0];
      const unitVolume = unit.dims.L * unit.dims.W * unit.dims.H;
      const score = strategy === 'count-fill'
        ? candidate.score + unitVolume * 0.03 - candidate.ori.dY * 800
        : candidate.score - unitVolume * 0.08;
      if (!best || score < best.score) {
        best = { ...candidate, unitIdx, score };
      }
    }

    if (!best) break;
    const { unitIdx, unit, px, pz, ori, y, score } = best;
    pb_hmSet(hm, px, pz, ori.dX, ori.dZ, y + ori.dY);
    packed.push({
      x: px,
      y,
      z: pz,
      dX: ori.dX,
      dY: ori.dY,
      dZ: ori.dZ,
      color: unit.color,
      name: unit.name,
      id: unit.id,
      uid: unit.uid,
      score,
      mustBeBase: !!unit.mustBeBase,
      noRotate: !!unit.noRotate,
      sourceDims: { ...unit.dims },
    });
    units.splice(unitIdx, 1);
  }

  return packed;
}

function pb_runPackingCore(products, palL, palW, maxH, strategy = 'balanced') {
  const packed = [];
  const units = [];
  const unitsByUid = new Map();

  for (const p of products.filter(p => (p.qty || 0) > 0)) {
    for (let i = 0; i < p.qty; i++) {
      const unit = { ...p, _idx: i, _sourceId: p.id, uid: `${p.id}::${i}` };
      units.push(unit);
      unitsByUid.set(unit.uid, unit);
    }
  }

  pb_sortUnitsForStrategy(units, strategy);
  const totalUnits = units.length;

  const hm = pb_makeHM(palW, palL);
  let safety = 0;

  while (units.length && safety < 500) {
    safety++;
    const bestCandidate = pb_chooseBestCandidate(units, packed, hm, palL, palW, maxH);
    if (!bestCandidate) break;

    const { unitIdx, unit, px, pz, ori, y, score } = bestCandidate;
    pb_hmSet(hm, px, pz, ori.dX, ori.dZ, y + ori.dY);
    packed.push({
      x: px, y, z: pz,
      dX: ori.dX, dY: ori.dY, dZ: ori.dZ,
      color: unit.color, name: unit.name, id: unit.id, uid: unit.uid, score,
      mustBeBase: !!unit.mustBeBase,
      noRotate: !!unit.noRotate,
      sourceDims: { ...unit.dims },
    });
    units.splice(unitIdx, 1);
  }

  return totalUnits > 80 ? packed : pb_optimizePackedLayout(packed, unitsByUid, palL, palW, maxH);
}

export function pb_runPacking(products, palL, palW, maxH) {
  const totalUnits = products.reduce((sum, product) => sum + (product.qty || 0), 0);
  const chooseBest = (candidates) => {
    let bestPacked = [];
    let bestScore = Infinity;

    for (const packed of candidates) {
      if (!packed?.length) continue;
      const score = pb_scorePackedLayout(packed, palL, palW, maxH);
      if (
        packed.length > bestPacked.length ||
        (packed.length === bestPacked.length && score < bestScore)
      ) {
        bestPacked = packed;
        bestScore = score;
      }
    }

    return bestPacked;
  };

  if (totalUnits > PB_PRECISE_MAX_UNITS) {
    const candidates = [pb_runPackingLayered(products, palL, palW, maxH)];

    if (totalUnits <= PB_MULTI_STRATEGY_MAX_UNITS) {
      candidates.push(
        pb_runPackingGreedy(products, palL, palW, maxH),
        pb_runPackingGreedy(products, palL, palW, maxH, 'count-fill'),
        pb_runPackingFast(products, palL, palW, maxH)
      );

      if (totalUnits <= 18) {
        candidates.push(
          pb_runPackingCore(products, palL, palW, maxH, 'balanced'),
          pb_runPackingCore(products, palL, palW, maxH, 'footprint'),
          pb_runPackingCore(products, palL, palW, maxH, 'low-height'),
          pb_runPackingCore(products, palL, palW, maxH, 'long-side')
        );
      }
    }

    return chooseBest(candidates);
  }

  const strategies = totalUnits > 8
    ? ['balanced']
    : ['balanced', 'footprint'];
  return chooseBest(strategies.map(strategy => pb_runPackingCore(products, palL, palW, maxH, strategy)));
}

const usePalletStore = create((set, get) => ({
  palletType:   'eua',
  maxHeight:    180,
  products:     [],
  results:      [],
  activeResult: 0,
  editingId:    null,
  selectedBoxUid: null,

  setPalletType(type) {
    set({ palletType: type });
  },

  setMaxHeight(h) {
    set({ maxHeight: parseInt(h) || 180 });
  },

  addOrUpdateProduct(prod) {
    const { products, editingId } = get();
    if (editingId != null) {
      set({
        products: products.map(p => p.id === editingId ? { ...prod, id: editingId } : p),
        editingId: null,
      });
    } else {
      const color = PB_COLORS[products.length % PB_COLORS.length];
      set({ products: [...products, { ...prod, id: Date.now() + Math.random(), color }] });
    }
  },

  removeProduct(id) {
    set(s => ({ products: s.products.filter(p => p.id !== id) }));
  },

  setEditingId(id) { set({ editingId: id }); },

  build() {
    const { products, palletType, maxHeight } = get();
    if (!products.length) return;
    const pt = PB_PALLET_TYPES[palletType];
    const palL = pt.L, palW = pt.W;

    const pallets = [];
    let remaining = products.map(p => ({ ...p }));

    while (remaining.some(p => p.qty > 0)) {
      const boxes = pb_runPacking(
        remaining.filter(p => p.qty > 0),
        palL, palW, maxHeight
      );
      if (!boxes.length) break;

      pallets.push({
        idx: pallets.length,
        type: palletType,
        palL, palW, maxHeight,
        boxes,
        totalHeight: 0,
        totalWeight: 0,
        products: products.map(p => ({ ...p, placedQty: 0 })),
      });

      const placedCounts = {};
      boxes.forEach(b => { placedCounts[b.id] = (placedCounts[b.id] || 0) + 1; });

      remaining = remaining.map(p => ({
        ...p,
        qty: p.qty - (placedCounts[p.id] || 0),
      }));

      if (pallets.length > 50) break; // safety
    }

    const finalized = pb_finalizePallets(pallets, products, palL, palW, maxHeight);
    set({ results: finalized, activeResult: 0, selectedBoxUid: null });
  },

  setActiveResult(idx) { set({ activeResult: idx }); },
  setSelectedBoxUid(uid) { set({ selectedBoxUid: uid }); },

  updateActiveResultBoxes(nextBoxes) {
    const { results, activeResult } = get();
    if (!results[activeResult]) return;
    const updated = [...results];
    updated[activeResult] = pb_finalizeResultMeta(
      { ...updated[activeResult], boxes: nextBoxes.map(box => ({ ...box })) },
      updated[activeResult].products || []
    );
    set({ results: updated });
  },

  removeBoxFromActiveResult(uid) {
    const { results, activeResult, selectedBoxUid } = get();
    if (!results[activeResult]) return;
    const updated = [...results];
    const nextBoxes = updated[activeResult].boxes.filter(box => box.uid !== uid);
    updated[activeResult] = pb_finalizeResultMeta(
      { ...updated[activeResult], boxes: nextBoxes },
      updated[activeResult].products || []
    );
    set({ results: updated, selectedBoxUid: selectedBoxUid === uid ? null : selectedBoxUid });
  },

  clearResults() { set({ results: [], activeResult: 0, selectedBoxUid: null }); },
}));

export default usePalletStore;
