const DEFAULT_GRID_RES = 2;
const FIT_EPS = 0.1;
const SUPPORT_EPS = 0.5;
const MIN_SUPPORT_PERCENT = 0.8;
const MIN_SUPPORT_AXIS_COVERAGE = 0.68;
const MAX_SUPPORT_GAP_RATIO = 0.38;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function roundToStep(value, step) {
  return round2(Math.round(value / step) * step);
}

function overlaps1D(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function footprintsOverlap(a, b) {
  return (
    overlaps1D(a.x, a.x + a.dX, b.x, b.x + b.dX) > FIT_EPS &&
    overlaps1D(a.z, a.z + a.dZ, b.z, b.z + b.dZ) > FIT_EPS
  );
}

function collides3D(packed, rect, y, dY) {
  const y0 = y;
  const y1 = y + dY;
  return packed.some(box => {
    if (!footprintsOverlap(rect, box)) return false;
    return overlaps1D(y0, y1, box.y, box.y + box.dY) > FIT_EPS;
  });
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals
    .filter(([from, to]) => to - from > FIT_EPS)
    .sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const [from, to] = sorted[i];
    const last = merged[merged.length - 1];
    if (from <= last[1] + FIT_EPS) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }

  return merged;
}

function intervalCoverageMetrics(intervals, start, end) {
  const merged = mergeIntervals(intervals)
    .map(([from, to]) => [Math.max(start, from), Math.min(end, to)])
    .filter(([from, to]) => to - from > FIT_EPS);

  if (!merged.length) return { covered: 0, maxGap: Math.max(0, end - start) };

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

function supportForRect(rect, supportRects) {
  if (!supportRects.length) {
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
    const overlapX = overlaps1D(rect.x, rect.x + rect.dX, support.x, support.x + support.dX);
    const overlapZ = overlaps1D(rect.z, rect.z + rect.dZ, support.z, support.z + support.dZ);
    const overlapArea = overlapX * overlapZ;
    supportArea += overlapArea;

    if (overlapArea > FIT_EPS) {
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
      centerX >= support.x - FIT_EPS &&
      centerX <= support.x + support.dX + FIT_EPS &&
      centerZ >= support.z - FIT_EPS &&
      centerZ <= support.z + support.dZ + FIT_EPS
    ) {
      centerSupported = true;
    }
  }

  const supportPercent = Math.min(1, supportArea / baseArea);
  const coverageX = intervalCoverageMetrics(supportBandsX, rect.x, rect.x + rect.dX);
  const coverageZ = intervalCoverageMetrics(supportBandsZ, rect.z, rect.z + rect.dZ);
  const axisCoverageX = Math.min(1, coverageX.covered / Math.max(1, rect.dX));
  const axisCoverageZ = Math.min(1, coverageZ.covered / Math.max(1, rect.dZ));
  const maxGapRatioX = coverageX.maxGap / Math.max(1, rect.dX);
  const maxGapRatioZ = coverageZ.maxGap / Math.max(1, rect.dZ);
  const footprint = rect.dX * rect.dZ;
  const spanRatio = Math.max(rect.dX, rect.dZ) / Math.max(1, Math.min(rect.dX, rect.dZ));
  const strictSupport = footprint >= 2200 || spanRatio >= 1.7;
  const requiredSupportPercent = strictSupport ? 0.9 : MIN_SUPPORT_PERCENT;
  const requiredAxisCoverage = strictSupport ? 0.82 : MIN_SUPPORT_AXIS_COVERAGE;
  const allowedGapRatio = strictSupport ? 0.24 : MAX_SUPPORT_GAP_RATIO;

  return {
    supported:
      supportPercent + FIT_EPS >= requiredSupportPercent &&
      centerSupported &&
      Math.min(axisCoverageX, axisCoverageZ) + FIT_EPS >= requiredAxisCoverage &&
      Math.max(maxGapRatioX, maxGapRatioZ) <= allowedGapRatio + FIT_EPS,
    supportPercent,
    centerSupported,
    axisCoverageX,
    axisCoverageZ,
    maxGapRatioX,
    maxGapRatioZ,
  };
}

function normalizeDims(dims = {}) {
  return {
    L: Math.max(0, Number(dims.L) || 0),
    W: Math.max(0, Number(dims.W) || 0),
    H: Math.max(0, Number(dims.H) || 0),
  };
}

function expandUnits(products) {
  const units = [];

  for (const product of products || []) {
    const qty = Math.max(0, Math.floor(Number(product.qty) || 0));
    const dims = normalizeDims(product.dims);
    if (!qty || !dims.L || !dims.W || !dims.H) continue;

    for (let i = 0; i < qty; i++) {
      units.push({
        ...product,
        dims,
        uid: `${product.id}::${i}`,
        _idx: i,
        weight: Number(product.weight || 0),
        mustBeBase: !!product.mustBeBase,
        noRotate: !!product.noRotate,
      });
    }
  }

  return units;
}

function getOrientations(unit, palL, palW, maxH, variant) {
  const source = unit.lockedOri
    ? [{ dX: unit.lockedOri.dX, dZ: unit.lockedOri.dZ, dY: unit.lockedOri.dY }]
    : unit.noRotate
      ? [{ dX: unit.dims.L, dZ: unit.dims.W, dY: unit.dims.H }]
      : [
          { dX: unit.dims.L, dZ: unit.dims.W, dY: unit.dims.H },
          { dX: unit.dims.W, dZ: unit.dims.L, dY: unit.dims.H },
          { dX: unit.dims.L, dZ: unit.dims.H, dY: unit.dims.W },
          { dX: unit.dims.H, dZ: unit.dims.L, dY: unit.dims.W },
          { dX: unit.dims.W, dZ: unit.dims.H, dY: unit.dims.L },
          { dX: unit.dims.H, dZ: unit.dims.W, dY: unit.dims.L },
        ];

  const unique = new Map();
  for (const option of source) {
    const ori = {
      dX: Number(option.dX) || 0,
      dZ: Number(option.dZ) || 0,
      dY: Number(option.dY) || 0,
    };
    if (
      ori.dX <= FIT_EPS ||
      ori.dZ <= FIT_EPS ||
      ori.dY <= FIT_EPS ||
      ori.dX > palL + FIT_EPS ||
      ori.dZ > palW + FIT_EPS ||
      ori.dY > maxH + FIT_EPS
    ) {
      continue;
    }
    unique.set(`${ori.dX}|${ori.dZ}|${ori.dY}`, ori);
  }

  const orientations = [...unique.values()];
  orientations.sort((a, b) => {
    const aFoot = a.dX * a.dZ;
    const bFoot = b.dX * b.dZ;

    if (variant === 'low-height' || variant === 'layers') {
      if (Math.abs(a.dY - b.dY) > FIT_EPS) return a.dY - b.dY;
      return bFoot - aFoot;
    }

    if (variant === 'grid') {
      if (Math.abs(bFoot - aFoot) > FIT_EPS) return bFoot - aFoot;
      return a.dY - b.dY;
    }

    if (Math.abs(bFoot - aFoot) > FIT_EPS) return bFoot - aFoot;
    return a.dY - b.dY;
  });

  return orientations;
}

function orientationStats(unit) {
  const all = getOrientations(unit, Infinity, Infinity, Infinity, 'auto');
  const fallback = unit.dims || { L: 0, W: 0, H: 0 };
  if (!all.length) {
    return {
      minHeight: fallback.H || 0,
      maxFootprint: Math.max(
        (fallback.L || 0) * (fallback.W || 0),
        (fallback.L || 0) * (fallback.H || 0),
        (fallback.W || 0) * (fallback.H || 0)
      ),
    };
  }
  return {
    minHeight: Math.min(...all.map(ori => ori.dY)),
    maxFootprint: Math.max(...all.map(ori => ori.dX * ori.dZ)),
  };
}

function sortUnits(units, variant) {
  const stats = new Map(units.map(unit => [unit.uid, orientationStats(unit)]));
  const volume = unit => unit.dims.L * unit.dims.W * unit.dims.H;

  units.sort((a, b) => {
    const aBase = a.mustBeBase ? 1 : 0;
    const bBase = b.mustBeBase ? 1 : 0;
    if (aBase !== bBase) return bBase - aBase;

    const aStats = stats.get(a.uid);
    const bStats = stats.get(b.uid);
    const aVol = volume(a);
    const bVol = volume(b);

    if (variant === 'low-height') {
      if (Math.abs(aStats.minHeight - bStats.minHeight) > FIT_EPS) {
        return aStats.minHeight - bStats.minHeight;
      }
      if (Math.abs(bStats.maxFootprint - aStats.maxFootprint) > FIT_EPS) {
        return bStats.maxFootprint - aStats.maxFootprint;
      }
      return bVol - aVol;
    }

    if (variant === 'layers') {
      if (Math.abs(aStats.minHeight - bStats.minHeight) > FIT_EPS) {
        return aStats.minHeight - bStats.minHeight;
      }
      if (Math.abs(bVol - aVol) > FIT_EPS) return bVol - aVol;
      return bStats.maxFootprint - aStats.maxFootprint;
    }

    if (variant === 'grid') {
      if (Math.abs(bStats.maxFootprint - aStats.maxFootprint) > FIT_EPS) {
        return bStats.maxFootprint - aStats.maxFootprint;
      }
      if (Math.abs(aStats.minHeight - bStats.minHeight) > FIT_EPS) {
        return aStats.minHeight - bStats.minHeight;
      }
      return bVol - aVol;
    }

    if (Math.abs(b.weight - a.weight) > FIT_EPS) return b.weight - a.weight;
    if (Math.abs(bVol - aVol) > FIT_EPS) return bVol - aVol;
    if (Math.abs(bStats.maxFootprint - aStats.maxFootprint) > FIT_EPS) {
      return bStats.maxFootprint - aStats.maxFootprint;
    }
    return aStats.minHeight - bStats.minHeight;
  });
}

function collectAxisCandidates(packed, max, size, axis, step) {
  const candidates = new Set([0, round2(Math.max(0, max))]);

  for (let value = 0; value <= max + FIT_EPS; value += step) {
    candidates.add(roundToStep(Math.min(value, max), step));
  }

  for (const box of packed) {
    const start = axis === 'x' ? box.x : box.z;
    const end = start + (axis === 'x' ? box.dX : box.dZ);
    for (const value of [start, end, start - size, end - size]) {
      if (value >= -FIT_EPS && value <= max + FIT_EPS) {
        candidates.add(round2(Math.max(0, Math.min(max, value))));
      }
    }
  }

  const sorted = [...candidates]
    .filter(value => value >= -FIT_EPS && value <= max + FIT_EPS)
    .sort((a, b) => a - b);

  if (sorted.length <= 180) return sorted;

  const capped = new Set(sorted.slice(0, 179));
  capped.add(round2(Math.max(0, max)));
  return [...capped].sort((a, b) => a - b);
}

function getDropHeight(packed, rect) {
  let y = 0;
  for (const box of packed) {
    if (!footprintsOverlap(rect, box)) continue;
    y = Math.max(y, box.y + box.dY);
  }
  return round2(y);
}

function getSupportRects(packed, y) {
  if (y <= SUPPORT_EPS) return [];
  return packed
    .filter(box => Math.abs((box.y + box.dY) - y) <= SUPPORT_EPS)
    .map(box => ({ x: box.x, z: box.z, dX: box.dX, dZ: box.dZ }));
}

function scoreCandidate(candidate, unit, packed, palL, palW, variant) {
  const { x, z, y, ori, support } = candidate;
  const top = y + ori.dY;
  const footprint = ori.dX * ori.dZ;
  const centerX = x + ori.dX / 2;
  const centerZ = z + ori.dZ / 2;
  const distToCenter = Math.hypot(centerX - palL / 2, centerZ - palW / 2);
  const sameLevelCount = packed.filter(box => Math.abs(box.y - y) <= SUPPORT_EPS).length;
  const supportPenalty = y > SUPPORT_EPS ? (1 - Math.min(1, support?.supportPercent || 0)) * 140000 : 0;
  const edgeBias = x * 100 + z;
  const weightLowBias = Number(unit.weight || 0) * y * 1200;

  if (variant === 'low-height') {
    return top * 12000000 + y * 600000 + ori.dY * 9000 + distToCenter * 90 - footprint * 16 + supportPenalty + weightLowBias;
  }

  if (variant === 'grid') {
    return top * 9500000 + edgeBias - footprint * 44 - sameLevelCount * 2800 + supportPenalty + weightLowBias;
  }

  if (variant === 'layers') {
    return y * 8500000 + top * 950000 + Math.abs(ori.dY - unit.dims.H) * 3200 + edgeBias - footprint * 20 + supportPenalty + weightLowBias;
  }

  return top * 10000000 + y * 900000 + edgeBias + distToCenter * 95 - footprint * 26 + supportPenalty + weightLowBias;
}

function findBestPlacement(unit, packed, palL, palW, maxH, variant, step, deadline) {
  const orientations = getOrientations(unit, palL, palW, maxH, variant);
  let best = null;

  for (const ori of orientations) {
    const maxX = Math.max(0, palL - ori.dX);
    const maxZ = Math.max(0, palW - ori.dZ);
    const xs = collectAxisCandidates(packed, maxX, ori.dX, 'x', step);
    const zs = collectAxisCandidates(packed, maxZ, ori.dZ, 'z', step);

    for (const z of zs) {
      if (Date.now() >= deadline) return best;
      for (const x of xs) {
        const rect = { x, z, dX: ori.dX, dZ: ori.dZ };
        const y = getDropHeight(packed, rect);
        if (unit.mustBeBase && y > SUPPORT_EPS) continue;
        if (y + ori.dY > maxH + FIT_EPS) continue;
        if (collides3D(packed, rect, y, ori.dY)) continue;

        let support = { supported: true, supportPercent: 1 };
        if (y > SUPPORT_EPS) {
          support = supportForRect(rect, getSupportRects(packed, y));
          if (!support.supported) continue;
        }

        const candidate = { x, z, y, ori, support };
        const score = scoreCandidate(candidate, unit, packed, palL, palW, variant);
        if (!best || score < best.score) best = { ...candidate, score };
      }
    }
  }

  return best;
}

function buildPackedItem(unit, placement) {
  return {
    x: placement.x,
    y: placement.y,
    z: placement.z,
    dX: placement.ori.dX,
    dY: placement.ori.dY,
    dZ: placement.ori.dZ,
    color: unit.color,
    name: unit.name,
    id: unit.id,
    uid: unit.uid,
    score: placement.score,
    weight: Number(unit.weight || 0),
    mustBeBase: !!unit.mustBeBase,
    noRotate: !!unit.noRotate,
    sourceDims: { ...unit.dims },
    supportPercent: placement.support?.supportPercent ?? 1,
    centerSupported: placement.support?.centerSupported ?? true,
  };
}

function stepForUnitCount(count) {
  if (count > 160) return 5;
  if (count > 90) return 4;
  return DEFAULT_GRID_RES;
}

function budgetForUnitCount(count, variantCount) {
  const total = count > 160 ? 1800 : count > 90 ? 2400 : 3400;
  return Math.max(650, Math.floor(total / Math.max(1, variantCount)));
}

function packVariant(products, dims, variant, deadline) {
  const units = expandUnits(products);
  sortUnits(units, variant);

  const packed = [];
  const step = stepForUnitCount(units.length);
  let queue = units;
  let round = 0;

  while (queue.length && round < 6 && Date.now() < deadline) {
    round += 1;
    const failed = [];
    let placedThisRound = 0;

    for (const unit of queue) {
      if (Date.now() >= deadline) {
        failed.push(unit);
        continue;
      }

      const placement = findBestPlacement(unit, packed, dims.palL, dims.palW, dims.maxH, variant, step, deadline);
      if (!placement) {
        failed.push(unit);
        continue;
      }

      packed.push(buildPackedItem(unit, placement));
      placedThisRound += 1;
    }

    if (!placedThisRound || failed.length === queue.length) break;
    queue = failed;
    sortUnits(queue, variant);
  }

  return packed;
}

function layoutMetrics(boxes, palL, palW) {
  const count = boxes.length;
  const volume = boxes.reduce((sum, box) => sum + box.dX * box.dY * box.dZ, 0);
  const top = boxes.reduce((max, box) => Math.max(max, box.y + box.dY), 0);
  const density = top > FIT_EPS ? volume / Math.max(1, palL * palW * top) : 0;
  const baseArea = boxes
    .filter(box => box.y <= SUPPORT_EPS)
    .reduce((sum, box) => sum + box.dX * box.dZ, 0);

  return { count, volume, top, density, baseArea };
}

function pickBestLayout(layouts, palL, palW) {
  const scored = layouts
    .filter(boxes => boxes?.length)
    .map(boxes => ({ boxes, metrics: layoutMetrics(boxes, palL, palW) }));

  if (!scored.length) return [];

  scored.sort((a, b) => {
    if (b.metrics.count !== a.metrics.count) return b.metrics.count - a.metrics.count;
    if (Math.abs(b.metrics.density - a.metrics.density) > 0.0001) return b.metrics.density - a.metrics.density;
    if (Math.abs(a.metrics.top - b.metrics.top) > FIT_EPS) return a.metrics.top - b.metrics.top;
    return b.metrics.baseArea - a.metrics.baseArea;
  });

  return scored[0].boxes;
}

export function runPalletPacking(products, { palL, palW, maxH, variant = 'auto' }) {
  const dims = {
    palL: Number(palL) || 0,
    palW: Number(palW) || 0,
    maxH: Number(maxH) || 0,
  };
  if (dims.palL <= 0 || dims.palW <= 0 || dims.maxH <= 0) return [];

  const totalUnits = (products || []).reduce((sum, product) => sum + Math.max(0, Math.floor(Number(product.qty) || 0)), 0);
  if (!totalUnits) return [];

  const variants = variant === 'auto'
    ? ['auto', 'grid', 'layers', 'low-height']
    : [...new Set([variant, 'auto'])];
  const budget = budgetForUnitCount(totalUnits, variants.length);
  const layouts = [];

  for (const currentVariant of variants) {
    const deadline = Date.now() + budget;
    layouts.push(packVariant(products, dims, currentVariant, deadline));
  }

  return pickBestLayout(layouts, dims.palL, dims.palW);
}
