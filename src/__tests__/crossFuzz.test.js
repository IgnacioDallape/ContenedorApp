/**
 * crossFuzz.test.js — FUZZ cruzado pallet ↔ contenedor, RNG sembrado (reproducible).
 *
 * Idea: si alguna iteración rompe, el seed + nº de iteración la reproducen exacto.
 * Cada fallo de invariante imprime seed/iteración en el label para diagnóstico.
 *
 * Fuzz A: pb_runPacking con productos aleatorios (incluyendo hostiles:
 *         dims 0/negativas/NaN/Infinity, qty inválida, flags mustBeBase/noRotate)
 *         en pallets aleatorios → assertPalletInvariants. NUNCA debe tirar.
 *
 * Fuzz B: armamos un pallet real con pb_runPacking, lo exportamos como producto
 *         'pallet' (packedItems + palletBase + altura total, igual que
 *         PalletBuilder.addPalletToContainer ~221), le sumamos cajas sueltas
 *         aleatorias, elegimos un contenedor aleatorio de los 5 tipos y corremos
 *         runPacking → assertContainerInvariants. NUNCA overlap/flotantes/fuera/NaN.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  makeRng,
  randInt,
  pick,
  assertPalletInvariants,
  assertContainerInvariants,
} from './engineHelpers.js';
import { pb_runPacking, PB_PALLET_BASE_H } from '../stores/palletStore.js';
import {
  runPacking,
  setContainerDimensions,
  invalidatePackingCache,
} from '../lib/packing.js';

// ── El motor de contenedor lee window._instanceManualPos / _instanceLockedOri ──
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
});

beforeEach(() => {
  // Reset duro de estado compartido entre iteraciones/tests.
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  // 40ft estándar como base; cada iteración de Fuzz B setea el suyo.
  setContainerDimensions(1200, 235, 239, (1200 * 235 * 239) / 1e6);
  invalidatePackingCache();
});

// ── Tipos de pallet posibles (euro, eua, y uno "chico" no estándar) ──
const PALLET_VARIANTS = [
  { palL: 120, palW: 80,  label: 'euro' },
  { palL: 120, palW: 100, label: 'eua' },
  { palL: 100, palW: 80,  label: 'chico' },
];

// ── 5 tipos de contenedor reales (de CONTAINER_TYPES) ──
const CONTAINER_VARIANTS = [
  { id: '20ft',   L: 589,  W: 235, H: 239 },
  { id: '40ft',   L: 1200, W: 235, H: 239 },
  { id: '40hc',   L: 1200, W: 235, H: 269 },
  { id: 'semi145', L: 1450, W: 244, H: 270 },
  { id: 'semi155', L: 1550, W: 244, H: 270 },
];

const COLORS = ['#8D7966', '#A8906b', '#b07050', '#9b7966', '#6b8c6b'];

// Valores hostiles para dims — el motor DEBE descartarlos sin crashear.
const HOSTILE_DIMS = [0, -5, -1, NaN, Infinity, -Infinity, null, undefined];

/**
 * Genera un producto de pallet (caja para armar). Con baja probabilidad inyecta
 * un valor hostil en alguna dim o en qty, para fuzzear los guards de robustez.
 */
function makePalletProduct(rng, idx) {
  const hostile = rng() < 0.22;
  let L = randInt(rng, 10, 60);
  let W = randInt(rng, 10, 60);
  let H = randInt(rng, 10, 60);
  // qty acotada: el budget de tiempo del motor escala con el total de unidades;
  // mantenerlo bajo hace el fuzz reproducible Y rápido sin perder cobertura.
  let qty = randInt(rng, 1, 6);

  if (hostile) {
    const target = randInt(rng, 0, 3);
    if (target === 0) L = pick(rng, HOSTILE_DIMS);
    else if (target === 1) W = pick(rng, HOSTILE_DIMS);
    else if (target === 2) H = pick(rng, HOSTILE_DIMS);
    else qty = pick(rng, [0, -3, NaN, Infinity, null, undefined, 1.7]);
  }

  return {
    id: `p${idx}`,
    name: `Prod ${idx}`,
    dims: { L, W, H },
    qty,
    weight: randInt(rng, 0, 30),
    color: pick(rng, COLORS),
    mustBeBase: rng() < 0.25,
    noRotate: rng() < 0.25,
  };
}

/**
 * Genera una caja suelta (para el contenedor). Igual que arriba: a veces hostil.
 */
function makeLooseBox(rng, idx) {
  const hostile = rng() < 0.18;
  let L = randInt(rng, 20, 90);
  let W = randInt(rng, 20, 90);
  let H = randInt(rng, 20, 90);
  let qty = randInt(rng, 1, 5);

  if (hostile) {
    const target = randInt(rng, 0, 3);
    if (target === 0) L = pick(rng, HOSTILE_DIMS);
    else if (target === 1) W = pick(rng, HOSTILE_DIMS);
    else if (target === 2) H = pick(rng, HOSTILE_DIMS);
    else qty = pick(rng, [0, -2, NaN, Infinity, null, undefined]);
  }

  return {
    id: `box${idx}`,
    name: `Caja ${idx}`,
    type: 'box',
    dims: { L, W, H },
    qty,
    weight: randInt(rng, 1, 40),
    color: pick(rng, COLORS),
    noRotate: rng() < 0.2,
  };
}

