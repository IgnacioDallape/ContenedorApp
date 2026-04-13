import { create } from 'zustand';
import { PB_COLORS, PB_PALLET_TYPES } from '../lib/constants.js';

const PB_GRID_RES = 2;

function pb_makeHM(palW, palL) {
  const cols = Math.ceil((palL + PB_GRID_RES) / PB_GRID_RES);
  const rows = Math.ceil((palW + PB_GRID_RES) / PB_GRID_RES);
  return { data: new Float32Array(cols * rows), cols, rows, palL, palW };
}

function pb_hmGetMax(hm, px, pz, dX, dZ) {
  const gx0 = Math.max(0, Math.floor(px / PB_GRID_RES));
  const gz0 = Math.max(0, Math.floor(pz / PB_GRID_RES));
  const gx1 = Math.min(hm.cols, Math.ceil((px + dX) / PB_GRID_RES));
  const gz1 = Math.min(hm.rows, Math.ceil((pz + dZ) / PB_GRID_RES));
  let max = 0;
  for (let gz = gz0; gz < gz1; gz++)
    for (let gx = gx0; gx < gx1; gx++)
      max = Math.max(max, hm.data[gz * hm.cols + gx]);
  return max;
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

export function pb_runPacking(products, palL, palW, maxH) {
  const hm = pb_makeHM(palW, palL);
  const packed = [];

  const units = [];
  for (const p of products) {
    for (let i = 0; i < p.qty; i++) units.push({ ...p, _idx: i });
  }

  units.sort((a, b) => {
    if (a.mustBeBase !== b.mustBeBase) return a.mustBeBase ? -1 : 1;
    const footprintA = Math.max(a.dims.L * a.dims.W, a.dims.L * a.dims.H, a.dims.W * a.dims.H);
    const footprintB = Math.max(b.dims.L * b.dims.W, b.dims.L * b.dims.H, b.dims.W * b.dims.H);
    if (footprintB !== footprintA) return footprintB - footprintA;
    return Math.max(b.dims.L, b.dims.W, b.dims.H) - Math.max(a.dims.L, a.dims.W, a.dims.H);
  });

  for (const u of units) {
    const orientations = [
      { dX: u.dims.L, dZ: u.dims.W, dY: u.dims.H },
      { dX: u.dims.W, dZ: u.dims.L, dY: u.dims.H },
      { dX: u.dims.L, dZ: u.dims.H, dY: u.dims.W },
      { dX: u.dims.H, dZ: u.dims.L, dY: u.dims.W },
      { dX: u.dims.W, dZ: u.dims.H, dY: u.dims.L },
      { dX: u.dims.H, dZ: u.dims.W, dY: u.dims.L },
    ].filter(o => o.dX <= palL + 1 && o.dZ <= palW + 1 && o.dY > 0);

    let bestScore = Infinity, bestPx = -1, bestPz = -1, bestH = 0, bestOri = null;

    for (const ori of orientations) {
      for (let px = 0; px + ori.dX <= palL + 1; px += PB_GRID_RES) {
        for (let pz = 0; pz + ori.dZ <= palW + 1; pz += PB_GRID_RES) {
          const h = pb_hmGetMax(hm, px, pz, ori.dX, ori.dZ);
          if (h + ori.dY > maxH + 0.1) continue;
          if (u.mustBeBase && h > 0.1) continue;
          const score = h * 1000000 + px * 100 + pz;
          if (score < bestScore) { bestScore = score; bestH = h; bestPx = px; bestPz = pz; bestOri = ori; }
        }
      }
    }

    if (bestPx === -1) continue;
    pb_hmSet(hm, bestPx, bestPz, bestOri.dX, bestOri.dZ, bestH + bestOri.dY);
    packed.push({
      x: bestPx, y: bestH, z: bestPz,
      dX: bestOri.dX, dY: bestOri.dY, dZ: bestOri.dZ,
      color: u.color, name: u.name, id: u.id,
    });
  }

  return packed;
}

const usePalletStore = create((set, get) => ({
  palletType:   'euro',
  maxHeight:    180,
  products:     [],
  results:      [],
  activeResult: 0,
  editingId:    null,

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

    // Calculate pallets needed
    const totalUnits = products.reduce((s, p) => s + p.qty, 0);
    const pallets = [];
    let remaining = products.map(p => ({ ...p }));

    while (remaining.some(p => p.qty > 0)) {
      const boxes = pb_runPacking(
        remaining.filter(p => p.qty > 0),
        palL, palW, maxHeight
      );
      if (!boxes.length) break;

      // Count placed
      const placedCounts = {};
      boxes.forEach(b => { placedCounts[b.id] = (placedCounts[b.id] || 0) + 1; });
      const totalH = boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
      const totalW = boxes.reduce((s, b) => s + b.dX * b.dZ * b.dY / 1e6, 0);

      pallets.push({
        idx: pallets.length,
        palL, palW, maxHeight,
        boxes,
        totalHeight: totalH + 14,
        totalWeight: remaining.filter(p => p.qty > 0).reduce((s, p) => s + (p.weight || 0) * (placedCounts[p.id] || 0), 0),
        products: products.map(p => ({ ...p, placedQty: placedCounts[p.id] || 0 })),
      });

      remaining = remaining.map(p => ({
        ...p,
        qty: p.qty - (placedCounts[p.id] || 0),
      }));

      if (pallets.length > 50) break; // safety
    }

    set({ results: pallets, activeResult: 0 });
  },

  setActiveResult(idx) { set({ activeResult: idx }); },
  clearResults() { set({ results: [], activeResult: 0 }); },
}));

export default usePalletStore;
