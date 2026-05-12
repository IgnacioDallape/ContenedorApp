import { create } from 'zustand';
import { PB_COLORS, PB_PALLET_TYPES } from '../lib/constants.js';
import { runPalletPacking } from '../lib/palletPacking.js';

export const PB_GRID_RES = 2;
const PB_HEIGHT_EPS = 0.1;
const PB_CELL_AREA = PB_GRID_RES * PB_GRID_RES;
export const PB_PALLET_BASE_H = 14;
const PB_PRECISE_MAX_UNITS = 4;
const PB_POLISH_MAX_UNITS = 10;
const PB_REBALANCE_MAX_UNITS = 180;
const PB_REBALANCE_MAX_SOURCE_UNITS = 24;
const PB_REPACK_MERGE_MAX_UNITS = 180;
const PB_REPACK_MERGE_MAX_SOURCE_UNITS = 28;
const PB_MULTI_STRATEGY_MAX_UNITS = 120;
const PB_CORE_BUDGET_SMALL_MS = 7000;
const PB_CORE_BUDGET_MEDIUM_MS = 5500;
const PB_CORE_BUDGET_LARGE_MS = 4000;
const PB_MIN_LAYER_SUPPORT_COVERAGE = 0.72;
const PB_MIN_SUPPORT_PERCENT = 0.8;
const PB_MIN_SUPPORT_AXIS_COVERAGE = 0.68;
const PB_MAX_SUPPORT_GAP_RATIO = 0.38;

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

function pb_boxGravityPriority(box) {
  const footprint = (box.dX || 0) * (box.dZ || 0);
  const volume = footprint * (box.dY || 0);
  const weight = Number(box.weight || 0);
  return weight * 550 + footprint * 12 + volume * 0.09;
}

function pb_unitGravityPriority(unit) {
  const dims = unit.dims || {};
  const foot = Math.max(
    (dims.L || 0) * (dims.W || 0),
    (dims.L || 0) * (dims.H || 0),
    (dims.W || 0) * (dims.H || 0)
  );
  const volume = (dims.L || 0) * (dims.W || 0) * (dims.H || 0);
  return Number(unit.weight || 0) * 550 + foot * 12 + volume * 0.09;
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
  const gravityPriority = Number(unit.weight || 0) * 550 + footprint * 12 + (footprint * candidate.ori.dY) * 0.09;

  const holePenalty = layerShape.holeCells * 180 + layerShape.holeCount * 1600;
  const fillGapPenalty = fillGapArea * (isBase ? 2.2 : 4.6);
  const perimeterPenalty = layerShape.perimeter * (isBase ? 3.4 : 6.8);
  const topPenalty = topY * 120 + candidate.y * 24 + (!isBase ? gravityPriority * (candidate.y / 48) * 0.9 : 0);
  const centerPenalty = isBase ? distToCenter * 0.45 : distToCenter * 2.6;
  const towerPenalty = candidate.y > PB_HEIGHT_EPS ? slenderness * 240 : slenderness * 40;
  const isolationPenalty = layerPlacements.length && adjacency.sideContacts === 0 ? 900 : 0;
  const supportPenalty = candidate.y > PB_HEIGHT_EPS && candidate.support
    ? (1 - Math.min(1, candidate.support.supportPercent || 0)) * 2800 +
      (1 - Math.min(1, candidate.support.compactness || 0)) * 2200 +
      Math.max(0, 4 - (candidate.support.edgeSupportCount || 0)) * 520 +
      Math.max(0, (candidate.support.centroidOffsetRatio || 0) - 0.1) * 4200
    : 0;

  const footprintReward = footprint * (isBase ? 1.6 : 1.05);
  const adjacencyReward = adjacency.sharedEdge * 34 + adjacency.sideContacts * 170;
  const wallReward = isBase ? touchesWall * 220 + layerShape.edgeTouch * 3 : 0;
  const compactReward = occupiedArea * (isBase ? 1.9 : 1.2);
  const centerFillReward = candidate.y > PB_HEIGHT_EPS ? Math.max(0, 220 - distToCenter * 2.4) : 0;
  const basePriorityReward = isBase ? gravityPriority * 0.55 + (unit.mustBeBase ? 400 : 0) : 0;

  return holePenalty + fillGapPenalty + perimeterPenalty + topPenalty + centerPenalty + towerPenalty + isolationPenalty + supportPenalty
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

function pb_getTimeBudgetForUnits(totalUnits) {
  if (totalUnits <= 24) return PB_CORE_BUDGET_SMALL_MS;
  if (totalUnits <= 48) return PB_CORE_BUDGET_MEDIUM_MS;
  return PB_CORE_BUDGET_LARGE_MS;
}

function pb_intersectSupportRect(rect, support) {
  const x = Math.max(rect.x, support.x);
  const z = Math.max(rect.z, support.z);
  const maxX = Math.min(rect.x + rect.dX, support.x + support.dX);
  const maxZ = Math.min(rect.z + rect.dZ, support.z + support.dZ);
  const dX = maxX - x;
  const dZ = maxZ - z;
  if (dX <= PB_HEIGHT_EPS || dZ <= PB_HEIGHT_EPS) return null;
  return { x, z, dX, dZ };
}

function pb_measureSupportTopology(rect, supportRects) {
  const overlaps = [];
  let supportedArea = 0;
  let weightedCenterX = 0;
  let weightedCenterZ = 0;

  for (const support of supportRects) {
    const overlap = pb_intersectSupportRect(rect, support);
    if (!overlap) continue;
    overlaps.push(overlap);
    const area = overlap.dX * overlap.dZ;
    supportedArea += area;
    weightedCenterX += (overlap.x + overlap.dX / 2) * area;
    weightedCenterZ += (overlap.z + overlap.dZ / 2) * area;
  }

  if (!overlaps.length || supportedArea <= PB_HEIGHT_EPS) {
    return {
      overlapRects: [],
      supportedArea: 0,
      compactness: 0,
      edgeSupportCount: 0,
      centroidOffsetRatio: 1,
    };
  }

  const bounds = pb_rectBounds(overlaps, rect);
  const bboxArea = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ));
  const compactness = Math.min(1, supportedArea / bboxArea);
  const centerX = rect.x + rect.dX / 2;
  const centerZ = rect.z + rect.dZ / 2;
  const centroidX = weightedCenterX / supportedArea;
  const centroidZ = weightedCenterZ / supportedArea;
  const centroidOffset = Math.hypot(centroidX - centerX, centroidZ - centerZ);
  const centroidOffsetRatio = centroidOffset / Math.max(1, Math.max(rect.dX, rect.dZ));
  const edgeSupportCount = [
    overlaps.some(item => item.x <= rect.x + PB_HEIGHT_EPS),
    overlaps.some(item => item.x + item.dX >= rect.x + rect.dX - PB_HEIGHT_EPS),
    overlaps.some(item => item.z <= rect.z + PB_HEIGHT_EPS),
    overlaps.some(item => item.z + item.dZ >= rect.z + rect.dZ - PB_HEIGHT_EPS),
  ].filter(Boolean).length;

  return {
    overlapRects: overlaps,
    supportedArea,
    compactness,
    edgeSupportCount,
    centroidOffsetRatio,
  };
}