describe('FUZZ A — pallet engine (pb_runPacking) con entradas aleatorias/hostiles', () => {
  it('60 iteraciones: nunca tira y respeta invariantes del pallet', { timeout: 60000 }, () => {
    const SEED = 0xC0FFEE;
    const ITER = 60;
    const rng = makeRng(SEED);
    let ranWithBoxes = 0;

    for (let it = 0; it < ITER; it++) {
      const label = `[A seed=${SEED} iter=${it}]`;
      const nProd = randInt(rng, 1, 4);
      const products = [];
      for (let p = 0; p < nProd; p++) products.push(makePalletProduct(rng, p));

      const pal = pick(rng, PALLET_VARIANTS);
      const maxH = randInt(rng, 40, 200);

      let boxes;
      // Invariante #1: el motor NUNCA debe lanzar, ni con basura.
      expect(() => { boxes = pb_runPacking(products, pal.palL, pal.palW, maxH); }, `${label} pb_runPacking tiró`).not.toThrow();

      // Siempre devuelve un array.
      expect(Array.isArray(boxes), `${label} no devolvió array`).toBe(true);

      // Invariantes geométricos duros (finitos, sin overlap, sin flotantes, dentro).
      assertPalletInvariants(boxes, pal.palL, pal.palW, maxH, label);

      if (boxes.length > 0) {
        ranWithBoxes++;
        // Toda caja colocada debe ser trazable a un producto de input (id real).
        const ids = new Set(products.map(p => p.id));
        for (const b of boxes) {
          expect(ids.has(b.id), `${label} box.id desconocido: ${b.id}`).toBe(true);
          // uid único + presente.
          expect(b.uid != null, `${label} box sin uid`).toBe(true);
        }
        // uids únicos.
        const uids = boxes.map(b => b.uid);
        expect(new Set(uids).size, `${label} uids duplicados`).toBe(uids.length);
      }
    }
    // Sanity: la mayoría de las iteraciones produjeron al menos una caja
    // (si casi todas salieran vacías el fuzz no estaría ejercitando el motor).
    expect(ranWithBoxes, `seed=${SEED}: muy pocas iteraciones con cajas (${ranWithBoxes})`).toBeGreaterThan(ITER * 0.5);
  });

  it('productos 100% hostiles → devuelve [] sin tirar', { timeout: 60000 }, () => {
    const rng = makeRng(0xBADBED);
    for (let it = 0; it < 15; it++) {
      const label = `[A-hostile iter=${it}]`;
      const products = [
        { id: 'h1', dims: { L: 0, W: 10, H: 10 }, qty: 5 },
        { id: 'h2', dims: { L: NaN, W: 10, H: 10 }, qty: 5 },
        { id: 'h3', dims: { L: 10, W: 10, H: 10 }, qty: 0 },
        { id: 'h4', dims: { L: -5, W: 10, H: 10 }, qty: 5 },
        { id: 'h5', dims: { L: Infinity, W: 10, H: 10 }, qty: 5 },
      ];
      const pal = pick(rng, PALLET_VARIANTS);
      let boxes;
      expect(() => { boxes = pb_runPacking(products, pal.palL, pal.palW, 150); }, `${label} tiró`).not.toThrow();
      expect(boxes, `${label} debería ser []`).toEqual([]);
    }
  });
});

