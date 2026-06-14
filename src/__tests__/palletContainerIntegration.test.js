// ─────────────────────────────────────────────────────────────────────────────
// INTEGRACIÓN Pallet Builder ↔ Contenedor
//
// Un pallet armado en el Pallet Builder se exporta al contenedor como un
// producto { type:'pallet', dims:{L,W,H:totalHeight}, packedItems:[...boxes],
// palletBase:{L,W} } y se empaca con runPacking() del contenedor.
//
// Construcción replicada EXACTAMENTE de PalletBuilder.jsx addPalletToContainer
// (~líneas 221-234):
//   dims:        { L: palL, W: palW, H: totalHeight }
//   packedItems: result.boxes        (cajas del pallet, tal cual las da pb_runPacking)
//   palletBase:  { L: palL, W: palW }
//   totalHeight = max(box.y + box.dY) + PB_PALLET_BASE_H   (palletStore.js:765)
//
// El motor del contenedor (packing.js) usa hmSetPallet() para registrar la
// altura REAL por columna del pallet (no un bloque sólido), de modo que cajas
// sueltas puedan apoyarse en los huecos arriba del pallet.
//
// vitest globals:true → describe/it/expect/beforeEach/beforeAll sin import.
// ─────────────────────────────────────────────────────────────────────────────
import { pb_runPacking, PB_PALLET_BASE_H } from '../stores/palletStore.js';
import {
  runPacking,
  setContainerDimensions,
  invalidatePackingCache,
} from '../lib/packing.js';
import { assertContainerInvariants } from './engineHelpers.js';

// Dimensiones de contenedor reales (CONTAINER_TYPES en lib/constants.js)
const CONT = {
  '20ft':  { L: 589,  W: 235, H: 239 },
  '40ft':  { L: 1200, W: 235, H: 239 },
  '40hc':  { L: 1200, W: 235, H: 269 },
  semi145: { L: 1450, W: 244, H: 270 },
  semi155: { L: 1550, W: 244, H: 270 },
};

