/**
 * Fuzz / property testing del motor de CONTENEDOR.
 * Genera combinaciones aleatorias (válidas Y hostiles: dims 0/negativas/NaN,
 * qty 0/negativa, cajas gigantes) y verifica los INVARIANTES DUROS que jamás
 * deben romperse, sin importar el input:
 *   - no tira excepción
 *   - lo que se coloca es finito, sin overlap y dentro de los límites
 *   - placed[id] está entre 0 y qty
 * RNG sembrado → cualquier fallo es reproducible por su seed.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setContainerDimensions, runPacking, invalidatePackingCache, setPackingPhysicalConstraints } from '../lib/packing.js';
import { makeRng, randInt, pick, assertContainerInvariants } from './engineHelpers.js';

const TYPES = [
  { L: 589, W: 235, H: 239 },
  { L: 1200, W: 235, H: 239 },
  { L: 1200, W: 235, H: 269 },
  { L: 1450, W: 244, H: 270 },
  { L: 1550, W: 244, H: 270 },
];

beforeAll(() => {
  if (typeof global.window === 'undefined') global.window = {};
  if (typeof global.localStorage === 'undefined') {
    const s = {};
    global.localStorage = { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: () => {}, clear: () => {} };
  }
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
});

beforeEach(() => {
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.window._palletsWithNoSpace = [];
  setPackingPhysicalConstraints({ MIN_SUPPORT_PERCENT: 0.8, ALLOW_OVERHANG: false, ALLOW_AUXILIARY_SUPPORT: false, CENTER_OF_GRAVITY_CHECK: true });
  invalidatePackingCache();
});

// Genera un valor de dimensión: la mayoría válido, a veces hostil.
function fuzzDim(rng) {
  const r = rng();
  if (r < 0.08) return 0;
  if (r < 0.14) return -randInt(rng, 1, 100);
  if (r < 0.18) return NaN;
  if (r < 0.24) return randInt(rng, 250, 1800); // posible > contenedor
  return randInt(rng, 10, 120);
}
function fuzzQty(rng) {
  const r = rng();
  if (r < 0.08) return 0;
  if (r < 0.13) return -randInt(rng, 1, 5);
  return randInt(rng, 1, 6);
}

function makeFuzzProducts(rng, i) {
  const n = randInt(rng, 1, 4);
  const products = [];
  for (let k = 0; k < n; k++) {
    const L = fuzzDim(rng), W = fuzzDim(rng), H = fuzzDim(rng);
    const type = rng() < 0.25 ? 'pallet' : 'box';
    products.push({
      id: `f${i}_${k}`,
      name: `Fuzz ${i}.${k}`,
      type,
      dims: { L, W, H },
      vol: (L * W * H) / 1e6,
      qty: fuzzQty(rng),
      weight: randInt(rng, 0, 500),
      color: '#888',
      noRotate: type === 'pallet' && rng() < 0.5,
    });
  }
  return products;
}

describe('Fuzz — motor de contenedor mantiene invariantes con cualquier input', () => {
  const N = 100;
  it(`${N} corridas aleatorias: nunca crashea, sin overlap/NaN/fuera de límites`, { timeout: 60000 }, () => {
    const rng = makeRng(0xC0FFEE);
    for (let i = 0; i < N; i++) {
      const t = pick(rng, TYPES);
      setContainerDimensions(t.L, t.W, t.H, (t.L * t.W * t.H) / 1e6);
      invalidatePackingCache();
      const products = makeFuzzProducts(rng, i);

      let result;
      expect(() => { result = runPacking(products); }, `seed-iter ${i} no debe tirar`).not.toThrow();

      assertContainerInvariants(result.packed, t.L, t.W, t.H, `fuzz#${i}`);

      // placed[id] entre 0 y qty (los que tienen qty válida)
      for (const p of products) {
        const placed = result.placed[p.id] || 0;
        expect(placed, `fuzz#${i} placed ${p.id}`).toBeGreaterThanOrEqual(0);
        if (Number.isFinite(p.qty) && p.qty > 0) {
          expect(placed, `fuzz#${i} placed<=qty ${p.id}`).toBeLessThanOrEqual(p.qty);
        }
      }
    }
  });
});