describe('FUZZ B — contenedor (runPacking) con pallets exportados + cajas sueltas', () => {
  it('50 iteraciones: nunca tira y respeta invariantes del contenedor', { timeout: 60000 }, () => {
    const SEED = 0x5EED42;
    const ITER = 50;
    const rng = makeRng(SEED);
    let ranWithPallet = 0;
    let ranWithItems = 0;

    for (let it = 0; it < ITER; it++) {
      const label = `[B seed=${SEED} iter=${it}]`;

      // 1) Armar un pallet real con el motor de pallet.
      const nProd = randInt(rng, 1, 3);
      const palProducts = [];
      for (let p = 0; p < nProd; p++) palProducts.push(makePalletProduct(rng, p));
      const pal = pick(rng, PALLET_VARIANTS);
      const palMaxH = randInt(rng, 60, 180);

      let palBoxes;
      expect(() => { palBoxes = pb_runPacking(palProducts, pal.palL, pal.palW, palMaxH); },
        `${label} pb_runPacking tiró`).not.toThrow();

      // 2) Construir el producto 'pallet' exportado, igual que addPalletToContainer.
      //    totalHeight = max(box.y+box.dY) + PB_PALLET_BASE_H (deck del pallet).
      const containerProducts = [];
      const topBoxes = palBoxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
      const totalHeight = topBoxes + PB_PALLET_BASE_H;

      if (palBoxes.length > 0) {
        ranWithPallet++;
        containerProducts.push({
          id: 'pallet-export',
          name: `Pallet (${palBoxes.length} cj)`,
          type: 'pallet',
          dims: { L: pal.palL, W: pal.palW, H: totalHeight },
          qty: randInt(rng, 1, 2),
          price: 0,
          weight: randInt(rng, 100, 600),
          color: pick(rng, COLORS),
          priorityZone: null,
          noRotate: rng() < 0.5,
          packedItems: palBoxes,           // ← cajas individuales del pallet
          palletBase: { L: pal.palL, W: pal.palW },
        });
      }

      // 3) Sumar cajas sueltas aleatorias (incluyendo algunas hostiles).
      const nBoxes = randInt(rng, 0, 3);
      for (let b = 0; b < nBoxes; b++) containerProducts.push(makeLooseBox(rng, b));

      // Si todo quedó vacío/hostil, igual debe correr sin tirar.
      // 4) Elegir contenedor aleatorio de los 5 tipos.
      const cont = pick(rng, CONTAINER_VARIANTS);
      setContainerDimensions(cont.L, cont.W, cont.H, (cont.L * cont.W * cont.H) / 1e6);
      invalidatePackingCache();

      let res;
      expect(() => { res = runPacking(containerProducts); },
        `${label} runPacking tiró (cont=${cont.id})`).not.toThrow();

      // Shape de salida.
      expect(res && typeof res === 'object', `${label} result no es objeto`).toBe(true);
      expect(Array.isArray(res.packed), `${label} packed no es array`).toBe(true);
      expect(res.placed && typeof res.placed === 'object', `${label} placed no es objeto`).toBe(true);

      // Invariantes geométricos duros del contenedor (finitos, sin overlap, dentro).
      assertContainerInvariants(res.packed, cont.L, cont.W, cont.H, `${label} cont=${cont.id}`);

      if (res.packed.length > 0) {
        ranWithItems++;
        // Cada item colocado se mapea a un producto de entrada.
        const ids = new Set(containerProducts.map(p => p.id));
        for (const item of res.packed) {
          expect(ids.has(item.productId), `${label} productId desconocido: ${item.productId}`).toBe(true);
        }
      }

      // placed nunca debe sumar más unidades que las solicitadas por producto.
      for (const p of containerProducts) {
        const requested = Number.isFinite(p.qty) ? Math.floor(p.qty) : 0;
        const got = res.placed[p.id] || 0;
        if (requested > 0) {
          expect(got, `${label} placed[${p.id}]=${got} > qty=${requested}`).toBeLessThanOrEqual(requested);
        }
      }
    }

    // Sanity del fuzz: ejercitó pallets y cajas en una fracción razonable.
    expect(ranWithPallet, `seed=${SEED}: casi ningún pallet armado (${ranWithPallet})`).toBeGreaterThan(ITER * 0.4);
    expect(ranWithItems, `seed=${SEED}: casi nada colocado en contenedor (${ranWithItems})`).toBeGreaterThan(ITER * 0.4);
  });

  it('pallet exportado solo (sin cajas sueltas) entra y respeta soporte real por columna', { timeout: 60000 }, () => {
    const SEED = 0xA11CE;
    const rng = makeRng(SEED);
    for (let it = 0; it < 12; it++) {
      const label = `[B-solo seed=${SEED} iter=${it}]`;
      const palProducts = [];
      const n = randInt(rng, 1, 3);
      for (let p = 0; p < n; p++) palProducts.push(makePalletProduct(rng, p));
      const pal = pick(rng, PALLET_VARIANTS);
      const palBoxes = pb_runPacking(palProducts, pal.palL, pal.palW, randInt(rng, 80, 160));
      if (!palBoxes.length) continue;

      const totalHeight = palBoxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0) + PB_PALLET_BASE_H;
      const cont = pick(rng, CONTAINER_VARIANTS);
      setContainerDimensions(cont.L, cont.W, cont.H, (cont.L * cont.W * cont.H) / 1e6);
      invalidatePackingCache();

      const products = [{
        id: 'pal-solo',
        name: 'Pallet solo',
        type: 'pallet',
        dims: { L: pal.palL, W: pal.palW, H: totalHeight },
        qty: randInt(rng, 1, 4),
        weight: 300,
        color: '#8D7966',
        priorityZone: null,
        packedItems: palBoxes,
        palletBase: { L: pal.palL, W: pal.palW },
      }];

      let res;
      expect(() => { res = runPacking(products); }, `${label} tiró`).not.toThrow();
      assertContainerInvariants(res.packed, cont.L, cont.W, cont.H, label);
      // Los pallets van al piso (y≈0) — type pallet no se apila (h>1 se rechaza).
      for (const item of res.packed) {
        if (item.type === 'pallet') {
          expect(item.y, `${label} pallet flotando y=${item.y}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