function pb_assessPhysicalSupport(rect, supportRects, weight = 0) {
  const support = pb_supportForRect(rect, supportRects);
  const topology = pb_measureSupportTopology(rect, supportRects);
  const footprint = rect.dX * rect.dZ;
  const elongated = Math.max(rect.dX, rect.dZ) / Math.max(1, Math.min(rect.dX, rect.dZ));
  const heavyOrLarge = weight >= 25 || footprint >= 2000 || elongated >= 1.7;
  const requiredCompactness = heavyOrLarge ? 0.72 : 0.56;
  const requiredEdgeSupport = heavyOrLarge ? 4 : 3;
  const maxCentroidOffsetRatio = heavyOrLarge ? 0.16 : 0.24;

  return {
    ...support,
    ...topology,
    supported:
      support.supported &&
      topology.compactness >= requiredCompactness &&
      topology.edgeSupportCount >= requiredEdgeSupport &&
      topology.centroidOffsetRatio <= maxCentroidOffsetRatio,
  };
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
      let support = null;
      if (plateau.y > PB_HEIGHT_EPS) {
        const supportRects = pb_getLevelSupportRects(existingPacked, plateau.y, palL, palW);
        support = pb_assessPhysicalSupport({ x: px, z: pz, dX: ori.dX, dZ: ori.dZ }, supportRects, Number(unit.weight || 0));
        if (!support.supported) continue;
      }

      const candidate = { unit, px, pz, ori, y: plateau.y, support };
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

function pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH, scanLimit = remainingUnits.length, deadline = 0) {
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
    if (deadline && Date.now() >= deadline) break;
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

function pb_simulateLayerPattern(seedCandidate, remainingUnits, packed, palL, palW, maxH, deadline = 0) {
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
    if (deadline && Date.now() >= deadline) break;
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

function pb_chooseBestCandidate(remainingUnits, packed, hm, palL, palW, maxH, deadline = 0) {
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
  const timeRemaining = deadline ? Math.max(0, deadline - Date.now()) : Infinity;
  const currentLayerY = layerCandidates[0]?.y ?? 0;
  const evaluatingBase = currentLayerY <= PB_HEIGHT_EPS;
  const candidateLimit = timeRemaining < 700
    ? (totalRemaining > 24 ? 3 : 4)
    : totalRemaining > 90 ? 3 : totalRemaining > 48 ? 4 : totalRemaining > 24 ? 5 : 7;
  const shouldEstimateLayer = totalRemaining <= 56 && timeRemaining > 220;
  const shouldSimulatePatterns = !evaluatingBase && totalRemaining <= 16 && timeRemaining > 1200;
  const estimateScanLimit = totalRemaining > 32 ? 8 : totalRemaining > 18 ? 12 : remainingUnits.length;
  const rankedCandidates = layerCandidates
    .sort((a, b) => a.score - b.score)
    .slice(0, candidateLimit)
    .map(candidate => {
      const estimate = shouldEstimateLayer
        ? pb_estimateLayerFill(candidate, remainingUnits, packed, palL, palW, maxH, estimateScanLimit, deadline)
        : { sameLayerArea: candidate.ori.dX * candidate.ori.dZ, closePlacements: 0 };
      const simulation = shouldSimulatePatterns
        ? pb_simulateLayerPattern(candidate, remainingUnits, packed, palL, palW, maxH, deadline)
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
    let currentScore = pb_scorePackedLayout(optimized, palL, palW, maxH);
    const order = [...optimized].sort((a, b) =>
      (b.y + b.dY) - (a.y + a.dY) ||
      pb_boxGravityPriority(b) - pb_boxGravityPriority(a) ||
      b.y - a.y
    );

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
      const nextLayout = [...remaining, nextPlacement];
      const nextScore = pb_scorePackedLayout(nextLayout, palL, palW, maxH);
      const improvesPhysics = nextScore + 180 < currentScore;

      if (!lowersBase && !lowersTop && !improvesSameLevel && !improvesPhysics) continue;

      optimized = nextLayout;
      currentScore = nextScore;
      movedInPass = true;
    }

    if (!movedInPass) break;
  }

  return optimized;
}

function pb_finalizeResultMeta(result, sourceProducts = result.products || []) {
  const boxes = result.boxes || [];
  const reserveBoxes = (result.reserveBoxes || []).map(box => ({ ...box }));
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
    reserveBoxes,
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

function pb_collectCandidateBaseLevels(staticBoxes, preferredBaseY = 0, mustBeBase = false) {
  if (mustBeBase) return [0];

  const levels = [0];
  for (const box of staticBoxes) {
    const top = pb_roundToGrid(box.y + box.dY);
    if (top >= -PB_HEIGHT_EPS) levels.push(top);
  }

  const unique = [...new Set(levels.map(level => pb_roundToGrid(level)))];
  return unique.sort((a, b) => {
    const da = Math.abs(a - preferredBaseY);
    const db = Math.abs(b - preferredBaseY);
    if (Math.abs(da - db) > PB_HEIGHT_EPS) return da - db;
    const aAbove = a >= preferredBaseY ? 0 : 1;
    const bAbove = b >= preferredBaseY ? 0 : 1;
    if (aAbove !== bAbove) return aAbove - bAbove;
    return a - b;
  });
}

function pb_validateMovedBoxes(staticBoxes, moved, palL, palW, maxH) {
  for (const box of moved) {
    if (box.x < -PB_HEIGHT_EPS || box.z < -PB_HEIGHT_EPS) {
      return { valid: false, reason: 'out-of-bounds', placements: moved };
    }
    if (box.x + box.dX > palL + PB_HEIGHT_EPS || box.z + box.dZ > palW + PB_HEIGHT_EPS) {
      return { valid: false, reason: 'out-of-bounds', placements: moved };
    }
    if (box.y < -PB_HEIGHT_EPS || box.y + box.dY > maxH + PB_HEIGHT_EPS) {
      return { valid: false, reason: box.y < 0 ? 'out-of-bounds' : 'too-high', placements: moved };
    }
  }

  for (const box of moved) {
    if (pb_collides3D(staticBoxes, { x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, box.y, box.dY)) {
      return { valid: false, reason: 'collision', placements: moved };
    }
  }

  for (const box of moved) {
    if (box.mustBeBase && box.y > PB_HEIGHT_EPS) {
      return { valid: false, reason: 'must-be-base', placements: moved };
    }
    if (box.y <= PB_HEIGHT_EPS) continue;
    const supportRects = [...staticBoxes, ...moved]
      .filter(candidate => candidate.uid !== box.uid && Math.abs((candidate.y + candidate.dY) - box.y) <= PB_HEIGHT_EPS)
      .map(candidate => ({ x: candidate.x, z: candidate.z, dX: candidate.dX, dZ: candidate.dZ }));
    const support = pb_supportForRect({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, supportRects);
    if (!support.supported) {
      return { valid: false, reason: 'unsupported', placements: moved };
    }
  }

  return {
    valid: true,
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

function pb_findGroupPlacement(boxes, movingBoxes, rootUid, palL, palW, maxH, nextX, nextZ, preferredBaseY = null) {
  const root = movingBoxes.find(box => box.uid === rootUid);
  if (!root) return { valid: false, reason: 'missing-root', placements: [] };

  const x = pb_roundToGrid(nextX);
  const z = pb_roundToGrid(nextZ);
  const dx = x - root.x;
  const dz = z - root.z;
  const staticBoxes = boxes.filter(box => !movingBoxes.some(item => item.uid === box.uid));
  const translated = movingBoxes.map(box => ({
    ...box,
    x: pb_roundToGrid(box.x + dx),
    z: pb_roundToGrid(box.z + dz),
  }));
  const targetRoot = translated.find(box => box.uid === rootUid);
  const levels = pb_collectCandidateBaseLevels(staticBoxes, preferredBaseY ?? root.y, root.mustBeBase);
  let bestFailure = null;

  for (const baseY of levels) {
    const dy = pb_roundToGrid(baseY - root.y);
    const moved = translated.map(box => ({
      ...box,
      y: pb_roundToGrid(box.y + dy),
    }));
    const validation = pb_validateMovedBoxes(staticBoxes, moved, palL, palW, maxH);
    if (validation.valid) {
      return {
        ...validation,
        rootPlacement: validation.placements.find(box => box.uid === rootUid) || {
          uid: rootUid,
          x: targetRoot.x,
          y: baseY,
          z: targetRoot.z,
          dX: targetRoot.dX,
          dY: targetRoot.dY,
          dZ: targetRoot.dZ,
        },
      };
    }
    if (!bestFailure || validation.reason === 'collision') bestFailure = validation;
  }

  return bestFailure || { valid: false, reason: 'unsupported', placements: translated };
}

export function pb_validatePlacement(boxes, movingBox, palL, palW, maxH, nextX, nextZ, nextDims = null) {
  const placed = pb_findGroupPlacement(
    boxes,
    [{
      ...movingBox,
      dX: nextDims?.dX ?? movingBox.dX,
      dY: nextDims?.dY ?? movingBox.dY,
      dZ: nextDims?.dZ ?? movingBox.dZ,
    }],
    movingBox.uid,
    palL,
    palW,
    maxH,
    nextX,
    nextZ,
    movingBox.y
  );

  if (!placed.valid) return { valid: false, reason: placed.reason };
  const root = placed.rootPlacement || placed.placements?.[0];
  if (!root) return { valid: false, reason: 'unsupported' };
  return { valid: true, ...root };
}

export function pb_validateSingleBoxMove(boxes, rootUid, palL, palW, maxH, nextX, nextZ) {
  const root = boxes.find(box => box.uid === rootUid);
  if (!root) return { valid: false, reason: 'missing-root', groupUids: [], placements: [] };

  const placement = pb_validatePlacement(boxes, root, palL, palW, maxH, nextX, nextZ);
  if (!placement.valid) {
    return {
      valid: false,
      reason: placement.reason,
      groupUids: [rootUid],
      placements: [{
        uid: rootUid,
        x: pb_roundToGrid(nextX),
        y: root.y,
        z: pb_roundToGrid(nextZ),
        dX: root.dX,
        dY: root.dY,
        dZ: root.dZ,
      }],
    };
  }

  const nextBoxes = boxes.map(box =>
    box.uid === rootUid
      ? { ...box, ...placement }
      : box
  );
  if (!pb_validatePackedLayout(nextBoxes, palL, palW, maxH)) {
    return {
      valid: false,
      reason: 'dependent-support',
      groupUids: [rootUid],
      placements: [{
        uid: rootUid,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        dX: placement.dX,
        dY: placement.dY,
        dZ: placement.dZ,
      }],
    };
  }

  return {
    valid: true,
    groupUids: [rootUid],
    rootPlacement: {
      uid: rootUid,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      dX: placement.dX,
      dY: placement.dY,
      dZ: placement.dZ,
    },
    placements: [{
      uid: rootUid,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      dX: placement.dX,
      dY: placement.dY,
      dZ: placement.dZ,
    }],
  };
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

  const groupUids = pb_getSupportedStack(boxes, rootUid);
  const group = boxes.filter(box => groupUids.includes(box.uid));
  const placed = pb_findGroupPlacement(boxes, group, rootUid, palL, palW, maxH, nextX, nextZ, root.y);
  return {
    ...placed,
    groupUids,
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
    weight: Number(unit.weight || 0),
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

function pb_prepareDetachedBox(box, boxes) {
  return {
    ...box,
    uid: box.uid || pb_nextUidForBoxId(boxes, box.id),
    x: 0,
    y: 0,
    z: 0,
    sourceDims: box.sourceDims ? { ...box.sourceDims } : {
      L: box.dX,
      W: box.dZ,
      H: box.dY,
    },
  };
}

function pb_tryPlaceDetachedBox(boxes, detachedBox, palL, palW, maxH, nextX = null, nextZ = null) {
  const unit = pb_prepareDetachedBox(detachedBox, boxes);

  if (typeof nextX === 'number' && typeof nextZ === 'number') {
    const validation = pb_findGroupPlacement(
      boxes,
      [unit],
      unit.uid,
      palL,
      palW,
      maxH,
      nextX,
      nextZ,
      0
    );
    if (!validation.valid) return null;
    const finalPlacement = validation.rootPlacement || validation.placements?.[0];
    return finalPlacement ? { ...unit, ...finalPlacement } : null;
  }

  return pb_tryAppendUnitToPacked(pb_makeUnitFromBox(unit, { weight: unit.weight || 0, dims: unit.sourceDims }), boxes, palL, palW, maxH);
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
    .map((pallet, idx) => pb_finalizeResultMeta({
      ...pallet,
      idx,
      boxes: pb_centerPackedLayout(pallet.boxes, palL, palW, maxH),
    }, products));
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

function pb_finalizePallets(pallets, products) {
  return pallets
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
      const aGravity = pb_unitGravityPriority(a);
      const bGravity = pb_unitGravityPriority(b);
      if (Math.abs(bGravity - aGravity) > 0.01) return bGravity - aGravity;
      if (Math.abs(aMinH - bMinH) > 0.01) return aMinH - bMinH;
      return bFoot - aFoot;
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
  let gravityPenalty = 0;
  let volume = 0;
  let floatingPenalty = 0;

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
    gravityPenalty += pb_boxGravityPriority(box) * Math.max(0, box.y) * 0.42;
    if (box.y > PB_HEIGHT_EPS) {
      const supportBoxes = packed.filter(candidate => Math.abs((candidate.y + candidate.dY) - box.y) <= PB_HEIGHT_EPS);
      const supportRects = supportBoxes.map(candidate => ({ x: candidate.x, z: candidate.z, dX: candidate.dX, dZ: candidate.dZ }));
      const support = pb_supportForRect({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, supportRects);
      const supportPriority = supportBoxes.reduce((sum, support) => {
        const overlapArea = pb_boxSupportOverlap(support, box);
        if (overlapArea <= PB_HEIGHT_EPS) return sum;
        const coverage = overlapArea / Math.max(1, box.dX * box.dZ);
        return sum + pb_boxGravityPriority(support) * coverage;
      }, 0);
      const boxPriority = pb_boxGravityPriority(box);
      if (boxPriority > supportPriority * 1.02) {
        gravityPenalty += (boxPriority - supportPriority) * 52;
      }
      floatingPenalty +=
        Math.max(0, 0.92 - support.supportPercent) * 240000 +
        Math.max(0, 0.8 - Math.min(support.axisCoverageX || 0, support.axisCoverageZ || 0)) * 220000 +
        Math.max(0, Math.max(support.maxGapRatioX || 0, support.maxGapRatioZ || 0) - 0.26) * 260000;
    }
  }

  for (let a = 0; a < packed.length; a++) {
    for (let b = a + 1; b < packed.length; b++) {
      const first = packed[a];
      const second = packed[b];
      const firstPriority = pb_boxGravityPriority(first);
      const secondPriority = pb_boxGravityPriority(second);
      if (firstPriority > secondPriority && first.y > second.y + PB_HEIGHT_EPS) {
        gravityPenalty += (firstPriority - secondPriority) * (first.y - second.y) * 0.42;
      } else if (secondPriority > firstPriority && second.y > first.y + PB_HEIGHT_EPS) {
        gravityPenalty += (secondPriority - firstPriority) * (second.y - first.y) * 0.42;
      }
    }
  }

  const usedVolumeRatio = volume / Math.max(1, palL * palW * maxH);
  return top * 1500 + shapePenalty + isolatedPenalty + gravityPenalty + floatingPenalty - packed.length * 1200 - usedVolumeRatio * 18000;
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
      const layerGravity = averageWeight * 550 + (usedArea / Math.max(1, count)) * 12 + (usedArea * ori.dY / Math.max(1, count)) * 0.09;
      const score = fitRatio * 240000 + usedArea * 18 + layerGravity * 18 + count * 9000 - ori.dY * 420;
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
      let support = null;
      if (plateau.y > PB_HEIGHT_EPS) {
        const supportRects = pb_getLevelSupportRects(packed, plateau.y, palL, palW);
        support = pb_assessPhysicalSupport({ x: px, z: pz, dX: ori.dX, dZ: ori.dZ }, supportRects, Number(unit.weight || 0));
        if (!support.supported) continue;
      }
      const candidate = { unit, px, pz, ori, y: plateau.y, support };
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

function pb_mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0].slice()];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1] + PB_HEIGHT_EPS) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current.slice());
    }
  }

  return merged;
}

function pb_intervalCoverageMetrics(intervals, start, end) {
  const merged = pb_mergeIntervals(intervals)
    .map(([from, to]) => [Math.max(start, from), Math.min(end, to)])
    .filter(([from, to]) => to - from > PB_HEIGHT_EPS);

  if (!merged.length) {
    return { covered: 0, maxGap: Math.max(0, end - start) };
  }

  let covered = 0;
  let maxGap = Math.max(0, merged[0][0] - start);
  let cursor = merged[0][1];

  covered += merged[0][1] - merged[0][0];

  for (let i = 1; i < merged.length; i++) {
    const [from, to] = merged[i];
    maxGap = Math.max(maxGap, Math.max(0, from - cursor));
    covered += to - from;
    cursor = Math.max(cursor, to);
  }

  maxGap = Math.max(maxGap, Math.max(0, end - cursor));
  return { covered, maxGap };
}

function pb_supportForRect(rect, supportRects) {
  if (!supportRects?.length) {
    return {
      supported: false,
      supportPercent: 0,
      centerSupported: false,
      axisCoverageX: 0,
      axisCoverageZ: 0,
      maxGapRatioX: 1,
      maxGapRatioZ: 1,
    };
  }
  const centerX = rect.x + rect.dX / 2;
  const centerZ = rect.z + rect.dZ / 2;
  const baseArea = Math.max(1, rect.dX * rect.dZ);
  let supportArea = 0;
  let centerSupported = false;
  const supportBandsX = [];
  const supportBandsZ = [];

  for (const support of supportRects) {
    const overlapX = Math.max(0, Math.min(rect.x + rect.dX, support.x + support.dX) - Math.max(rect.x, support.x));
    const overlapZ = Math.max(0, Math.min(rect.z + rect.dZ, support.z + support.dZ) - Math.max(rect.z, support.z));
    const overlapArea = overlapX * overlapZ;
    supportArea += overlapArea;
    if (overlapArea > PB_HEIGHT_EPS) {
      supportBandsX.push([
        Math.max(rect.x, support.x),
        Math.min(rect.x + rect.dX, support.x + support.dX),
      ]);
      supportBandsZ.push([
        Math.max(rect.z, support.z),
        Math.min(rect.z + rect.dZ, support.z + support.dZ),
      ]);
    }
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
  const coverageX = pb_intervalCoverageMetrics(supportBandsX, rect.x, rect.x + rect.dX);
  const coverageZ = pb_intervalCoverageMetrics(supportBandsZ, rect.z, rect.z + rect.dZ);
  const axisCoverageX = Math.min(1, coverageX.covered / Math.max(1, rect.dX));
  const axisCoverageZ = Math.min(1, coverageZ.covered / Math.max(1, rect.dZ));
  const maxGapRatioX = coverageX.maxGap / Math.max(1, rect.dX);
  const maxGapRatioZ = coverageZ.maxGap / Math.max(1, rect.dZ);
  const axisCoverage = Math.min(axisCoverageX, axisCoverageZ);
  const maxGapRatio = Math.max(maxGapRatioX, maxGapRatioZ);
  const footprint = rect.dX * rect.dZ;
  const spanRatio = Math.max(rect.dX, rect.dZ) / Math.max(1, Math.min(rect.dX, rect.dZ));
  const strictSupport = footprint >= 2200 || spanRatio >= 1.7;
  const requiredSupportPercent = strictSupport ? 0.9 : PB_MIN_SUPPORT_PERCENT;
  const requiredAxisCoverage = strictSupport ? 0.82 : PB_MIN_SUPPORT_AXIS_COVERAGE;
  const allowedGapRatio = strictSupport ? 0.24 : PB_MAX_SUPPORT_GAP_RATIO;

  return {
    supported:
      supportPercent >= requiredSupportPercent &&
      centerSupported &&
      axisCoverage >= requiredAxisCoverage &&
      maxGapRatio <= allowedGapRatio,
    supportPercent,
    centerSupported,
    axisCoverageX,
    axisCoverageZ,
    maxGapRatioX,
    maxGapRatioZ,
  };
}

function pb_rectBounds(rects, fallback = { x: 0, z: 0, dX: 0, dZ: 0 }) {
  if (!rects?.length) {
    return {
      minX: fallback.x,
      minZ: fallback.z,
      maxX: fallback.x + fallback.dX,
      maxZ: fallback.z + fallback.dZ,
    };
  }

  return rects.reduce((bounds, rect) => ({
    minX: Math.min(bounds.minX, rect.x),
    minZ: Math.min(bounds.minZ, rect.z),
    maxX: Math.max(bounds.maxX, rect.x + rect.dX),
    maxZ: Math.max(bounds.maxZ, rect.z + rect.dZ),
  }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
}

function pb_validatePackedLayout(packed, palL, palW, maxH) {
  for (const box of packed) {
    if (box.x < -PB_HEIGHT_EPS || box.z < -PB_HEIGHT_EPS) return false;
    if (box.x + box.dX > palL + PB_HEIGHT_EPS || box.z + box.dZ > palW + PB_HEIGHT_EPS) return false;
    if (box.y < -PB_HEIGHT_EPS || box.y + box.dY > maxH + PB_HEIGHT_EPS) return false;
  }

  for (let i = 0; i < packed.length; i++) {
    const box = packed[i];
    const others = packed.filter((_, idx) => idx !== i);
    if (pb_collides3D(others, { x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, box.y, box.dY)) {
      return false;
    }
    if (box.y <= PB_HEIGHT_EPS) continue;
    const supportRects = others
      .filter(candidate => Math.abs((candidate.y + candidate.dY) - box.y) <= PB_HEIGHT_EPS)
      .map(candidate => ({ x: candidate.x, z: candidate.z, dX: candidate.dX, dZ: candidate.dZ }));
    if (!pb_supportForRect({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, supportRects).supported) {
      return false;
    }
  }

  return true;
}

function pb_shiftPacked(packed, uids, dx, dz) {
  const moving = new Set(uids);
  return packed.map(box => moving.has(box.uid)
    ? { ...box, x: pb_roundToGrid(box.x + dx), z: pb_roundToGrid(box.z + dz) }
    : { ...box });
}

function pb_canShiftLayer(packed, layerUids, dx, dz, palL, palW, maxH) {
  const moving = new Set(layerUids);
  const shifted = pb_shiftPacked(packed, layerUids, dx, dz);
  const movedBoxes = shifted.filter(box => moving.has(box.uid));
  const staticBoxes = shifted.filter(box => !moving.has(box.uid));

  for (const box of movedBoxes) {
    if (box.x < -PB_HEIGHT_EPS || box.z < -PB_HEIGHT_EPS) return false;
    if (box.x + box.dX > palL + PB_HEIGHT_EPS || box.z + box.dZ > palW + PB_HEIGHT_EPS) return false;
    if (box.y + box.dY > maxH + PB_HEIGHT_EPS) return false;
    if (pb_collides3D(staticBoxes, { x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, box.y, box.dY)) {
      return false;
    }

    if (box.y <= PB_HEIGHT_EPS) continue;
    const supportRects = staticBoxes
      .filter(candidate => Math.abs((candidate.y + candidate.dY) - box.y) <= PB_HEIGHT_EPS)
      .map(candidate => ({ x: candidate.x, z: candidate.z, dX: candidate.dX, dZ: candidate.dZ }));
    if (!pb_assessPhysicalSupport({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }, supportRects, Number(box.weight || 0)).supported) {
      return false;
    }
  }

  return true;
}

function pb_centerPackedLayout(packed, palL, palW, maxH) {
  if (!packed?.length) return packed || [];
  let working = packed.map(box => ({ ...box }));
  const allBounds = pb_rectBounds(working.map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ })));
  const allDx = pb_roundToGrid((palL - (allBounds.maxX - allBounds.minX)) / 2 - allBounds.minX);
  const allDz = pb_roundToGrid((palW - (allBounds.maxZ - allBounds.minZ)) / 2 - allBounds.minZ);
  if (Math.abs(allDx) > PB_HEIGHT_EPS || Math.abs(allDz) > PB_HEIGHT_EPS) {
    const shifted = pb_shiftPacked(working, working.map(box => box.uid), allDx, allDz);
    if (pb_validatePackedLayout(shifted, palL, palW, maxH)) working = shifted;
  }

  const levels = [...new Set(working.map(box => Math.round(box.y * 10) / 10))].sort((a, b) => b - a);
  for (const y of levels) {
    const layer = working.filter(box => Math.abs(box.y - y) <= PB_HEIGHT_EPS);
    if (!layer.length) continue;
    const hasUpperDependency = working.some(upper =>
      upper.y > y + PB_HEIGHT_EPS &&
      layer.some(lower => pb_directlySupports(lower, upper))
    );
    if (hasUpperDependency) continue;

    const supportRects = y <= PB_HEIGHT_EPS
      ? [{ x: 0, z: 0, dX: palL, dZ: palW }]
      : working
          .filter(box => Math.abs((box.y + box.dY) - y) <= PB_HEIGHT_EPS)
          .map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }));
    const supportBounds = pb_rectBounds(supportRects, { x: 0, z: 0, dX: palL, dZ: palW });
    const layerBounds = pb_rectBounds(layer.map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ })));
    const targetX = supportBounds.minX + ((supportBounds.maxX - supportBounds.minX) - (layerBounds.maxX - layerBounds.minX)) / 2;
    const targetZ = supportBounds.minZ + ((supportBounds.maxZ - supportBounds.minZ) - (layerBounds.maxZ - layerBounds.minZ)) / 2;
    const dx = pb_roundToGrid(targetX - layerBounds.minX);
    const dz = pb_roundToGrid(targetZ - layerBounds.minZ);
    const candidates = [
      [dx, dz],
      [dx, 0],
      [0, dz],
    ];

    for (const [tryDx, tryDz] of candidates) {
      if (Math.abs(tryDx) <= PB_HEIGHT_EPS && Math.abs(tryDz) <= PB_HEIGHT_EPS) continue;
      const layerUids = layer.map(box => box.uid);
      if (pb_canShiftLayer(working, layerUids, tryDx, tryDz, palL, palW, maxH)) {
        working = pb_shiftPacked(working, layerUids, tryDx, tryDz);
        break;
      }
    }
  }

  return working;
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

function pb_supportPlatformMetrics(supportRects, palL, palW) {
  if (!supportRects?.length) {
    return {
      supportArea: 0,
      coverage: 0,
      compactness: 0,
      shape: pb_measureLayerShape([], palL, palW),
    };
  }

  const supportArea = supportRects.reduce((sum, rect) => sum + rect.dX * rect.dZ, 0);
  const shape = pb_measureLayerShape(
    supportRects.map(rect => ({ x: rect.x, y: 0, z: rect.z, dX: rect.dX, dY: 1, dZ: rect.dZ })),
    palL,
    palW
  );
  const bboxArea = shape.bboxCells * PB_CELL_AREA;
  const compactness = bboxArea > 0 ? supportArea / bboxArea : 0;

  return {
    supportArea,
    coverage: supportArea / Math.max(1, palL * palW),
    compactness,
    shape,
  };
}

function pb_isStableSupportPlatform(supportRects, palL, palW, isBase = false) {
  if (isBase) return true;
  const metrics = pb_supportPlatformMetrics(supportRects, palL, palW);
  return (
    metrics.coverage >= 0.22 &&
    metrics.compactness >= 0.48 &&
    metrics.shape.holeCount <= 3 &&
    metrics.shape.holeCells <= 36
  );
}

function pb_shouldAcceptLayer(layer, supportRects, palL, palW, y) {
  if (!layer?.placements?.length) return false;

  const isBase = y <= PB_HEIGHT_EPS;
  const supportMetrics = pb_supportPlatformMetrics(supportRects, palL, palW);
  const areaRatio = layer.area / Math.max(1, supportMetrics.supportArea || (palL * palW));
  const compactness = layer.compactness || 0;
  const totalFootprint = layer.placements.reduce((sum, box) => sum + box.dX * box.dZ, 0);
  const avgFootprint = layer.placements.length ? totalFootprint / layer.placements.length : 0;
  const heavyLayer = layer.totalWeight >= 90 || avgFootprint >= 1800;

  if (isBase) {
    return areaRatio >= 0.42 || layer.placements.length >= 1;
  }

  if (layer.shape.holeCount > 3) return false;
  if (layer.shape.holeCells > 36) return false;
  if (compactness < 0.56) return false;
  if (areaRatio < 0.42) return false;
  if (heavyLayer && areaRatio < 0.54) return false;
  if (heavyLayer && compactness < 0.62) return false;

  return true;
}

function pb_getLevelSupportRects(packed, y, palL, palW) {
  if (y <= PB_HEIGHT_EPS) {
    return [{ x: 0, z: 0, dX: palL, dZ: palW }];
  }

  return packed
    .filter(box => Math.abs((box.y + box.dY) - y) <= PB_HEIGHT_EPS)
    .map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }));
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
    support.supportPercent * 1800 -
    (support.compactness || 0) * 1400 +
    (support.edgeSupportCount || 0) * 120 +
    (support.centroidOffsetRatio || 0) * 3200
  );
}

