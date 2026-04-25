import { create } from 'zustand';
import { PB_COLORS, PB_PALLET_TYPES } from '../lib/constants.js';

export const PB_GRID_RES = 2;
const PB_HEIGHT_EPS = 0.1;
const PB_CELL_AREA = PB_GRID_RES * PB_GRID_RES;
export const PB_PALLET_BASE_H = 14;

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

function pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH) {
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

  for (let unitIdx = 0; unitIdx < remainingUnits.length; unitIdx++) {
    const unit = remainingUnits[unitIdx];
    if (unit.uid === candidate.unit.uid) continue;
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

  for (let unitIdx = 0; unitIdx < remainingUnits.length; unitIdx++) {
    const unit = remainingUnits[unitIdx];
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

  const rankedCandidates = layerCandidates
    .sort((a, b) => a.score - b.score)
    .slice(0, 14)
    .map(candidate => ({
      ...candidate,
      ...pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH),
      ...pb_simulateLayerPattern(candidate, remainingUnits, packed, palL, palW, maxH),
    }));

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

  for (let pass = 0; pass < 3; pass++) {
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
  for (let pass = 0; pass < 2; pass++) {
    working = pb_rebalancePallets(working, products, palL, palW, maxH);
    working = pb_polishPallets(working, products, palL, palW, maxH);
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

  return pb_optimizePackedLayout(packed, unitsByUid, palL, palW, maxH);
}

export function pb_runPacking(products, palL, palW, maxH) {
  const strategies = ['balanced', 'footprint', 'low-height', 'long-side'];
  let bestPacked = [];
  let bestScore = Infinity;

  for (const strategy of strategies) {
    const packed = pb_runPackingCore(products, palL, palW, maxH, strategy);
    const score = pb_scorePackedLayout(packed, palL, palW, maxH);
    if (score < bestScore) {
      bestScore = score;
      bestPacked = packed;
    }
  }

  return bestPacked;
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
