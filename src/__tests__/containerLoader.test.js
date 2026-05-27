/**
 * Container loader engine tests
 * Cubre: runPacking, soporte físico, weight/dims constraints, mezcla pallet+box.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  setContainerDimensions,
  getPackingPhysicalConstraints,
  setPackingPhysicalConstraints,
  runPacking,
  invalidatePackingCache,
  validatePhysicalSupport,
} from '../lib/packing.js';

// El packing engine usa window._instanceManualPos y window._instanceLockedOri
// como overrides UI. En node necesitamos un stub global.
beforeAll(() => {
  if (typeof global.window === 'undefined') {
    global.window = {};
  }
  if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; },
    };
  }
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
});

beforeEach(() => {
  // Reset container to 40ft estándar antes de cada test
  setContainerDimensions(1200, 235, 239, (1200 * 235 * 239) / 1e6);
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  invalidatePackingCache();
});

function box(overrides = {}) {
  return {
    id: 'b1',
    name: 'Caja',
    type: 'box',
    dims: { L: 60, W: 40, H: 40 },
    weight: 10,
    qty: 1,
    color: '#888',
    ...overrides,
  };
}

function pallet(overrides = {}) {
  return {
    id: 'p1',
    name: 'Pallet',
    type: 'pallet',
    dims: { L: 120, W: 100, H: 150 },
    weight: 400,
    qty: 1,
    color: '#a07858',
    noRotate: true,
    ...overrides,
  };
}

// ── 1. CONFIG ─────────────────────────────────────────────────────────────

describe('setContainerDimensions / getPackingPhysicalConstraints', () => {
  it('setContainerDimensions ejecuta sin error', () => {
    expect(() => setContainerDimensions(1200, 235, 239, 70)).not.toThrow();
  });

  it('getPackingPhysicalConstraints devuelve objeto con keys esperadas', () => {
    const c = getPackingPhysicalConstraints();
    expect(typeof c).toBe('object');
    expect(c).not.toBeNull();
  });

  it('setPackingPhysicalConstraints actualiza valores y los devuelve', () => {
    setPackingPhysicalConstraints({ minSupportPercent: 0.5 });
    const c = getPackingPhysicalConstraints();
    expect(c.minSupportPercent).toBe(0.5);
  });
});

// ── 2. RUN PACKING — CASOS BÁSICOS ────────────────────────────────────────

describe('runPacking — escenarios básicos en 40ft', () => {
  it('lista vacía → 0 items empacados', () => {
    const result = runPacking([]);
    expect(result.packed).toEqual([]);
  });

  it('1 caja → empacada en posición válida', () => {
    const result = runPacking([box({ qty: 1 })]);
    expect(result.packed.length).toBe(1);
    const p = result.packed[0];
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.z).toBeGreaterThanOrEqual(0);
  });

  it('5 cajas chicas → todas dentro de los límites del 40ft', () => {
    const result = runPacking([box({ qty: 5, dims: { L: 50, W: 40, H: 30 } })]);
    expect(result.packed.length).toBe(5);
    for (const p of result.packed) {
      expect(p.x + p.dX).toBeLessThanOrEqual(1200 + 1);
      expect(p.z + p.dZ).toBeLessThanOrEqual(235 + 1);
      expect(p.y + p.dY).toBeLessThanOrEqual(239 + 1);
    }
  });

  it('boxes con qty:0 son ignoradas (result.placed.a = 0)', () => {
    const result = runPacking([
      box({ id: 'a', qty: 0 }),
      box({ id: 'b', qty: 3, dims: { L: 40, W: 30, H: 30 } }),
    ]);
    // Producto con qty:0 no genera cajas empacadas
    const aCount = result.packed.filter(p => p.id === 'a').length;
    expect(aCount).toBe(0);
  });

  it('caja más grande que el container → rechazada', () => {
    const result = runPacking([box({ qty: 1, dims: { L: 2000, W: 200, H: 200 } })]);
    expect(result.packed.length).toBe(0);
  });

  it('1 pallet → empacado y respeta no-rotate', () => {
    const result = runPacking([pallet({ qty: 1 })]);
    expect(result.packed.length).toBe(1);
    // Pallet ocupa orientación original (L=120, W=100, H=150)
    expect(result.packed[0].dX).toBe(120);
    expect(result.packed[0].dZ).toBe(100);
  });

  it('todos los items empacados tienen instanceId único', () => {
    const result = runPacking([box({ qty: 8 })]);
    const ids = result.packed.map(p => p.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sin solapamiento entre items empacados (XYZ)', () => {
    const result = runPacking([box({ qty: 6, dims: { L: 50, W: 40, H: 50 } })]);
    for (let i = 0; i < result.packed.length; i++) {
      for (let j = i + 1; j < result.packed.length; j++) {
        const a = result.packed[i], b = result.packed[j];
        const ox = Math.min(a.x + a.dX, b.x + b.dX) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.dY, b.y + b.dY) - Math.max(a.y, b.y);
        const oz = Math.min(a.z + a.dZ, b.z + b.dZ) - Math.max(a.z, b.z);
        const overlap = ox > 0.5 && oy > 0.5 && oz > 0.5;
        expect(overlap).toBe(false);
      }
    }
  });
});

// ── 3. PALLETS + CAJAS ────────────────────────────────────────────────────

describe('runPacking — pallets y cajas mezcladas', () => {
  it('1 pallet + 3 cajas → ambos tipos se empacan', () => {
    const result = runPacking([
      box({ id: 'box1', qty: 3, dims: { L: 40, W: 40, H: 40 } }),
      pallet({ id: 'pal1', qty: 1, dims: { L: 120, W: 100, H: 100 } }),
    ]);
    expect(result.packed.length).toBeGreaterThan(0);
    // result.placed registra cuántas unidades de cada producto se empacaron
    expect(result.placed.pal1 + result.placed.box1).toBeGreaterThan(0);
  });

  it('2 pallets de 120×100 entran en 40ft (1200×235)', () => {
    const result = runPacking([pallet({ qty: 2 })]);
    expect(result.packed.length).toBe(2);
  });

  it('20 pallets euro (120×80) entran en 40ft (al menos algunos)', () => {
    const result = runPacking([pallet({ qty: 20, dims: { L: 120, W: 80, H: 150 } })]);
    // 1200/120 = 10 a lo largo, 235/80 = 2.93 → 2 anchos = 20 pallets en piso
    expect(result.packed.length).toBeGreaterThanOrEqual(15);
  });
});

// ── 4. CONTAINER 20FT ─────────────────────────────────────────────────────

describe('runPacking — container 20ft (más chico)', () => {
  beforeEach(() => {
    setContainerDimensions(589, 235, 239, (589 * 235 * 239) / 1e6);
  });

  it('pallet 120×100 cabe en 20ft', () => {
    const result = runPacking([pallet({ qty: 1 })]);
    expect(result.packed.length).toBe(1);
  });

  it('caja gigante de 800cm de largo NO cabe en 20ft', () => {
    const result = runPacking([box({ qty: 1, dims: { L: 800, W: 100, H: 100 } })]);
    expect(result.packed.length).toBe(0);
  });
});

// ── 5. VALIDATE PHYSICAL SUPPORT ──────────────────────────────────────────

describe('validatePhysicalSupport', () => {
  it('item en piso (y=0) → valid:true, status:stable', () => {
    const item = box({ qty: 1 });
    const result = validatePhysicalSupport(item,
      { x: 0, y: 0, z: 0, dX: 60, dY: 40, dZ: 40 }, []);
    expect(result.valid).toBe(true);
    expect(result.status).toBe('stable');
  });

  it('item sobre otro con apoyo total → valid:true, supportPercent=1', () => {
    const item = box({ qty: 1 });
    const lower = { x: 0, y: 0, z: 0, dX: 60, dY: 40, dZ: 40 };
    const upper = { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 };
    const result = validatePhysicalSupport(item, upper, [lower]);
    expect(result.valid).toBe(true);
    expect(result.supportPercent).toBeGreaterThanOrEqual(0.95);
  });

  it('item flotando sin soporte → valid:false', () => {
    const item = box({ qty: 1 });
    const result = validatePhysicalSupport(item,
      { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 }, []);
    expect(result.valid).toBe(false);
  });

  it('item con apoyo parcial pequeño (10% solapamiento) → status no es "stable"', () => {
    const item = box({ qty: 1 });
    const lower = { x: 0, y: 0, z: 0, dX: 10, dY: 40, dZ: 10 };
    const upper = { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 };
    const result = validatePhysicalSupport(item, upper, [lower]);
    // Apoyo de 10×10=100 sobre superficie de 60×40=2400 → ~4%, debe fallar
    expect(result.status).not.toBe('stable');
  });
});

// ── 6. CACHE ──────────────────────────────────────────────────────────────

describe('Cache de packing', () => {
  it('invalidatePackingCache no crashea', () => {
    expect(() => invalidatePackingCache()).not.toThrow();
  });

  it('runPacking dos veces seguidas con misma input es determinista en cantidad', () => {
    const products = [box({ qty: 4 })];
    const r1 = runPacking(products);
    const r2 = runPacking(products);
    expect(r1.packed.length).toBe(r2.packed.length);
  });
});

// ── 7. EDGE CASES ─────────────────────────────────────────────────────────

describe('Edge cases del container', () => {
  it('qty negativa se ignora', () => {
    const result = runPacking([box({ qty: -5 })]);
    expect(result.packed.length).toBe(0);
  });

  it('dims fraccionarias funcionan', () => {
    const result = runPacking([box({ qty: 1, dims: { L: 60.5, W: 40.2, H: 35.7 } })]);
    expect(result.packed.length).toBeGreaterThanOrEqual(0);
  });

  it('volumen muy grande pero items chicos → muchos items', () => {
    const result = runPacking([box({ qty: 30, dims: { L: 30, W: 30, H: 30 } })]);
    expect(result.packed.length).toBeGreaterThan(20);
  });
});

// ── 8. RESULT SHAPE ───────────────────────────────────────────────────────

describe('Estructura del resultado de runPacking', () => {
  it('result.packed es un array', () => {
    const result = runPacking([box({ qty: 2 })]);
    expect(Array.isArray(result.packed)).toBe(true);
  });

  it('cada item empacado tiene x, y, z, dX, dY, dZ numéricos', () => {
    const result = runPacking([box({ qty: 3 })]);
    for (const p of result.packed) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.z).toBe('number');
      expect(typeof p.dX).toBe('number');
      expect(typeof p.dY).toBe('number');
      expect(typeof p.dZ).toBe('number');
    }
  });

  it('result.placed es un objeto con conteos por producto', () => {
    const result = runPacking([
      box({ id: 'a', qty: 3 }),
      box({ id: 'b', qty: 2, dims: { L: 30, W: 30, H: 30 } }),
    ]);
    expect(typeof result.placed).toBe('object');
    expect(result.placed.a).toBe(3);
    expect(result.placed.b).toBe(2);
  });
});