// Pallets (PALLET_SIZES): euro 120×80, eua 120×100
const PAL = {
  euro: { L: 120, W: 80 },
  eua:  { L: 120, W: 100 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function setContainer(type) {
  const c = CONT[type];
  const vol = (c.L * c.W * c.H) / 1e6;
  setContainerDimensions(c.L, c.W, c.H, vol);
}

/** Altura total del pallet armado, igual que palletStore pb_finalizeResultMeta. */
function palletTotalHeight(boxes) {
  const top = boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
  return top + PB_PALLET_BASE_H;
}

/**
 * Construye un pallet real con pb_runPacking y lo convierte en el producto
 * "pallet" que el contenedor consume — réplica exacta de addPalletToContainer.
 */
function buildPalletProduct({ id, name, pallet = 'euro', maxH = 180, products, color = '#888' }) {
  const { L: palL, W: palW } = PAL[pallet];
  const boxes = pb_runPacking(products, palL, palW, maxH);
  const totalHeight = palletTotalHeight(boxes);
  const dims = { L: palL, W: palW, H: totalHeight };
  const vol = (palL * palW * totalHeight) / 1e6;
  return {
    product: {
      id,
      name,
      type: 'pallet',
      dims,
      qty: 1,
      price: 0,
      weight: 0,
      vol,
      color,
      priorityZone: null,
      packedItems: boxes,
      palletBase: { L: palL, W: palW },
    },
    boxes,
    totalHeight,
    palL,
    palW,
  };
}

/** Producto caja suelta para el contenedor. */
function boxProduct({ id, name, L, W, H, qty = 1, color = '#4af' }) {
  return {
    id,
    name,
    type: 'box',
    dims: { L, W, H },
    qty,
    price: 0,
    weight: 0,
    vol: (L * W * H) / 1e6,
    color,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // El motor del contenedor lee estos globals — stub como en el container engine.
  global.window = global.window || {};
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.window._palletsWithNoSpace = [];
});

beforeEach(() => {
  // Reset de estado: globals + cache + dims default (40ft).
  global.window._instanceManualPos = {};
  global.window._instanceLockedOri = {};
  global.window._palletsWithNoSpace = [];
  invalidatePackingCache();
  setContainer('40ft');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Un pallet armado se exporta y se coloca en cada tipo de contenedor
// ─────────────────────────────────────────────────────────────────────────────

describe('Pallet armado → contenedor (un solo pallet)', () => {
  const palletSpec = {
    id: 'pal1',
    name: 'Pallet test',
    pallet: 'euro',
    maxH: 160,
    products: [
      { id: 'cajaA', name: 'Caja A', dims: { L: 40, W: 40, H: 40 }, qty: 12, weight: 5, color: '#e55' },
      { id: 'cajaB', name: 'Caja B', dims: { L: 30, W: 20, H: 25 }, qty: 8, weight: 2, color: '#5e5' },
    ],
  };

  for (const type of ['20ft', '40ft', '40hc', 'semi145', 'semi155']) {
    it(`se coloca en ${type} y conserva invariantes del contenedor`, () => {
      setContainer(type);
      const { product } = buildPalletProduct(palletSpec);
      const { packed, placed } = runPacking([product]);

      // El pallet entra (cabe holgado en todos los contenedores).
      expect(placed[product.id]).toBe(1);
      expect(packed.length).toBe(1);
      assertContainerInvariants(packed, CONT[type].L, CONT[type].W, CONT[type].H, `pallet-${type}`);
    });
  }

  it('el pallet del builder tiene cajas (no es vacío)', () => {
    const { boxes } = buildPalletProduct(palletSpec);
    expect(boxes.length).toBeGreaterThan(0);
  });

  it('preserva packedItems y palletBase en el resultado del contenedor', () => {
    const { product, boxes } = buildPalletProduct(palletSpec);
    const { packed } = runPacking([product]);
    const palletItem = packed.find(p => p.type === 'pallet');
    expect(palletItem).toBeTruthy();
    // buildPackedItem copia packedItems / palletBase tal cual (packing.js:368-369)
    expect(palletItem.packedItems).not.toBeNull();
    expect(Array.isArray(palletItem.packedItems)).toBe(true);
    expect(palletItem.packedItems.length).toBe(boxes.length);
    expect(palletItem.palletBase).toEqual({ L: 120, W: 80 });
  });

  it('la altura empacada (dY) ≈ totalHeight del pallet armado', () => {
    const { product, totalHeight } = buildPalletProduct(palletSpec);
    const { packed } = runPacking([product]);
    const palletItem = packed.find(p => p.type === 'pallet');
    // El pallet se coloca al ras del piso, con dY = H = totalHeight.
    expect(palletItem.y).toBeLessThanOrEqual(1);
    expect(palletItem.dY).toBeCloseTo(totalHeight, 5);
  });

  it('la huella del pallet empacado coincide con palL×palW (en alguna orientación)', () => {
    const { product, palL, palW } = buildPalletProduct(palletSpec);
    const { packed } = runPacking([product]);
    const it0 = packed[0];
    const footprint = [it0.dX, it0.dZ].sort((a, b) => a - b);
    const expected = [palL, palW].sort((a, b) => a - b);
    expect(footprint).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pallet + cajas sueltas en el mismo contenedor
//    (las cajas pueden apoyarse en huecos arriba del pallet vía hmSetPallet)
// ─────────────────────────────────────────────────────────────────────────────

describe('Pallet + cajas sueltas en el mismo contenedor', () => {
  it('coloca el pallet y las cajas sueltas, invariantes OK (40ft)', () => {
    setContainer('40ft');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'Pallet mixto',
      pallet: 'eua',
      maxH: 150,
      products: [
        { id: 'p_a', name: 'A', dims: { L: 50, W: 40, H: 40 }, qty: 9, weight: 4 },
      ],
    });
    const sueltas = boxProduct({ id: 'suelta1', name: 'Caja suelta', L: 60, W: 40, H: 40, qty: 10 });

    const { packed, placed } = runPacking([pallet, sueltas]);

    expect(placed['pal1']).toBe(1);
    expect(placed['suelta1']).toBeGreaterThan(0);
    assertContainerInvariants(packed, 1200, 235, 239, 'pallet+sueltas');
  });

  it('cajas sueltas se apilan junto a un pallet de FULL FOOTPRINT sin solapar (hmSetPallet)', () => {
    setContainer('20ft'); // 589×235×239 — piso ≈138415 cm²
    // Cajas internas que CUBREN toda la huella del pallet (60×50 sobre 120×100 →
    // x 0..120, z 0..100, sin tiras de margen). En este caso hmSetPallet registra
    // toda la huella a la altura real y NO hay intrusión en el bloque del pallet.
    const { product: pallet } = buildPalletProduct({
      id: 'palB',
      name: 'Pallet',
      pallet: 'eua',
      maxH: 180,
      products: [
        { id: 'base', name: 'Base', dims: { L: 60, W: 50, H: 40 }, qty: 8, weight: 3 },
      ],
    });
    // 45 cajas 80×70 fuerzan apilado (el piso libre admite ~22 en una capa).
    const planas = boxProduct({ id: 'planas', name: 'Planas', L: 80, W: 70, H: 50, qty: 45 });

    const { packed, placed } = runPacking([pallet, planas]);
    expect(placed['palB']).toBe(1);
    // Invariante central: con apilado forzado, NADA solapa con el pallet ni entre sí.
    assertContainerInvariants(packed, 589, 235, 239, 'apilado-forzado-fullfootprint');
    // El apilado realmente ocurrió (sino el escenario no probaría nada).
    const stacked = packed.filter(p => p.type !== 'pallet' && p.y > 1);
    expect(stacked.length).toBeGreaterThan(0);
  }, 20000);

  // ── BUG REAL del motor (inconsistencia armado ↔ render/empaque) ──────────────
  // Cuando la carga interna del pallet NO cubre toda la huella de la base (deja
  // tiras de margen, p.ej. cubos 50×50 sobre base 120×100 → margen de 10cm a cada
  // lado en X), hmSetPallet (packing.js:259) marca esas tiras vacías sólo a la
  // altura de la base del pallet (PB_PALLET_BASE_H=14). El motor del contenedor
  // entonces deja que cajas sueltas trepen por esa columna casi vacía... pero el
  // pallet se EMPACA y se RENDERIZA como un bloque sólido palL×palW×totalHeight.
  // Resultado: las cajas sueltas se meten DENTRO del bounding-box del pallet
  // (overlap medido hasta 10×30×47 cm). Visualmente la caja clipea en el bloque
  // del pallet renderizado en el 3D del contenedor.
  //
  // Repro determinístico: base eua 120×100, 6 cubos 50×50×50 (margen X de 10cm),
  // Regresión: las cajas sueltas NO deben intruir el bloque del pallet aunque la
  // carga interna deje márgenes. El bug estaba en hmSetPallet (marcaba los márgenes
  // del pallet a 14cm → las cajas trepaban adentro); corregido (pallet = bloque
  // sólido en el heightmap → las cajas se apoyan ARRIBA del pallet).
  it('cajas sueltas NO intruyen el bloque del pallet aunque la carga interna deje márgenes', () => {
    setContainer('20ft');
    const { product: pallet } = buildPalletProduct({
      id: 'palB',
      name: 'Pallet con márgenes',
      pallet: 'eua',
      maxH: 180,
      products: [{ id: 'base', name: 'Base', dims: { L: 50, W: 50, H: 50 }, qty: 6, weight: 3 }],
    });
    const planas = boxProduct({ id: 'planas', name: 'Planas', L: 47, W: 47, H: 30, qty: 140 });
    const { packed } = runPacking([pallet, planas]);
    // Con el pallet tratado como bloque sólido, las cajas sueltas se apoyan arriba:
    // no debe haber overlap entre el pallet (idx 0) y ninguna caja suelta.
    assertContainerInvariants(packed, 589, 235, 239, 'pallet-no-intrusion');
  });

  it('NINGUNA caja suelta solapa con el pallet (footprint del pallet respetado)', () => {
    setContainer('40ft');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 140,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 12, weight: 5 }],
    });
    const sueltas = boxProduct({ id: 's', name: 'S', L: 35, W: 35, H: 35, qty: 30 });
    const { packed } = runPacking([pallet, sueltas]);
    // assertContainerInvariants ya chequea no-overlap entre TODOS los items
    // (pallet incluido). Lo afirmamos explícitamente además.
    assertContainerInvariants(packed, 1200, 235, 239, 'no-overlap-pallet-sueltas');
  });

  it('múltiples cajas sueltas de tamaños distintos + pallet (40hc, más alto)', () => {
    setContainer('40hc');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'eua',
      maxH: 180,
      products: [{ id: 'c', name: 'C', dims: { L: 60, W: 50, H: 45 }, qty: 8, weight: 6 }],
    });
    const s1 = boxProduct({ id: 's1', name: 'S1', L: 80, W: 60, H: 50, qty: 8 });
    const s2 = boxProduct({ id: 's2', name: 'S2', L: 30, W: 30, H: 30, qty: 20 });
    const { packed, placed } = runPacking([pallet, s1, s2]);
    expect(placed['pal1']).toBe(1);
    expect(placed['s1'] + placed['s2']).toBeGreaterThan(0);
    assertContainerInvariants(packed, 1200, 235, 269, 'mix-40hc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Varios pallets armados (distintos) en un contenedor grande (semi)
// ─────────────────────────────────────────────────────────────────────────────

describe('Varios pallets armados en un semi', () => {
  it('coloca varios pallets distintos en semi155, invariantes OK', () => {
    setContainer('semi155');
    const palA = buildPalletProduct({
      id: 'A',
      name: 'Pallet A',
      pallet: 'euro',
      maxH: 160,
      products: [{ id: 'a', name: 'a', dims: { L: 40, W: 40, H: 40 }, qty: 16, weight: 5 }],
    }).product;
    const palB = buildPalletProduct({
      id: 'B',
      name: 'Pallet B',
      pallet: 'eua',
      maxH: 150,
      products: [{ id: 'b', name: 'b', dims: { L: 50, W: 50, H: 30 }, qty: 12, weight: 4 }],
    }).product;
    const palC = buildPalletProduct({
      id: 'C',
      name: 'Pallet C',
      pallet: 'euro',
      maxH: 170,
      products: [{ id: 'c', name: 'c', dims: { L: 30, W: 30, H: 30 }, qty: 24, weight: 2 }],
    }).product;

    const { packed, placed } = runPacking([palA, palB, palC]);
    expect(placed['A']).toBe(1);
    expect(placed['B']).toBe(1);
    expect(placed['C']).toBe(1);
    assertContainerInvariants(packed, 1550, 244, 270, 'multi-semi155');
  });

  it('varios pallets del MISMO tipo (qty>1) en semi145', () => {
    setContainer('semi145');
    const pal = buildPalletProduct({
      id: 'rep',
      name: 'Pallet repetido',
      pallet: 'euro',
      maxH: 150,
      products: [{ id: 'x', name: 'x', dims: { L: 40, W: 40, H: 40 }, qty: 12, weight: 5 }],
    }).product;
    pal.qty = 6; // 6 pallets idénticos

    const { packed, placed } = runPacking([pal]);
    expect(placed['rep']).toBeGreaterThanOrEqual(1);
    expect(packed.filter(p => p.type === 'pallet').length).toBe(placed['rep']);
    assertContainerInvariants(packed, 1450, 244, 270, 'repetidos-semi145');
    // Cada instancia conserva sus packedItems.
    for (const item of packed.filter(p => p.type === 'pallet')) {
      expect(item.packedItems).not.toBeNull();
      expect(item.packedItems.length).toBeGreaterThan(0);
    }
  });

  it('pallets + cajas sueltas juntos en semi155', () => {
    setContainer('semi155');
    const palA = buildPalletProduct({
      id: 'A',
      name: 'A',
      pallet: 'eua',
      maxH: 160,
      products: [{ id: 'a', name: 'a', dims: { L: 50, W: 40, H: 40 }, qty: 12, weight: 5 }],
    }).product;
    const palB = buildPalletProduct({
      id: 'B',
      name: 'B',
      pallet: 'euro',
      maxH: 150,
      products: [{ id: 'b', name: 'b', dims: { L: 30, W: 30, H: 30 }, qty: 18, weight: 2 }],
    }).product;
    const sueltas = boxProduct({ id: 's', name: 'S', L: 100, W: 80, H: 60, qty: 12 });

    const { packed, placed } = runPacking([palA, palB, sueltas]);
    expect(placed['A']).toBe(1);
    expect(placed['B']).toBe(1);
    expect(placed['s']).toBeGreaterThan(0);
    assertContainerInvariants(packed, 1550, 244, 270, 'pallets+sueltas-semi155');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Robustez — pallet exportado corrupto / degenerado
// ─────────────────────────────────────────────────────────────────────────────

describe('Robustez: pallet exportado corrupto', () => {
  it('palletBase {L:0,W:0} NO produce overlap con cajas sueltas (guard div/0 de hmSetPallet)', () => {
    setContainer('40ft');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 140,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 9, weight: 5 }],
    });
    // Corromper palletBase a 0×0 → scaleX/scaleZ = dX/0 = Infinity en hmSetPallet.
    // El guard debe evitar que esto produzca overlaps con cajas sueltas.
    pallet.palletBase = { L: 0, W: 0 };

    const sueltas = boxProduct({ id: 's', name: 'S', L: 50, W: 50, H: 50, qty: 20 });
    const { packed } = runPacking([pallet, sueltas]);
    expect(packed.length).toBeGreaterThan(0);
    // Invariante central de la regresión: sin overlaps.
    assertContainerInvariants(packed, 1200, 235, 239, 'palletBase-cero');
  });

  it('packedItems vacío → el pallet se trata como bloque sólido, sin crash ni overlap', () => {
    setContainer('40ft');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'eua',
      maxH: 120,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 6, weight: 5 }],
    });
    pallet.packedItems = []; // vacío → rama "bloque sólido" de hmSetPallet
    const sueltas = boxProduct({ id: 's', name: 'S', L: 45, W: 45, H: 45, qty: 15 });
    const { packed, placed } = runPacking([pallet, sueltas]);
    expect(placed['pal1']).toBe(1);
    assertContainerInvariants(packed, 1200, 235, 239, 'packedItems-vacio');
  });

  it('packedItems null → bloque sólido, sin crash', () => {
    setContainer('20ft');
    const { product: pallet } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 120,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 6, weight: 5 }],
    });
    pallet.packedItems = null;
    pallet.palletBase = null;
    const { packed, placed } = runPacking([pallet]);
    expect(placed['pal1']).toBe(1);
    assertContainerInvariants(packed, 589, 235, 239, 'packedItems-null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Pallet más alto que el contenedor → no se coloca, sin crash
// ─────────────────────────────────────────────────────────────────────────────

describe('Pallet más alto que el contenedor', () => {
  it('un pallet con H > CONT_H no se coloca y no rompe el motor (20ft)', () => {
    setContainer('20ft'); // H = 239
    // Forzamos totalHeight enorme apilando muchas cajas altas con maxH grande.
    const { product, totalHeight } = buildPalletProduct({
      id: 'gigante',
      name: 'Pallet gigante',
      pallet: 'euro',
      maxH: 400,
      products: [{ id: 'tall', name: 'Tall', dims: { L: 40, W: 40, H: 50 }, qty: 40, weight: 5 }],
    });
    // Garantizamos que es más alto que el contenedor sobreescribiendo dims.H.
    const H = Math.max(totalHeight, 300);
    product.dims = { ...product.dims, H };
    expect(H).toBeGreaterThan(CONT['20ft'].H);

    const { packed, placed } = runPacking([product]);
    expect(placed['gigante']).toBe(0);
    expect(packed.length).toBe(0);
  });

  it('pallet altísimo NO entra pero las cajas sueltas que sí caben se colocan igual', () => {
    setContainer('20ft'); // H = 239
    const { product: gigante } = buildPalletProduct({
      id: 'gigante',
      name: 'Gigante',
      pallet: 'euro',
      maxH: 400,
      products: [{ id: 't', name: 'T', dims: { L: 40, W: 40, H: 50 }, qty: 40, weight: 5 }],
    });
    gigante.dims = { ...gigante.dims, H: 300 }; // > 239

    const sueltas = boxProduct({ id: 's', name: 'S', L: 50, W: 50, H: 50, qty: 8 });
    const { packed, placed } = runPacking([gigante, sueltas]);
    expect(placed['gigante']).toBe(0);
    expect(placed['s']).toBeGreaterThan(0);
    assertContainerInvariants(packed, 589, 235, 239, 'gigante-no-entra');
    // No quedó ningún pallet en el resultado.
    expect(packed.some(p => p.type === 'pallet')).toBe(false);
  });

  it('pallet justo en el límite de altura (H ≈ CONT_H) se coloca', () => {
    setContainer('40hc'); // H = 269
    const { product } = buildPalletProduct({
      id: 'limite',
      name: 'Límite',
      pallet: 'eua',
      maxH: 150,
      products: [{ id: 'c', name: 'C', dims: { L: 50, W: 50, H: 40 }, qty: 8, weight: 5 }],
    });
    // Forzar H justo por debajo de 269.
    product.dims = { ...product.dims, H: 268 };
    const { packed, placed } = runPacking([product]);
    expect(placed['limite']).toBe(1);
    assertContainerInvariants(packed, 1200, 235, 269, 'limite-altura');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Consistencia armado ↔ empacado: las cajas internas del pallet
//    deben caber dentro de la huella del pallet declarada
// ─────────────────────────────────────────────────────────────────────────────

describe('Consistencia armado ↔ empacado del pallet', () => {
  it('las packedItems internas caben dentro de palL × palW (más overhang de borde)', () => {
    const { boxes, palL, palW } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 160,
      products: [
        { id: 'a', name: 'a', dims: { L: 40, W: 40, H: 40 }, qty: 10, weight: 5 },
        { id: 'b', name: 'b', dims: { L: 25, W: 25, H: 25 }, qty: 12, weight: 2 },
      ],
    });
    // PB_EDGE_OVERHANG = 5 cm permitido en bordes.
    const OVH = 5;
    const TOL = 0.6;
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-OVH - TOL);
      expect(b.z).toBeGreaterThanOrEqual(-OVH - TOL);
      expect(b.x + b.dX).toBeLessThanOrEqual(palL + OVH + TOL);
      expect(b.z + b.dZ).toBeLessThanOrEqual(palW + OVH + TOL);
    }
  });

  it('totalHeight del pallet = max(box top) + PB_PALLET_BASE_H exactamente', () => {
    const { boxes, totalHeight } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'eua',
      maxH: 160,
      products: [{ id: 'c', name: 'C', dims: { L: 50, W: 50, H: 40 }, qty: 10, weight: 5 }],
    });
    const top = boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
    expect(totalHeight).toBeCloseTo(top + PB_PALLET_BASE_H, 5);
  });

  it('el pct del pallet en el contenedor es un número válido (no NaN)', () => {
    setContainer('40ft');
    const { product } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 150,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 9, weight: 5 }],
    });
    const { packed } = runPacking([product]);
    const pct = parseFloat(packed[0].pct);
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Round-trip determinístico: empacar el mismo pallet dos veces da lo mismo
// ─────────────────────────────────────────────────────────────────────────────

describe('Determinismo del empacado en el contenedor', () => {
  it('empacar el mismo producto pallet dos veces produce el mismo placement', () => {
    setContainer('40ft');
    const { product } = buildPalletProduct({
      id: 'pal1',
      name: 'P',
      pallet: 'euro',
      maxH: 150,
      products: [{ id: 'c', name: 'C', dims: { L: 40, W: 40, H: 40 }, qty: 12, weight: 5 }],
    });
    invalidatePackingCache();
    const r1 = runPacking([product]);
    invalidatePackingCache();
    const r2 = runPacking([product]);
    expect(r1.placed['pal1']).toBe(r2.placed['pal1']);
    const a = r1.packed[0], b = r2.packed[0];
    expect([a.x, a.y, a.z, a.dX, a.dY, a.dZ]).toEqual([b.x, b.y, b.z, b.dX, b.dY, b.dZ]);
  });
});
