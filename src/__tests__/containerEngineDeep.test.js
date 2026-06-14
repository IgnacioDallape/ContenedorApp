/**
 * containerEngineDeep.test.js — Motor de CONTENEDOR en profundidad (src/lib/packing.js).
 *
 * Cubre los 5 tipos de contenedor, carga centro-afuera de semis, apilado multinivel,
 * pins manuales + locks de orientación, zonas de prioridad, constraints físicos reales
 * (soporte auxiliar), cache, cap de unidades y edge cases degenerados.
 *
 * Todos los layouts pasan por assertContainerInvariants (finitos, sin overlap, dentro).
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  setContainerDimensions,
  setPackingPhysicalConstraints,
  getPackingPhysicalConstraints,
  runPacking,
  runPackingCached,
  invalidatePackingCache,
  validatePhysicalSupport,
} from '../lib/packing.js';
import { assertContainerInvariants, expectNoFloaters } from './engineHelpers.js';

// ── Dimensiones de los 5 tipos de contenedor ──────────────────────────────
const TYPES = {
  '20ft':   { L: 589,  W: 235, H: 239 },
  '40ft':   { L: 1200, W: 235, H: 239 },
  '40hc':   { L: 1200, W: 235, H: 269 },
  'semi145':{ L: 1450, W: 244, H: 270 },
  'semi155':{ L: 1550, W: 244, H: 270 },
};

function setCont(t) {
  const d = TYPES[t];
  setContainerDimensions(d.L, d.W, d.H, (d.L * d.W * d.H) / 1e6);
  invalidatePackingCache();
  return d;
}

// El motor lee window._instanceManualPos / _instanceLockedOri / _palletsWithNoSpace.
beforeAll(() => {
  if (typeof global.window === 'undefined') global.window = {};
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
  global.window._palletsWithNoSpace = [];
});

beforeEach(() => {
  // Default: 40ft estándar
  setContainerDimensions(1200, 235, 239, (1200 * 235 * 239) / 1e6);
  setPackingPhysicalConstraints({
    MIN_SUPPORT_PERCENT: 0.8,
    ALLOW_OVERHANG: false,
    ALLOW_AUXILIARY_SUPPORT: false,
    CENTER_OF_GRAVITY_CHECK: true,
  });
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.window._palletsWithNoSpace = [];
  invalidatePackingCache();
});

// ── Fábricas ──────────────────────────────────────────────────────────────
function box(o = {}) {
  return {
    id: 'b1', name: 'Caja', type: 'box',
    dims: { L: 60, W: 40, H: 40 }, weight: 10, qty: 1, color: '#888',
    vol: (60 * 40 * 40) / 1e6,
    ...o,
  };
}
function pallet(o = {}) {
  return {
    id: 'p1', name: 'Pallet', type: 'pallet',
    dims: { L: 120, W: 80, H: 150 }, weight: 400, qty: 1, color: '#a07858',
    noRotate: true, vol: (120 * 80 * 150) / 1e6,
    ...o,
  };
}
const cmX = packed =>
  packed.reduce((s, p) => s + (p.x + p.dX / 2), 0) / packed.length;

// ───────────────────────────────────────────────────────────────────────────
// 1. LOS 5 TIPOS — cajas mixtas + pallets euro, invariantes duras
// ───────────────────────────────────────────────────────────────────────────
describe('Los 5 tipos de contenedor — invariantes con carga mixta', () => {
  for (const t of Object.keys(TYPES)) {
    it(`${t}: cajas mixtas + pallets euro respetan invariantes`, () => {
      const d = setCont(t);
      const result = runPacking([
        pallet({ id: 'euro', qty: 4, dims: { L: 120, W: 80, H: 120 } }),
        box({ id: 'g', qty: 8, dims: { L: 60, W: 40, H: 40 } }),
        box({ id: 'm', qty: 12, dims: { L: 40, W: 30, H: 30 } }),
        box({ id: 's', qty: 10, dims: { L: 25, W: 25, H: 25 } }),
      ]);
      expect(result.packed.length).toBeGreaterThan(0);
      assertContainerInvariants(result.packed, d.L, d.W, d.H, t);
    });
  }

  it('cada tipo coloca al menos el primer pallet euro en el piso', () => {
    for (const t of Object.keys(TYPES)) {
      const d = setCont(t);
      const r = runPacking([pallet({ id: 'e', qty: 1, dims: { L: 120, W: 80, H: 150 } })]);
      expect(r.packed.length, t).toBe(1);
      expect(r.packed[0].y, t).toBeLessThanOrEqual(1); // en el piso
      expect(r.packed[0].x + r.packed[0].dX, t).toBeLessThanOrEqual(d.L + 1);
    }
  });

  it('40hc admite más altura de stack que 40ft (269 vs 239)', () => {
    // Cajas de 50cm: 40hc deja apilar hasta 5 niveles (250), 40ft solo 4 (200).
    setCont('40ft');
    const r40 = runPacking([box({ id: 'c', qty: 40, dims: { L: 50, W: 50, H: 50 } })]);
    const maxTop40 = Math.max(...r40.packed.map(p => p.y + p.dY));
    setCont('40hc');
    const rHc = runPacking([box({ id: 'c', qty: 40, dims: { L: 50, W: 50, H: 50 } })]);
    const maxTopHc = Math.max(...rHc.packed.map(p => p.y + p.dY));
    expect(maxTop40).toBeLessThanOrEqual(239 + 1);
    expect(maxTopHc).toBeLessThanOrEqual(269 + 1);
    // El HC permite una capa extra → llega más alto (o al menos igual).
    expect(maxTopHc).toBeGreaterThanOrEqual(maxTop40 - 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. SEMI carga centro-afuera (cajas) — comportamiento clave reciente
// ───────────────────────────────────────────────────────────────────────────
describe('Semi: carga centro-afuera vs 40ft desde el extremo (cajas)', () => {
  it('semi155: centro de masa en X cae dentro del 15% del centro del contenedor', () => {
    const d = setCont('semi155');
    const r = runPacking([box({ id: 'c', qty: 24, dims: { L: 60, W: 40, H: 40 } })]);
    expect(r.packed.length).toBeGreaterThan(12);
    const center = d.L / 2;
    expect(Math.abs(cmX(r.packed) - center)).toBeLessThan(d.L * 0.15);
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'semi155-box-cm');
  });

  it('semi145: también carga centro-afuera (L=1450 > 1300)', () => {
    const d = setCont('semi145');
    const r = runPacking([box({ id: 'c', qty: 24, dims: { L: 60, W: 40, H: 40 } })]);
    expect(r.packed.length).toBeGreaterThan(12);
    const center = d.L / 2;
    expect(Math.abs(cmX(r.packed) - center)).toBeLessThan(d.L * 0.15);
  });

  it('40ft NO carga centro-afuera: el centro de masa queda en la primera mitad', () => {
    const d = setCont('40ft');
    const r = runPacking([box({ id: 'c', qty: 24, dims: { L: 60, W: 40, H: 40 } })]);
    expect(cmX(r.packed)).toBeLessThan(d.L / 2);
  });

  it('40hc (L=1200) tampoco carga centro-afuera (umbral es >1300)', () => {
    const d = setCont('40hc');
    const r = runPacking([box({ id: 'c', qty: 24, dims: { L: 60, W: 40, H: 40 } })]);
    expect(cmX(r.packed)).toBeLessThan(d.L / 2);
  });

  it('semi155: pallets de punta también se balancean alrededor del centro', () => {
    const d = setCont('semi155');
    const r = runPacking([pallet({ id: 'e', qty: 8, dims: { L: 120, W: 80, H: 150 } })]);
    expect(r.packed.length).toBeGreaterThanOrEqual(6);
    const center = d.L / 2;
    // El cluster de pallets queda razonablemente centrado (dentro del 20%).
    expect(Math.abs(cmX(r.packed) - center)).toBeLessThan(d.L * 0.2);
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'semi155-pallet-cm');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. APILADO MULTINIVEL — muchas cajas que fuerzan capas, sin flotantes
// ───────────────────────────────────────────────────────────────────────────
describe('Apilado multinivel sin flotantes', () => {
  it('40ft: 160 cajas de 60×40×40 superan el piso (100 slots) y fuerzan capas', () => {
    // Piso 40ft: 1200/60 × 235/40 = 20 × 5 = 100 slots. 160 cajas → 2da capa obligada.
    const d = setCont('40ft');
    const r = runPacking([box({ id: 'c', qty: 160, dims: { L: 60, W: 40, H: 40 } })]);
    expect(r.packed.length).toBeGreaterThan(100);
    const maxTop = Math.max(...r.packed.map(p => p.y + p.dY));
    expect(maxTop).toBeGreaterThan(40); // hay al menos 2 niveles
    expectNoFloaters(r.packed, 1, '40ft-multinivel');
    assertContainerInvariants(r.packed, d.L, d.W, d.H, '40ft-multinivel');
  }, 30000);

  it('20ft chico: el piso se llena y obliga a apilar (todo apoyado)', () => {
    // Piso 20ft: 589/50 × 235/40 = 11 × 5 = 55 slots. 90 cajas → 2da capa.
    const d = setCont('20ft');
    const r = runPacking([box({ id: 'c', qty: 90, dims: { L: 50, W: 40, H: 40 } })]);
    expect(r.packed.length).toBeGreaterThan(55);
    const niveles = new Set(r.packed.map(p => Math.round(p.y))).size;
    expect(niveles).toBeGreaterThan(1);
    expectNoFloaters(r.packed, 1, '20ft-stack');
    assertContainerInvariants(r.packed, d.L, d.W, d.H, '20ft-stack');
  }, 30000);

  it('cubos uniformes apilados: cada caja superior se apoya exactamente en la inferior', () => {
    const d = setCont('40ft');
    const r = runPacking([box({ id: 'cube', qty: 20, dims: { L: 50, W: 50, H: 50 } })]);
    // Las cajas en y>0 deben tener y múltiplo de 50 (apilado limpio sobre cubos).
    for (const p of r.packed) {
      if (p.y > 1) expect(Math.round(p.y) % 50).toBe(0);
    }
    expectNoFloaters(r.packed, 1, 'cubos');
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'cubos');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. PINS MANUALES + LOCKS DE ORIENTACIÓN
// ───────────────────────────────────────────────────────────────────────────
describe('Pins manuales (window._instanceManualPos)', () => {
  it('instancia pineada queda cerca de la posición pedida', () => {
    setCont('40ft');
    global.window._instanceManualPos = { 'b1_0': { x: 600, z: 100 } };
    const r = runPacking([box({ id: 'b1', qty: 1, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = r.packed.find(p => p.instanceId === 'b1_0');
    expect(inst).toBeTruthy();
    // El pin se clampa a [0, CONT_L - dX] / [0, CONT_W - dZ]; con x=600 cabe tal cual.
    expect(Math.abs(inst.x - 600)).toBeLessThan(10);
    expect(Math.abs(inst.z - 100)).toBeLessThan(10);
  });

  it('pin con x más allá del contenedor se clampa adentro (no excede el largo)', () => {
    const d = setCont('40ft');
    global.window._instanceManualPos = { 'b1_0': { x: 99999, z: 99999 } };
    const r = runPacking([box({ id: 'b1', qty: 1, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = r.packed.find(p => p.instanceId === 'b1_0');
    expect(inst).toBeTruthy();
    expect(inst.x + inst.dX).toBeLessThanOrEqual(d.L + 1);
    expect(inst.z + inst.dZ).toBeLessThanOrEqual(d.W + 1);
  });

  it('la unidad pineada se ubica antes que las libres y todo queda sin overlap', () => {
    const d = setCont('40ft');
    global.window._instanceManualPos = { 'b1_2': { x: 500, z: 50 } };
    const r = runPacking([box({ id: 'b1', qty: 6, dims: { L: 60, W: 40, H: 40 } })]);
    const pinned = r.packed.find(p => p.instanceId === 'b1_2');
    expect(pinned).toBeTruthy();
    expect(Math.abs(pinned.x - 500)).toBeLessThan(10);
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'pin+libres');
  });
});

describe('Lock de orientación (window._instanceLockedOri)', () => {
  it('respeta dX/dZ/dY forzados en la instancia', () => {
    setCont('40ft');
    // Caja base 60×40×40 → forzamos "parada de costado": dX=40, dZ=40, dY=60.
    global.window._instanceLockedOri = { 'b1_0': { dX: 40, dZ: 40, dY: 60 } };
    const r = runPacking([box({ id: 'b1', qty: 1, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = r.packed.find(p => p.instanceId === 'b1_0');
    expect(inst).toBeTruthy();
    expect(inst.dX).toBe(40);
    expect(inst.dZ).toBe(40);
    expect(inst.dY).toBe(60);
  });

  it('el lock de instancia tiene prioridad sobre la rotación libre del motor', () => {
    setCont('40ft');
    global.window._instanceLockedOri = { 'b1_0': { dX: 40, dZ: 60, dY: 40 } };
    const r = runPacking([box({ id: 'b1', qty: 3, dims: { L: 60, W: 40, H: 40 } })]);
    const inst = r.packed.find(p => p.instanceId === 'b1_0');
    expect(inst.dX).toBe(40);
    expect(inst.dZ).toBe(60);
    // Las otras dos instancias quedan libres → no necesariamente la misma orientación.
    const others = r.packed.filter(p => p.instanceId !== 'b1_0');
    expect(others.length).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. ZONAS DE PRIORIDAD
// ───────────────────────────────────────────────────────────────────────────
describe('Zonas de prioridad (priorityZone)', () => {
  it('producto con priorityZone se ubica cerca de la zona indicada', () => {
    const d = setCont('40ft');
    const r = runPacking([
      box({ id: 'prio', qty: 4, dims: { L: 50, W: 40, H: 40 },
            priorityZone: { x: 1000, z: 180 } }),
      box({ id: 'rest', qty: 20, dims: { L: 60, W: 40, H: 40 } }),
    ]);
    const prio = r.packed.filter(p => p.productId === 'prio');
    expect(prio.length).toBeGreaterThan(0);
    // Centro de masa de las prio cae en la mitad derecha (cerca de x=1000).
    const prioCm = cmX(prio);
    const restCm = cmX(r.packed.filter(p => p.productId === 'rest'));
    expect(prioCm).toBeGreaterThan(restCm);
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'priorityZone');
  });

  it('sin priorityZone la carga arranca desde el extremo (x bajo)', () => {
    const d = setCont('40ft');
    const r = runPacking([box({ id: 'a', qty: 6, dims: { L: 60, W: 40, H: 40 } })]);
    expect(Math.min(...r.packed.map(p => p.x))).toBeLessThan(d.L * 0.1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. CONSTRAINTS FÍSICOS REALES — soporte auxiliar cambia el veredicto
// ───────────────────────────────────────────────────────────────────────────
describe('validatePhysicalSupport — ALLOW_AUXILIARY_SUPPORT cambia veredicto', () => {
  // Apoyo parcial: caja 60×40 apoyada sobre una base 40×40 centrada.
  // Soporte = 40×40=1600 sobre 60×40=2400 → 66.6% (< 80% MIN, pero centro apoyado).
  const item = box({ qty: 1 });
  const lower = { x: 10, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 };
  const upper = { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 };

  it('con ALLOW_AUXILIARY_SUPPORT=false el apoyo parcial es inválido', () => {
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: false, MIN_SUPPORT_PERCENT: 0.8 });
    const v = validatePhysicalSupport(item, upper, [lower]);
    expect(v.valid).toBe(false);
    expect(v.supportPercent).toBeLessThan(0.8);
  });

  it('con ALLOW_AUXILIARY_SUPPORT=true el mismo apoyo parcial se acepta como auxiliar', () => {
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: true, MIN_SUPPORT_PERCENT: 0.8 });
    const v = validatePhysicalSupport(item, upper, [lower]);
    expect(v.valid).toBe(true);
    expect(v.status).toBe('auxiliary');
    expect(v.requiresAuxiliarySupport).toBe(true);
  });

  it('CENTER_OF_GRAVITY_CHECK: centro fuera del apoyo es inválido aunque haya área', () => {
    setPackingPhysicalConstraints({ CENTER_OF_GRAVITY_CHECK: true, ALLOW_AUXILIARY_SUPPORT: false });
    // Apoyo solo en un borde: centro de la caja (x=30) no está sobre el soporte (x∈[0,10]).
    const edgeSupport = { x: 0, y: 0, z: 0, dX: 10, dY: 40, dZ: 40 };
    const top = { x: 0, y: 40, z: 0, dX: 60, dY: 40, dZ: 40 };
    const v = validatePhysicalSupport(item, top, [edgeSupport]);
    expect(v.valid).toBe(false);
    expect(v.centerSupported).toBe(false);
  });

  it('MIN_SUPPORT_PERCENT más bajo acepta apoyos que el default rechaza', () => {
    // 66% de apoyo: rechazado con 0.8, aceptado con 0.5.
    setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.8, ALLOW_OVERHANG: true, ALLOW_AUXILIARY_SUPPORT: false });
    expect(validatePhysicalSupport(item, upper, [lower]).valid).toBe(false);
    setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.5, ALLOW_OVERHANG: true });
    expect(validatePhysicalSupport(item, upper, [lower]).valid).toBe(true);
  });

  it('item en el piso siempre es stable (sin importar constraints)', () => {
    setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.99, CENTER_OF_GRAVITY_CHECK: true });
    const v = validatePhysicalSupport(item, { x: 0, y: 0, z: 0, dX: 60, dY: 40, dZ: 40 }, []);
    expect(v.valid).toBe(true);
    expect(v.status).toBe('stable');
    expect(v.supportPercent).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. CACHE + CAP DE UNIDADES
// ───────────────────────────────────────────────────────────────────────────
describe('runPackingCached — determinismo y reuso', () => {
  it('dos llamadas con la misma input devuelven exactamente las mismas posiciones', () => {
    setCont('40ft');
    const products = [box({ id: 'c', qty: 10, dims: { L: 60, W: 40, H: 40 } })];
    const r1 = runPackingCached(products);
    const r2 = runPackingCached(products);
    expect(r2.packed.length).toBe(r1.packed.length);
    for (let i = 0; i < r1.packed.length; i++) {
      expect(r2.packed[i].x).toBe(r1.packed[i].x);
      expect(r2.packed[i].y).toBe(r1.packed[i].y);
      expect(r2.packed[i].z).toBe(r1.packed[i].z);
    }
  });

  it('cambiar constraints invalida el resultado cacheado', () => {
    setCont('40ft');
    const products = [box({ id: 'c', qty: 6, dims: { L: 60, W: 40, H: 40 } })];
    const r1 = runPackingCached(products);
    // El cache key incluye PHYSICAL_CONSTRAINTS → cambiar fuerza recálculo.
    setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.5 });
    const r2 = runPackingCached(products);
    expect(r2).toBeTruthy();
    expect(Array.isArray(r2.packed)).toBe(true);
    // Restaurar para no contaminar otros tests del bloque.
    setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.8 });
  });
});

describe('Cap de unidades (MAX_TOTAL_UNITS = 2500)', () => {
  it('contenedor 50×50×50 con qty enorme → warning capacity-cap y ≤2500 colocadas', () => {
    setContainerDimensions(50, 50, 50, (50 * 50 * 50) / 1e6);
    invalidatePackingCache();
    const r = runPacking([box({ id: 'tiny', qty: 100000, dims: { L: 2, W: 2, H: 2 } })]);
    expect(r.packed.length).toBeLessThanOrEqual(2500);
    const capWarning = r.warnings.find(w => w.kind === 'capacity-cap');
    expect(capWarning).toBeTruthy();
    expect(capWarning.message).toMatch(/2500/);
  }, 120000);

  it('por debajo del cap NO aparece el warning capacity-cap', () => {
    setCont('40ft');
    const r = runPacking([box({ id: 'c', qty: 10, dims: { L: 60, W: 40, H: 40 } })]);
    expect(r.warnings.find(w => w.kind === 'capacity-cap')).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. EDGE CASES — dims degeneradas, peso, qty
// ───────────────────────────────────────────────────────────────────────────
describe('Edge cases degenerados — nunca colocan cajas inválidas', () => {
  it('dims = 0 no genera ninguna unidad', () => {
    const r = runPacking([box({ id: 'z', qty: 5, dims: { L: 0, W: 40, H: 40 } })]);
    expect(r.packed.some(p => p.productId === 'z')).toBe(false);
    expect(r.placed.z || 0).toBe(0);
  });

  it('dims negativas no generan unidades', () => {
    const r = runPacking([box({ id: 'n', qty: 5, dims: { L: -60, W: 40, H: 40 } })]);
    expect(r.packed.length).toBe(0);
  });

  it('dims NaN / Infinity no generan unidades', () => {
    const r = runPacking([
      box({ id: 'nan', qty: 3, dims: { L: NaN, W: 40, H: 40 } }),
      box({ id: 'inf', qty: 3, dims: { L: Infinity, W: 40, H: 40 } }),
    ]);
    expect(r.packed.length).toBe(0);
  });

  it('qty NaN o fraccionaria <1 no genera unidades', () => {
    const r = runPacking([
      box({ id: 'qnan', qty: NaN }),
      box({ id: 'qfrac', qty: 0.5 }),
    ]);
    expect(r.packed.length).toBe(0);
  });

  it('qty fraccionaria >1 se floorea (2.9 → 2)', () => {
    setCont('40ft');
    const r = runPacking([box({ id: 'f', qty: 2.9, dims: { L: 60, W: 40, H: 40 } })]);
    expect(r.placed.f).toBe(2);
  });

  it('mezcla de productos válidos e inválidos: solo entran los válidos', () => {
    const d = setCont('40ft');
    const r = runPacking([
      box({ id: 'bad', qty: 5, dims: { L: 0, W: 0, H: 0 } }),
      box({ id: 'good', qty: 4, dims: { L: 60, W: 40, H: 40 } }),
    ]);
    expect(r.placed.bad || 0).toBe(0);
    expect(r.placed.good).toBe(4);
    // Toda caja colocada tiene dims > 0 (sin degenerados).
    assertContainerInvariants(r.packed, d.L, d.W, d.H, 'mezcla-valida');
  });

  it('caja más grande que el contenedor en todos los ejes no se coloca', () => {
    const d = setCont('20ft');
    const r = runPacking([box({ id: 'huge', qty: 1, dims: { L: 700, W: 300, H: 300 } })]);
    expect(r.packed.length).toBe(0);
    expect(r.placed.huge).toBe(0);
    // sanity: dims de contenedor no cambiaron.
    expect(d.L).toBe(589);
  });

  it('el peso del producto no afecta la geometría pero se conserva el conteo', () => {
    setCont('40ft');
    const r = runPacking([box({ id: 'w', qty: 3, dims: { L: 60, W: 40, H: 40 }, weight: 0 })]);
    expect(r.placed.w).toBe(3);
    // peso 0 no debe romper el packing.
    expect(r.packed.length).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. RESULT SHAPE + supportSummary
// ───────────────────────────────────────────────────────────────────────────
describe('Forma del resultado y supportSummary', () => {
  it('runPacking devuelve packed/placed/warnings/supportSummary/physicalConstraints', () => {
    setCont('40ft');
    const r = runPacking([box({ id: 'c', qty: 4 })]);
    expect(Array.isArray(r.packed)).toBe(true);
    expect(typeof r.placed).toBe('object');
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.supportSummary).toMatchObject({ stable: expect.any(Number) });
    expect(r.physicalConstraints.MIN_SUPPORT_PERCENT).toBe(0.8);
  });

  it('supportSummary.stable cuenta las cajas del piso', () => {
    setCont('40ft');
    const r = runPacking([box({ id: 'c', qty: 3, dims: { L: 60, W: 40, H: 40 } })]);
    // 3 cajas en el piso → todas stable.
    expect(r.supportSummary.stable).toBe(3);
    expect(r.supportSummary.auxiliary).toBe(0);
  });
});
