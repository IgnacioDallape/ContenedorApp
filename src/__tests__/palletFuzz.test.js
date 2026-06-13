/**
 * Fuzz / property testing del motor de PALLET (pb_runPacking).
 * Combinaciones aleatorias (válidas Y hostiles) contra invariantes duros:
 * no tira, todo lo colocado es finito, sin overlap, sin flotantes y dentro del
 * pallet + overhang, sin superar maxHeight. RNG sembrado → reproducible.
 */
import { describe, it, expect } from 'vitest';
import { pb_runPacking } from '../stores/palletStore.js';
import { makeRng, randInt, pick, assertPalletInvariants } from './engineHelpers.js';

const PALLETS = [
  { L: 120, W: 80 },
  { L: 120, W: 100 },
  { L: 100, W: 100 },
  { L: 60, W: 60 },
];

function fuzzDim(rng) {
  const r = rng();
  if (r < 0.08) return 0;
  if (r < 0.13) return -randInt(rng, 1, 50);
  if (r < 0.17) return NaN;
  if (r < 0.2) return String(randInt(rng, 10, 60)); // string numérico
  if (r < 0.26) return randInt(rng, 130, 400); // posible > pallet
  return randInt(rng, 8, 70);
}
function fuzzQty(rng) {
  const r = rng();
  if (r < 0.08) return 0;
  if (r < 0.12) return -randInt(rng, 1, 4);
  return randInt(rng, 1, 8);
}

function makeProducts(rng, i) {
  const n = randInt(rng, 1, 3);
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push({
      id: `f${i}_${k}`,
      name: `Fuzz ${i}.${k}`,
      dims: { L: fuzzDim(rng), W: fuzzDim(rng), H: fuzzDim(rng) },
      qty: fuzzQty(rng),
      weight: randInt(rng, 0, 50),
      color: '#b07050',
      mustBeBase: rng() < 0.2,
      noRotate: rng() < 0.2,
    });
  }
  return out;
}

describe('Fuzz — motor de pallet mantiene invariantes con cualquier input', () => {
  const N = 100;
  it(`${N} corridas aleatorias: nunca crashea, sin overlap/flotantes/NaN/fuera de pallet`, { timeout: 60000 }, () => {
    const rng = makeRng(0xBADCAFE);
    for (let i = 0; i < N; i++) {
      const pal = pick(rng, PALLETS);
      const maxH = randInt(rng, 50, 220);
      const products = makeProducts(rng, i);

      let result;
      expect(() => { result = pb_runPacking(products, pal.L, pal.W, maxH); }, `fuzz#${i} no debe tirar`).not.toThrow();
      expect(Array.isArray(result), `fuzz#${i} devuelve array`).toBe(true);

      assertPalletInvariants(result, pal.L, pal.W, maxH, `fuzz#${i}`);
    }
  });
});