function pb_fillLayerGaps(products, placements, placedCounts, remaining, palL, palW, remainingHeight, supportRects, fixedLayerH = null) {
  const options = pb_buildLayerOptions(products, palL, palW, remainingHeight, fixedLayerH);
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

function pb_extendPackedLevel(remainingProducts, packed, uidCounters, y, supportRects, palL, palW, maxH, fixedLayerH = null) {
  const levelBoxes = packed
    .filter(box => Math.abs(box.y - y) <= PB_HEIGHT_EPS)
    .map(box => ({
      x: box.x,
      z: box.z,
      dX: box.dX,
      dY: box.dY,
      dZ: box.dZ,
      color: box.color,
      name: box.name,
      id: box.id,
      uid: box.uid,
      score: box.score,
      weight: box.weight,
      mustBeBase: !!box.mustBeBase,
      noRotate: !!box.noRotate,
      sourceDims: box.sourceDims ? { ...box.sourceDims } : undefined,
    }));

  if (!levelBoxes.length) return 0;

  const levelHeightCap = fixedLayerH ?? levelBoxes.reduce((maxHeight, box) => Math.max(maxHeight, box.dY || 0), 0);
  if (levelHeightCap <= PB_HEIGHT_EPS) return 0;

  const placements = levelBoxes.map(box => ({ ...box }));
  const placedCounts = {};
  const remainingMap = new Map(
    remainingProducts
      .filter(product => (product.qty || 0) > 0)
      .map(product => [product.id, product.qty || 0])
  );

  pb_fillLayerGaps(
    remainingProducts,
    placements,
    placedCounts,
    remainingMap,
    palL,
    palW,
    maxH - y,
    supportRects,
    levelHeightCap
  );

  let appended = 0;
  const newPlacements = placements.slice(levelBoxes.length);
  for (const box of newPlacements) {
    const idx = uidCounters[box.id] || 0;
    uidCounters[box.id] = idx + 1;
    packed.push({
      ...box,
      y,
      uid: `${box.id}::${idx}`,
    });
    appended += 1;
  }

  for (const product of remainingProducts) {
    product.qty -= placedCounts[product.id] || 0;
  }

  return appended;
}

function pb_buildDenseGridSeed(option, supportRects, palL, palW) {
  const cols = Math.floor((palL + PB_HEIGHT_EPS) / option.ori.dX);
  const rows = Math.floor((palW + PB_HEIGHT_EPS) / option.ori.dZ);
  const maxQty = Math.min(option.product.qty || 0, cols * rows);
  if (cols <= 0 || rows <= 0 || maxQty <= 0) return null;

  const supportBounds = pb_rectBounds(supportRects, { x: 0, z: 0, dX: palL, dZ: palW });
  const patterns = [];

  for (let useCols = 1; useCols <= cols; useCols++) {
    for (let useRows = 1; useRows <= rows; useRows++) {
      if (useCols * useRows < maxQty) continue;
      const bboxArea = useCols * option.ori.dX * useRows * option.ori.dZ;
      const spareSlots = useCols * useRows - maxQty;
      const widthSlack = Math.abs((supportBounds.maxX - supportBounds.minX) - useCols * option.ori.dX);
      const depthSlack = Math.abs((supportBounds.maxZ - supportBounds.minZ) - useRows * option.ori.dZ);
      patterns.push({
        useCols,
        useRows,
        score: spareSlots * 9000 + bboxArea + Math.abs(widthSlack - depthSlack) * 20 + (widthSlack + depthSlack) * 6,
      });
    }
  }

  patterns.sort((a, b) => a.score - b.score);
  const fallbackPattern = { useCols: cols, useRows: rows };
  const candidatePatterns = [...patterns.slice(0, 6), fallbackPattern];
  let placements = [];
  let placedCounts = {};

  for (const pattern of candidatePatterns) {
    const nextPlacements = [];
    const nextCounts = { [option.product.id]: 0 };
    const gridW = pattern.useCols * option.ori.dX;
    const gridD = pattern.useRows * option.ori.dZ;
    const baseX = Math.max(0, Math.min(palL - gridW, pb_roundToGrid(supportBounds.minX + ((supportBounds.maxX - supportBounds.minX) - gridW) / 2)));
    const baseZ = Math.max(0, Math.min(palW - gridD, pb_roundToGrid(supportBounds.minZ + ((supportBounds.maxZ - supportBounds.minZ) - gridD) / 2)));
    let remainingQty = maxQty;

    for (let row = 0; row < pattern.useRows && remainingQty > 0; row++) {
      const rowCount = Math.min(pattern.useCols, remainingQty);
      const rowX = Math.max(0, Math.min(palL - rowCount * option.ori.dX, pb_roundToGrid(baseX + (gridW - rowCount * option.ori.dX) / 2)));
      const rowZ = pb_roundToGrid(baseZ + row * option.ori.dZ);

      for (let col = 0; col < rowCount; col++) {
        const rect = {
          x: pb_roundToGrid(rowX + col * option.ori.dX),
          z: rowZ,
          dX: option.ori.dX,
          dZ: option.ori.dZ,
        };
        const support = pb_supportForRect(rect, supportRects);
        if (!support.supported) continue;

        const idx = nextCounts[option.product.id] || 0;
        nextCounts[option.product.id] = idx + 1;
        nextPlacements.push({
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
        remainingQty--;
      }
    }

    if (nextPlacements.length > placements.length) {
      placements = nextPlacements;
      placedCounts = nextCounts;
    }
    if (nextPlacements.length === maxQty) break;
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
      if (y > PB_HEIGHT_EPS && pb_supportCoverage(supportRects, palL, palW) < PB_MIN_LAYER_SUPPORT_COVERAGE) {
        continue;
      }

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

            const gravityPriority = option.weight * 550 + option.area * 12 + option.area * option.ori.dY * 0.09;
            const score =
              y * 900 +
              (y > PB_HEIGHT_EPS ? gravityPriority * (y / 52) * 0.72 : -gravityPriority * 0.18) +
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

function pb_chooseDenseLayer(products, palL, palW, remainingHeight, supportRects, y = 0) {
  const heights = new Set();
  for (const product of products) {
    if ((product.qty || 0) <= 0) continue;
    for (const ori of pb_getOrientations(product, palL, palW)) {
      if (ori.dY <= remainingHeight + PB_HEIGHT_EPS) heights.add(Math.round(ori.dY * 10) / 10);
    }
  }

  let best = null;
  const isBase = y <= PB_HEIGHT_EPS;
  for (const layerH of heights) {
    const layer = pb_packLayerForHeight(products, palL, palW, layerH, supportRects, true);
    if (!layer.placements.length) continue;
    if (!pb_shouldAcceptLayer(layer, supportRects, palL, palW, y)) continue;
    const heightPenalty = isBase ? layer.layerH * 520 : layer.layerH * 2200;
    const weightReward = isBase ? layer.totalWeight * 42 : layer.totalWeight * 8;
    const futureSlack = Math.max(0, remainingHeight - layer.layerH);
    const score =
      layer.coverage * 220000 +
      layer.compactness * 48000 +
      layer.placements.length * 180 -
      layer.shape.holeCells * 280 -
      layer.shape.holeCount * 5000 -
      heightPenalty +
      weightReward +
      layer.averageArea * 2.8 +
      futureSlack * 120;
    if (!best || score > best.score) best = { ...layer, score };
  }
  return best;
}

function pb_commitLayerPlacements(layer, remaining, packed, uidCounters, y) {
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
}

function pb_runPackingLayered(products, palL, palW, maxH) {
  const remaining = products
    .filter(product => (product.qty || 0) > 0)
    .map(product => ({ ...product, qty: product.qty || 0 }));
  const packed = [];
  const uidCounters = {};
  let safety = 0;

  while (remaining.some(product => product.qty > 0) && safety < 160) {
    safety++;
    let placedThisPass = false;

    const existingLevels = [...new Set(packed.map(box => Math.round(box.y * 10) / 10))].sort((a, b) => a - b);
    const existingLevelSet = new Set(existingLevels);
    for (const y of existingLevels) {
      const supportRects = pb_getLevelSupportRects(packed, y, palL, palW);
      if (!supportRects.length) continue;

      const added = pb_extendPackedLevel(
        remaining,
        packed,
        uidCounters,
        y,
        supportRects,
        palL,
        palW,
        maxH
      );
      if (added > 0) {
        placedThisPass = true;
        break;
      }
    }

    if (placedThisPass) continue;

    const supportLevels = [
      0,
      ...packed
        .map(box => Math.round((box.y + box.dY) * 10) / 10)
        .filter(level => level > PB_HEIGHT_EPS && level < maxH - PB_HEIGHT_EPS),
    ].filter((level, index, arr) => arr.indexOf(level) === index).sort((a, b) => a - b);

    for (const y of supportLevels) {
      if (existingLevelSet.has(y)) continue;
      const supportRects = pb_getLevelSupportRects(packed, y, palL, palW);
      if (!supportRects.length) continue;
      if (!pb_isStableSupportPlatform(supportRects, palL, palW, y <= PB_HEIGHT_EPS)) continue;

      const chosenLayer = pb_chooseDenseLayer(remaining, palL, palW, maxH - y, supportRects, y);
      if (!chosenLayer || !chosenLayer.placements.length) continue;
      if (!pb_shouldAcceptLayer(chosenLayer, supportRects, palL, palW, y)) continue;

      const layer = pb_packLayerForHeight(remaining, palL, palW, chosenLayer.layerH, supportRects, true);
      if (!layer || !layer.placements.length) continue;
      if (!pb_shouldAcceptLayer(layer, supportRects, palL, palW, y)) continue;

      pb_commitLayerPlacements(layer, remaining, packed, uidCounters, y);
      placedThisPass = true;
      break;
    }

    if (!placedThisPass) break;
  }

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
      weight: Number(unit.weight || 0),
      mustBeBase: !!unit.mustBeBase,
      noRotate: !!unit.noRotate,
      sourceDims: { ...unit.dims },
    });
    units.splice(unitIdx, 1);
  }

  return packed;
}

function pb_fillPackedHoles(units, packed, hm, palL, palW, maxH, deadline = 0) {
  let safety = 0;

  while (units.length && safety < 400) {
    safety++;
    if (deadline && Date.now() >= deadline + 1200) break;

    let best = null;
    const seen = new Set();
    const scanLimit = units.length > 64 ? 18 : units.length > 36 ? 24 : 36;
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
      const footprint = candidate.ori.dX * candidate.ori.dZ;
      const lowLayerReward = candidate.y <= PB_HEIGHT_EPS ? 1800 : Math.max(0, 1200 - candidate.y * 12);
      const supportReward = candidate.support
        ? (candidate.support.supportPercent * 900 + (candidate.support.compactness || 0) * 700)
        : 0;
      const score = candidate.score - footprint * 0.45 - lowLayerReward - supportReward;

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
      weight: Number(unit.weight || 0),
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
  const deadline = Date.now() + pb_getTimeBudgetForUnits(totalUnits);

  const hm = pb_makeHM(palW, palL);
  let safety = 0;

  while (units.length && safety < 500) {
    safety++;
    if (Date.now() >= deadline && packed.length) break;
    const bestCandidate = pb_chooseBestCandidate(units, packed, hm, palL, palW, maxH, deadline);
    if (!bestCandidate) break;

    const { unitIdx, unit, px, pz, ori, y, score } = bestCandidate;
    pb_hmSet(hm, px, pz, ori.dX, ori.dZ, y + ori.dY);
    packed.push({
      x: px, y, z: pz,
      dX: ori.dX, dY: ori.dY, dZ: ori.dZ,
      color: unit.color, name: unit.name, id: unit.id, uid: unit.uid, score,
      weight: Number(unit.weight || 0),
      mustBeBase: !!unit.mustBeBase,
      noRotate: !!unit.noRotate,
      sourceDims: { ...unit.dims },
    });
    units.splice(unitIdx, 1);
  }

  pb_fillPackedHoles(units, packed, hm, palL, palW, maxH, deadline);
  return totalUnits > 80 ? packed : pb_optimizePackedLayout(packed, unitsByUid, palL, palW, maxH);
}

function pb_pickBestPackedLayout(layouts, palL, palW, maxH) {
  const valid = layouts
    .map(entry => ({
      ...entry,
      valid: pb_validatePackedLayout(entry.boxes, palL, palW, maxH),
      score: pb_scorePackedLayout(entry.boxes, palL, palW, maxH),
      top: entry.boxes.reduce((maxY, box) => Math.max(maxY, box.y + box.dY), 0),
    }))
    .filter(entry => entry.valid && entry.boxes.length);

  if (!valid.length) return layouts[0]?.boxes || [];

  valid.sort((a, b) => {
    if (b.boxes.length !== a.boxes.length) return b.boxes.length - a.boxes.length;
    if (Math.abs(a.score - b.score) > 0.01) return a.score - b.score;
    return a.top - b.top;
  });

  return valid[0].boxes;
}

export function pb_runPacking(products, palL, palW, maxH) {
  return runPalletPacking(products, { palL, palW, maxH, variant: 'auto' });
}

function pb_unitsByUidFromProducts(products) {
  const unitsByUid = new Map();
  for (const product of products.filter(item => (item.qty || 0) > 0)) {
    for (let i = 0; i < product.qty; i++) {
      unitsByUid.set(`${product.id}::${i}`, { ...product, uid: `${product.id}::${i}` });
    }
  }
  return unitsByUid;
}

function pb_expandUnits(products) {
  const units = [];
  for (const product of products.filter(item => (item.qty || 0) > 0)) {
    for (let i = 0; i < product.qty; i++) {
      units.push({
        ...product,
        _idx: i,
        _sourceId: product.id,
        uid: `${product.id}::${i}`,
      });
    }
  }
  return units;
}

function pb_sortContainerLikeUnits(units, variant = 'auto') {
  const minOriHeight = unit => {
    const orientations = pb_getOrientations(unit, Infinity, Infinity);
    return orientations.length ? Math.min(...orientations.map(ori => ori.dY)) : unit.dims.H;
  };

  units.sort((a, b) => {
    const aBase = a.mustBeBase ? 1 : 0;
    const bBase = b.mustBeBase ? 1 : 0;
    if (aBase !== bBase) return bBase - aBase;

    const aVolume = a.dims.L * a.dims.W * a.dims.H;
    const bVolume = b.dims.L * b.dims.W * b.dims.H;
    const aFoot = Math.max(a.dims.L * a.dims.W, a.dims.L * a.dims.H, a.dims.W * a.dims.H);
    const bFoot = Math.max(b.dims.L * b.dims.W, b.dims.L * b.dims.H, b.dims.W * b.dims.H);
    const aH = minOriHeight(a);
    const bH = minOriHeight(b);
    const aWeight = Number(a.weight || 0);
    const bWeight = Number(b.weight || 0);

    if (variant === 'low-height') {
      if (Math.abs(aH - bH) > 0.01) return aH - bH;
      if (Math.abs(bFoot - aFoot) > 0.01) return bFoot - aFoot;
      return bVolume - aVolume;
    }

    if (variant === 'grid') {
      if (Math.abs(bFoot - aFoot) > 0.01) return bFoot - aFoot;
      if (Math.abs(aH - bH) > 0.01) return aH - bH;
      return bVolume - aVolume;
    }

    if (variant === 'layers') {
      if (Math.abs(aH - bH) > 0.01) return aH - bH;
      if (Math.abs(bVolume - aVolume) > 0.01) return bVolume - aVolume;
      return bFoot - aFoot;
    }

    if (Math.abs(bWeight - aWeight) > 0.01) return bWeight - aWeight;
    if (Math.abs(bVolume - aVolume) > 0.01) return bVolume - aVolume;
    if (Math.abs(bFoot - aFoot) > 0.01) return bFoot - aFoot;
    return aH - bH;
  });
}

function pb_containerLikeCandidateScore(candidate, unit, packed, palL, palW, variant = 'auto') {
  const { px, pz, ori, y, support } = candidate;
  const top = y + ori.dY;
  const footprint = ori.dX * ori.dZ;
  const centerX = px + ori.dX / 2;
  const centerZ = pz + ori.dZ / 2;
  const distToCenter = Math.hypot(centerX - palL / 2, centerZ - palW / 2);
  const layerCount = packed.filter(box => Math.abs(box.y - y) <= PB_HEIGHT_EPS).length;
  const supportPenalty = support ? (1 - Math.min(1, support.supportPercent || 0)) * 120000 : 0;
  const edgeBias = pz * 10000 + px * 100;

  if (variant === 'low-height') {
    return top * 12000000 + y * 600000 + ori.dY * 9000 + distToCenter * 90 - footprint * 14 + supportPenalty;
  }

  if (variant === 'grid') {
    return top * 9000000 + edgeBias - footprint * 42 - layerCount * 3200 + supportPenalty;
  }

  if (variant === 'layers') {
    return y * 9000000 + top * 900000 + Math.abs(ori.dY - (unit.dims.H || ori.dY)) * 3500 + edgeBias - footprint * 20 + supportPenalty;
  }

  return top * 10000000 + y * 900000 + edgeBias + distToCenter * 110 - footprint * 24 + supportPenalty;
}

function pb_tryFindContainerLikePlacement(unit, packed, hm, palL, palW, maxH, variant = 'auto', deadline = 0) {
  const totalUnits = packed.length;
  const scanStep = totalUnits > 140 ? 5 : totalUnits > 70 ? 4 : PB_GRID_RES;
  const orientations = pb_getOrientations(unit, palL, palW);
  let best = null;

  for (const ori of orientations) {
    const maxX = Math.max(0, palL - ori.dX);
    const maxZ = Math.max(0, palW - ori.dZ);
    for (let pz = 0; pz <= maxZ + PB_HEIGHT_EPS; pz += scanStep) {
      if (deadline && Date.now() >= deadline) return best;
      for (let px = 0; px <= maxX + PB_HEIGHT_EPS; px += scanStep) {
        const x = pb_roundToGrid(Math.min(px, maxX));
        const z = pb_roundToGrid(Math.min(pz, maxZ));
        const plateau = pb_getPlateauStats(hm, x, z, ori.dX, ori.dZ);
        const y = plateau.y;
        if (unit.mustBeBase && y > PB_HEIGHT_EPS) continue;
        if (y + ori.dY > maxH + PB_HEIGHT_EPS) continue;
        if (pb_collides3D(packed, { x, z, dX: ori.dX, dZ: ori.dZ }, y, ori.dY)) continue;

        let support = null;
        if (y > PB_HEIGHT_EPS) {
          const supportRects = pb_getLevelSupportRects(packed, y, palL, palW);
          support = pb_supportForRect({ x, z, dX: ori.dX, dZ: ori.dZ }, supportRects);
          if (!support.supported) continue;
        }

        const candidate = { unit, px: x, pz: z, ori, y, support };
        const score = pb_containerLikeCandidateScore(candidate, unit, packed, palL, palW, variant);
        if (!best || score < best.score) best = { ...candidate, score };
      }
    }
  }

  return best;
}

function pb_runPackingContainerLike(products, palL, palW, maxH, variant = 'auto') {
  let queue = pb_expandUnits(products);
  pb_sortContainerLikeUnits(queue, variant);

  const packed = [];
  const hm = pb_makeHM(palW, palL);
  const totalUnits = queue.length;
  const deadline = Date.now() + (totalUnits > 140 ? 1400 : totalUnits > 70 ? 1800 : 2400);
  let round = 0;

  while (queue.length && round < 8 && Date.now() < deadline) {
    round++;
    const failed = [];
    let placedThisRound = 0;

    for (const unit of queue) {
      if (Date.now() >= deadline) {
        failed.push(unit);
        continue;
      }

      const best = pb_tryFindContainerLikePlacement(unit, packed, hm, palL, palW, maxH, variant, deadline);
      if (!best) {
        failed.push(unit);
        continue;
      }

      pb_hmSet(hm, best.px, best.pz, best.ori.dX, best.ori.dZ, best.y + best.ori.dY);
      packed.push({
        x: best.px,
        y: best.y,
        z: best.pz,
        dX: best.ori.dX,
        dY: best.ori.dY,
        dZ: best.ori.dZ,
        color: unit.color,
        name: unit.name,
        id: unit.id,
        uid: unit.uid,
        score: best.score,
        weight: Number(unit.weight || 0),
        mustBeBase: !!unit.mustBeBase,
        noRotate: !!unit.noRotate,
        sourceDims: { ...unit.dims },
      });
      placedThisRound++;
    }

    if (!placedThisRound || failed.length === queue.length) break;
    queue = failed;
    pb_sortContainerLikeUnits(queue, variant);
  }

  return packed;
}

function pb_runReorderVariant(products, palL, palW, maxH, variant = 'auto') {
  const expectedCount = products.reduce((sum, product) => sum + Math.max(0, product.qty || 0), 0);
  const variants = variant === 'auto'
    ? ['auto', 'grid']
    : [...new Set([variant, 'auto', 'grid'])];

  for (const currentVariant of variants) {
    const boxes = runPalletPacking(products, { palL, palW, maxH, variant: currentVariant });
    if (boxes.length === expectedCount && pb_validatePackedLayout(boxes, palL, palW, maxH)) {
      return boxes;
    }
  }

  return null;
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
        reserveBoxes: [],
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

    let finalized = pb_finalizePallets(pallets, products, palL, palW, maxHeight);
    if (finalized.length > 1) {
      finalized = pb_mergeRepackPallets(finalized, products, palL, palW, maxHeight);
    }
    set({ results: finalized, activeResult: 0, selectedBoxUid: null });
  },

  setActiveResult(idx) { set({ activeResult: idx }); },
  setSelectedBoxUid(uid) { set({ selectedBoxUid: uid }); },

  updateActiveResultBoxes(nextBoxes) {
    const { results, activeResult } = get();
    if (!results[activeResult]) return;
    const updated = [...results];
    updated[activeResult] = pb_finalizeResultMeta(
      {
        ...updated[activeResult],
        boxes: nextBoxes.map(box => ({ ...box })),
        reserveBoxes: (updated[activeResult].reserveBoxes || []).map(box => ({ ...box })),
      },
      updated[activeResult].products || []
    );
    set({ results: updated });
  },

  removeBoxFromActiveResult(uid) {
    const { results, activeResult, selectedBoxUid } = get();
    if (!results[activeResult]) return;
    const updated = [...results];
    const removedBox = updated[activeResult].boxes.find(box => box.uid === uid);
    if (!removedBox) return;
    const nextBoxes = updated[activeResult].boxes.filter(box => box.uid !== uid);
    updated[activeResult] = pb_finalizeResultMeta(
      {
        ...updated[activeResult],
        boxes: nextBoxes,
        reserveBoxes: [
          ...(updated[activeResult].reserveBoxes || []),
          { ...removedBox, uid: `reserve::${removedBox.uid}` },
        ],
      },
      updated[activeResult].products || []
    );
    set({ results: updated, selectedBoxUid: selectedBoxUid === uid ? null : selectedBoxUid });
  },

  restoreReserveBoxToActiveResult(uid, nextX = null, nextZ = null) {
    const { results, activeResult, selectedBoxUid } = get();
    const current = results[activeResult];
    if (!current) return { ok: false, reason: 'missing-result' };

    const reserveBox = (current.reserveBoxes || []).find(box => box.uid === uid);
    if (!reserveBox) return { ok: false, reason: 'missing-reserve' };

    const placed = pb_tryPlaceDetachedBox(current.boxes, {
      ...reserveBox,
      uid: reserveBox.uid.replace(/^reserve::/, ''),
    }, current.palL, current.palW, current.maxHeight, nextX, nextZ);
    if (!placed) return { ok: false, reason: 'no-fit' };

    const updated = [...results];
    updated[activeResult] = pb_finalizeResultMeta(
      {
        ...current,
        boxes: [...current.boxes, placed],
        reserveBoxes: (current.reserveBoxes || []).filter(box => box.uid !== uid),
      },
      current.products || []
    );
    set({ results: updated, selectedBoxUid: selectedBoxUid || placed.uid });
    return { ok: true, box: placed };
  },

  reorderActiveResult(variant = 'auto') {
    const { results, activeResult } = get();
    const current = results[activeResult];
    if (!current?.boxes?.length) return { ok: false, reason: 'empty' };

    const sourceById = new Map((current.products || []).map(product => [product.id, product]));
    const sourceProducts = pb_productsFromBoxes(current.boxes, sourceById);
    const boxes = pb_runReorderVariant(sourceProducts, current.palL, current.palW, current.maxHeight, variant);
    if (!boxes) return { ok: false, reason: 'no-layout' };

    const updated = [...results];
    updated[activeResult] = pb_finalizeResultMeta(
      {
        ...current,
        boxes,
        reserveBoxes: (current.reserveBoxes || []).map(box => ({ ...box })),
      },
      current.products || []
    );
    set({ results: updated, selectedBoxUid: null });
    return { ok: true, boxes };
  },

  clearResults() { set({ results: [], activeResult: 0, selectedBoxUid: null }); },
}));

export default usePalletStore;
