/**
 * Suite exhaustiva del motor de CONTENEDOR (packing.js).
 * Cubre: los 5 tipos de contenedor, apilado multinivel, pins manuales, lock de
 * orientación, zonas de prioridad, constraints físicos reales, cache, y casos
 * borde que pueden producir errores (palletBase=0, dims corruptas).
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  setContainerDimensions,
  setPackingPhysicalConstraints,
  runPacking,
  runPackingCached,
  invalidatePackingCache,
  validatePhysicalSupport,
} from '../lib/packing.js';
import { assertContainerInvariants, expectNoFloaters } from './engineHelpers.js';

const TYPES = {
  '20ft': { L: 589, W: 235, H: 239 },
  '40ft': { L: 1200, W: 235, H: 239 },
  '40hc': { L: 1200, W: 235, H: 269 },
  semi145: { L: 1450, W: 244, H: 270 },
  semi155: { L: 1550, W: 244, H: 270 },
};

function setType(t) {
  const d = TYPES[t];
  setContainerDimensions(d.L, d.W, d.H, (d.L * d.W * d.H) / 1e6);
}

function box(o = {}) {
  return { id: 'b', name: 'Caja', type: 'box', dims: { L: 60, W: 40, H: 40 }, weight: 10, qty: 1, color: '#888', ...o };
}
function pallet(o = {}) {
  return { id: 'p', name: 'Pallet', type: 'pallet', dims: { L: 120, W: 100, H: 150 }, weight: 400, qty: 1, color: '#a07', noRotate: true, ...o };
}

beforeAll(() => {
  if (typeof global.window === 'undefined') global.window = {};
  if (typeof global.localStorage === 'undefined') {
    const s = {};
    global.localStorage = { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, clear: () => { for (const k in s) delete s[k]; } };
  }
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
});

beforeEach(() => {
  setType('40ft');
  setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.8, ALLOW_OVERHANG: false, ALLOW_AUXILIARY_SUPPORT: false, CENTER_OF_GRAVITY_CHECK: true });
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.window._palletsWithNoSpace = [];
  invalidatePackingCache();
});

// ── 1. Los 5 tipos de contenedor respetan invariantes ──────────────────────
describe('runPacking — invariantes en los 5 tipos de contenedor', () => {
  for (const t of Object.keys(TYPES)) {
    it(`${t}: cajas mixtas → sin overlap, dentro de límites, finitas`, () => {
      setType(t);
      const d = TYPES[t];
      const result = runPacking([
        box({ id: 'a', qty: 12, dims: { L: 50, W: 40, H: 40 } }),
        box({ id: 'c', qty: 8, dims: { L: 35, W: 35, H: 35 } }),
      ]);
      expect(result.packed.length).toBeGreaterThan(0);
      assertContainerInvariants(result.packed, d.L, d.W, d.H, t);
    });

    it(`${t}: pallets euro → sin overlap y dentro de límites`, () => {
      setType(t);
      const d = TYPES[t];
      const result = runPacking([pallet({ qty: 8, dims: { L: 120, W: 80, H: 140 } })]);
      assertContainerInvariants(result.packed, d.L, d.W, d.H, t);
    });
  }
});

// ── 2. Apilado multinivel ──────────────────────────────────────────────────
describe('runPacking — apilado multinivel', () => {
  it('muchas cajas que fuerzan capas → sin overlap, sin flotantes, dentro de límites', () => {
    setType('20ft');
    const result = runPacking([box({ id: 'm', qty: 40, dims: { L: 100, W: 100, H: 60 } })]);
    expect(result.packed.length).toBeGreaterThan(5);
    // Debe haber al menos una caja por encima del piso (apiló)
    expect(result.packed.some(p => p.y > 1)).toBe(true);
    assertContainerInvariants(result.packed, 589, 235, 239, 'stack');
    expectNoFloaters(result.packed, 1, 'stack');
  });
});

// ── 3. Pins manuales (window._instanceManualPos) ───────────────────────────
describe('runPacking — pin manual de instancia', () => {
  it('una instancia pineada se coloca en la posición pedida (clamp+snap)', () => {
    global.window._instanceManualPos = { 'pinned_0': { x: 300, z: 100 } };
    const result = runPacking([box({ id: 'pinned', qty: 1, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = result.packed.find(p => p.instanceId === 'pinned_0');
    expect(inst).toBeTruthy();
    expect(Math.abs(inst.x - 300)).toBeLessThanOrEqual(5);
    expect(Math.abs(inst.z - 100)).toBeLessThanOrEqual(5);
  });
});

// ── 4. Lock de orientación (window._instanceLockedOri) ─────────────────────
describe('runPacking — orientación bloqueada', () => {
  it('una instancia con orientación lockeada respeta dX/dZ', () => {
    global.window._instanceLockedOri = { 'lk_0': { dX: 40, dZ: 60, dY: 40 } };
    const result = runPacking([box({ id: 'lk', qty: 1, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = result.packed.find(p => p.instanceId === 'lk_0');
    expect(inst).toBeTruthy();
    expect(inst.dX).toBe(40);
    expect(inst.dZ).toBe(60);
    expect(inst.dY).toBe(40);
  });
});

// ── 5. Zonas de prioridad ──────────────────────────────────────────────────
describe('runPacking — zonas de prioridad', () => {
  it('producto con priorityZone se empaca y mantiene invariantes', () => {
    const result = runPacking([
      box({ id: 'prio', qty: 4, dims: { L: 50, W: 50, H: 50 }, priorityZone: { x: 1100, y: 0, z: 180 }, priorityZoneSlot: 0 }),
      box({ id: 'rest', qty: 10, dims: { L: 40, W: 40, H: 40 } }),
    ]);
    expect(result.packed.length).toBeGreaterThan(0);
    assertContainerInvariants(result.packed, 1200, 235, 239, 'prio');
    // Las cajas de prioridad existen
    expect(result.packed.some(p => p.productId === 'prio')).toBe(true);
  });
});

// ── 6. Constraints físicos reales afectan el resultado ─────────────────────
describe('validatePhysicalSupport — constraints reales cambian el veredicto', () => {
  const item = box({ qty: 1 });
  const lower = { x: 0, y: 0, z: 0, dX: 10, dY: 40, dZ: 10 };
  const upper = { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 };

  it('apoyo ~4% con ALLOW_AUXILIARY_SUPPORT=false → valid:false', () => {
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: false });
    expect(validatePhysicalSupport(item, upper, [lower]).valid).toBe(false);
  });

  it('apoyo ~4% con ALLOW_AUXILIARY_SUPPORT=true → aceptado como auxiliar', () => {
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: true });
    const r = validatePhysicalSupport(item, upper, [lower]);
    expect(r.valid).toBe(true);
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: false });
  });
});

// ── 7. Forma del resultado ─────────────────────────────────────────────────
describe('runPacking — forma del resultado', () => {
  it('expone packed, placed (por id), warnings y supportSummary', () => {
    const result = runPacking([box({ id: 'a', qty: 3 }), box({ id: 'b', qty: 2, dims: { L: 30, W: 30, H: 30 } })]);
    expect(Array.isArray(result.packed)).toBe(true);
    expect(result.placed.a).toBe(3);
    expect(result.placed.b).toBe(2);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.supportSummary).toBeDefined();
  });
});

// ── 8. Cache ───────────────────────────────────────────────────────────────
describe('runPackingCached — consistencia', () => {
  it('mismo input → mismas posiciones exactas', () => {
    const products = [box({ id: 'a', qty: 6 }), pallet({ id: 'p', qty: 2 })];
    const r1 = runPackingCached(products);
    const r2 = runPackingCached(products);
    expect(r1.packed.length).toBe(r2.packed.length);
    for (let i = 0; i < r1.packed.length; i++) {
      expect(r1.packed[i].x).toBe(r2.packed[i].x);
      expect(r1.packed[i].y).toBe(r2.packed[i].y);
      expect(r1.packed[i].z).toBe(r2.packed[i].z);
    }
  });
});

// ── 9. Regresión: pallet con packedItems y palletBase inválida ─────────────
describe('runPacking — regresión palletBase=0 (división por cero en heightmap)', () => {
  it('pallet con packedItems y palletBase {L:0,W:0} no produce overlap con cajas sueltas', () => {
    const palletWithItems = {
      id: 'palz', name: 'P', type: 'pallet', qty: 1, color: '#888',
      dims: { L: 120, W: 100, H: 100 },
      palletBase: { L: 0, W: 0 }, // entrada corrupta → no debe romper el heightmap
      packedItems: [{ x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40, sourceDims: { L: 40, W: 40, H: 40 } }],
    };
    const result = runPacking([palletWithItems, box({ id: 'loose', qty: 12, dims: { L: 50, W: 50, H: 50 } })]);
    // Invariante duro: nada se solapa ni queda fuera de límites ni con dims no finitas
    assertContainerInvariants(result.packed, 1200, 235, 239, 'palletBase0');
  });
});
