// Tests del STORE de pallet (Zustand) y los flujos de armado.
// Cubre acciones del store: build/setProducts/setMaxHeight/buildMode/manual,
// placeLeftover/cycle/suggest/remove/restore, addOrUpdateProduct y bulk replace.
//
// Importante sobre el motor: build() corre pb_runPacking real (puede tardar),
// así que se usan conteos modestos de cajas. Para tests que usan setProducts
// directamente hay que proveer `id` y `color` (el store solo los asigna en
// addOrUpdateProduct, no en setProducts).

import usePalletStore from '../stores/palletStore.js';
import { PB_PALLET_TYPES, PB_COLORS } from '../lib/constants.js';
import { assertPalletInvariants } from './engineHelpers.js';

const PB_PALLET_BASE_H = 14;

// Construye un producto listo para setProducts (con id + color + dims).
let _pid = 1;
function mkProduct(over = {}) {
  const id = over.id ?? `p${_pid++}`;
  return {
    id,
    name: over.name ?? `Prod ${id}`,
    qty: over.qty ?? 4,
    weight: over.weight ?? 2,
    color: over.color ?? PB_COLORS[0],
    dims: over.dims ?? { L: 40, W: 40, H: 40 },
    mustBeBase: !!over.mustBeBase,
    noRotate: !!over.noRotate,
  };
}

const reset = () =>
  usePalletStore.setState({
    products: [],
    results: [],
    activeResult: 0,
    buildMode: 'auto',
    palletType: 'eua',
    maxHeight: 180,
    selectedBoxUid: null,
    editingId: null,
    cyclePlacementCursor: new Map(),
  });

const S = () => usePalletStore.getState();

beforeEach(() => {
  _pid = 1;
  reset();
});

// ───────────────────────────── setProducts + build ─────────────────────────
describe('setProducts + build()', () => {
  it('build() sin productos no genera results y no crashea', () => {
    S().build();
    expect(S().results).toEqual([]);
  });

  it('genera al menos un result con cajas e invariantes válidas', () => {
    S().setProducts([mkProduct({ qty: 6, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const results = S().results;
    expect(results.length).toBeGreaterThanOrEqual(1);
    const pt = PB_PALLET_TYPES.eua;
    for (const r of results) {
      expect(r.boxes.length).toBeGreaterThan(0);
      assertPalletInvariants(r.boxes, pt.L, pt.W, S().maxHeight, 'build');
    }
  });

  it('coloca TODAS las unidades repartidas entre los pallets generados', () => {
    const qty = 6;
    S().setProducts([mkProduct({ id: 'A', qty, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const placed = S().results.reduce(
      (sum, r) => sum + r.boxes.filter(b => b.id === 'A').length,
      0
    );
    expect(placed).toBe(qty);
  });

  it('cada caja arrastra sourceDims, color y un uid único', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, color: '#abcdef' })]);
    S().build();
    const boxes = S().results.flatMap(r => r.boxes);
    expect(boxes.length).toBeGreaterThan(0);
    const uids = new Set(boxes.map(b => b.uid));
    expect(uids.size).toBe(boxes.length); // uids únicos
    for (const b of boxes) {
      expect(b.color).toBe('#abcdef');
      expect(b.sourceDims).toMatchObject({ L: 40, W: 40, H: 40 });
    }
  });

  it('result.products refleja placedQty por producto (suma == qty colocada)', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 5, dims: { L: 50, W: 50, H: 50 } })]);
    S().build();
    const totalPlaced = S().results.reduce(
      (sum, r) => sum + r.boxes.filter(b => b.id === 'A').length,
      0
    );
    const sumPlacedQty = S().results.reduce((sum, r) => {
      const prod = r.products.find(p => p.id === 'A');
      return sum + (prod ? prod.placedQty : 0);
    }, 0);
    expect(sumPlacedQty).toBe(totalPlaced);
  });

  it('totalHeight de cada result = top de cajas + base del pallet', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    for (const r of S().results) {
      const top = r.boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
      expect(r.totalHeight).toBeCloseTo(top + PB_PALLET_BASE_H, 5);
    }
  });

  it('multi-pallet: qty grande de cajas voluminosas requiere más de un pallet', () => {
    // Cajas de 60x50x60 en pallet 120x100x180. Por pallet entran pocas;
    // 40 unidades fuerzan varios pallets.
    S().setProducts([mkProduct({ id: 'BIG', qty: 40, dims: { L: 60, W: 50, H: 60 }, weight: 3 })]);
    S().build();
    expect(S().results.length).toBeGreaterThan(1);
    const placed = S().results.reduce(
      (sum, r) => sum + r.boxes.filter(b => b.id === 'BIG').length,
      0
    );
    expect(placed).toBe(40);
    const pt = PB_PALLET_TYPES.eua;
    S().results.forEach((r, i) =>
      assertPalletInvariants(r.boxes, pt.L, pt.W, S().maxHeight, `multi-pallet[${i}]`)
    );
  }, 60000);

  it('cada result tiene idx reindexado consecutivo desde 0', () => {
    S().setProducts([mkProduct({ id: 'BIG', qty: 40, dims: { L: 60, W: 50, H: 60 } })]);
    S().build();
    S().results.forEach((r, i) => expect(r.idx).toBe(i));
  }, 60000);

  it('build() resetea activeResult a 0 y deselecciona', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4 })]);
    usePalletStore.setState({ activeResult: 9, selectedBoxUid: 'zzz' });
    S().build();
    expect(S().activeResult).toBe(0);
    expect(S().selectedBoxUid).toBeNull();
  });

  it('respeta el palletType euro (dims 120x80) en los results', () => {
    S().setPalletType('euro');
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const pt = PB_PALLET_TYPES.euro;
    for (const r of S().results) {
      expect(r.palL).toBe(pt.L);
      expect(r.palW).toBe(pt.W);
      assertPalletInvariants(r.boxes, pt.L, pt.W, S().maxHeight, 'euro');
    }
  });
});

// ───────────────────────────── setMaxHeight ─────────────────────────────────
describe('setMaxHeight', () => {
  it('subir la altura solo actualiza maxHeight (no toca cajas)', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const before = S().results[0].boxes.length;
    S().setMaxHeight(250);
    expect(S().maxHeight).toBe(250);
    expect(S().results[0].maxHeight).toBe(250);
    expect(S().results[0].boxes.length).toBe(before);
  });

  it('bajar la altura manda a reserva las cajas que exceden el nuevo límite', () => {
    // Apilar cajas altas para tener cajas por encima de cierto nivel.
    S().setProducts([mkProduct({ id: 'A', qty: 8, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const r0 = S().results[0];
    const top = r0.boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
    // Elegir un corte que deje algunas cajas arriba.
    const cut = Math.floor(top / 2);

    const expectedOverflow = r0.boxes.filter(b => b.y + b.dY > cut + 0.5).length;
    // Sólo tiene sentido si efectivamente hay cajas por encima del corte.
    expect(expectedOverflow).toBeGreaterThan(0);

    S().setMaxHeight(cut);
    const after = S().results[0];

    // Ninguna caja queda por encima del nuevo límite.
    for (const b of after.boxes) {
      expect(b.y + b.dY).toBeLessThanOrEqual(cut + 0.5);
    }
    // Las que excedían pasaron a reserva.
    expect(after.reserveBoxes.length).toBe(expectedOverflow);
    expect(after.maxHeight).toBe(cut);
  });

  it('las cajas movidas a reserva llevan prefijo "reserve::" en el uid', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 8, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const r0 = S().results[0];
    const top = r0.boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
    S().setMaxHeight(Math.floor(top / 2));
    for (const b of S().results[0].reserveBoxes) {
      expect(String(b.uid).startsWith('reserve::')).toBe(true);
    }
  });

  it('no duplica el prefijo "reserve::" si se baja dos veces', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 9, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const top = S().results[0].boxes.reduce((m, b) => Math.max(m, b.y + b.dY), 0);
    S().setMaxHeight(Math.floor(top * 0.66));
    S().setMaxHeight(Math.floor(top * 0.33));
    for (const b of S().results[0].reserveBoxes) {
      // exactamente un prefijo, no "reserve::reserve::"
      expect((String(b.uid).match(/reserve::/g) || []).length).toBe(1);
    }
  });

  it('valor inválido cae a 180 (default)', () => {
    S().setMaxHeight('no-numero');
    expect(S().maxHeight).toBe(180);
    S().setMaxHeight(0);
    expect(S().maxHeight).toBe(180);
  });
});

// ───────────────────────── palletType inválido ─────────────────────────────
describe('palletType inválido', () => {
  it('setPalletType con clave desconocida cae a eua', () => {
    S().setPalletType('marciano');
    expect(S().palletType).toBe('eua');
  });

  it('setState directo con palletType basura no crashea build()', () => {
    usePalletStore.setState({ palletType: 'no-existe' });
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    expect(() => S().build()).not.toThrow();
    // Cae al fallback eua (120x100).
    expect(S().results.length).toBeGreaterThan(0);
    expect(S().results[0].palL).toBe(PB_PALLET_TYPES.eua.L);
    expect(S().results[0].palW).toBe(PB_PALLET_TYPES.eua.W);
  });

  it('setState directo con palletType basura no crashea startManualEmpty()', () => {
    usePalletStore.setState({ palletType: 'no-existe' });
    expect(() => S().startManualEmpty()).not.toThrow();
    const r = S().results[0];
    expect(r.palL).toBe(PB_PALLET_TYPES.eua.L);
    expect(r.palW).toBe(PB_PALLET_TYPES.eua.W);
  });
});

// ───────────────────────── buildMode / manual ──────────────────────────────
describe('buildMode y arranque manual', () => {
  it('setBuildMode normaliza a auto/manual (otra cosa => auto)', () => {
    S().setBuildMode('manual');
    expect(S().buildMode).toBe('manual');
    S().setBuildMode('auto');
    expect(S().buildMode).toBe('auto');
    S().setBuildMode('whatever');
    expect(S().buildMode).toBe('auto');
  });

  it('startManualEmpty crea un result vacío y pone buildMode=manual', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4 }), mkProduct({ id: 'B', qty: 2 })]);
    S().startManualEmpty();
    expect(S().buildMode).toBe('manual');
    expect(S().results.length).toBe(1);
    const r = S().results[0];
    expect(r.boxes).toEqual([]);
    expect(r.reserveBoxes).toEqual([]);
    // Los productos arrancan con placedQty 0.
    for (const p of r.products) expect(p.placedQty).toBe(0);
    expect(S().activeResult).toBe(0);
    expect(S().selectedBoxUid).toBeNull();
  });

  it('startManualPrebuilt corre el motor y deja buildMode=manual', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualPrebuilt();
    expect(S().buildMode).toBe('manual');
    expect(S().results.length).toBeGreaterThan(0);
    expect(S().results[0].boxes.length).toBeGreaterThan(0);
  });

  it('startManualPrebuilt sin productos no genera results', () => {
    S().startManualPrebuilt();
    expect(S().results).toEqual([]);
  });
});

// ─────────────── placeLeftover / cycle / suggest / remove / restore ─────────
describe('flujos de edición sobre el result activo', () => {
  it('placeLeftoverInActiveResult coloca una unidad huérfana válida', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 3, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualEmpty(); // result vacío, las 3 unidades son leftovers
    const res = S().placeLeftoverInActiveResult('A');
    expect(res.ok).toBe(true);
    const boxes = S().results[0].boxes;
    expect(boxes.length).toBe(1);
    assertPalletInvariants(boxes, PB_PALLET_TYPES.eua.L, PB_PALLET_TYPES.eua.W, S().maxHeight, 'leftover');
    // queda seleccionada la caja recién puesta.
    expect(S().selectedBoxUid).toBe(boxes[0].uid);
  });

  it('placeLeftover falla si ya están todas colocadas (no-leftover)', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 1, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualEmpty();
    expect(S().placeLeftoverInActiveResult('A').ok).toBe(true);
    const again = S().placeLeftoverInActiveResult('A');
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('no-leftover');
  });

  it('placeLeftover con producto inexistente reporta missing-product', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 2 })]);
    S().startManualEmpty();
    const r = S().placeLeftoverInActiveResult('NOPE');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-product');
  });

  it('removeBoxFromActiveResult saca la caja y la guarda en reserva', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 3, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualEmpty();
    S().placeLeftoverInActiveResult('A');
    S().placeLeftoverInActiveResult('A');
    const uid = S().results[0].boxes[0].uid;
    const beforeCount = S().results[0].boxes.length;
    S().removeBoxFromActiveResult(uid);
    const after = S().results[0];
    expect(after.boxes.length).toBe(beforeCount - 1);
    expect(after.boxes.some(b => b.uid === uid)).toBe(false);
    expect(after.reserveBoxes.some(b => b.uid === `reserve::${uid}`)).toBe(true);
  });

  it('removeBox deselecciona si la quitada era la seleccionada', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 2, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualEmpty();
    const placed = S().placeLeftoverInActiveResult('A');
    const uid = placed.box.uid;
    usePalletStore.setState({ selectedBoxUid: uid });
    S().removeBoxFromActiveResult(uid);
    expect(S().selectedBoxUid).toBeNull();
  });

  it('restoreReserveBoxToActiveResult devuelve una caja de reserva al pallet', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 3, dims: { L: 40, W: 40, H: 40 } })]);
    S().startManualEmpty();
    S().placeLeftoverInActiveResult('A');
    S().placeLeftoverInActiveResult('A');
    const uid = S().results[0].boxes[0].uid;
    S().removeBoxFromActiveResult(uid);
    const reserveUid = `reserve::${uid}`;
    expect(S().results[0].reserveBoxes.some(b => b.uid === reserveUid)).toBe(true);

    const restored = S().restoreReserveBoxToActiveResult(reserveUid);
    expect(restored.ok).toBe(true);
    const after = S().results[0];
    // ya no está en reserva.
    expect(after.reserveBoxes.some(b => b.uid === reserveUid)).toBe(false);
    // y volvió al pallet (uid sin prefijo).
    expect(after.boxes.length).toBeGreaterThanOrEqual(2);
    assertPalletInvariants(after.boxes, PB_PALLET_TYPES.eua.L, PB_PALLET_TYPES.eua.W, S().maxHeight, 'restore');
  });

  it('restore con uid inexistente reporta missing-reserve', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 2 })]);
    S().startManualEmpty();
    const r = S().restoreReserveBoxToActiveResult('reserve::no-existe');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-reserve');
  });

  it('suggestRelocate reubica la caja sin romper invariantes', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    usePalletStore.setState({ buildMode: 'manual' });
    const uid = S().results[0].boxes[0].uid;
    const r = S().suggestRelocate(uid);
    expect(r.ok).toBe(true);
    const after = S().results[0];
    // la misma cantidad de cajas y mismo uid presente.
    expect(after.boxes.some(b => b.uid === uid)).toBe(true);
    assertPalletInvariants(after.boxes, PB_PALLET_TYPES.eua.L, PB_PALLET_TYPES.eua.W, S().maxHeight, 'suggest');
    expect(S().selectedBoxUid).toBe(uid);
  });

  it('suggestRelocate con uid inexistente reporta missing-box', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4 })]);
    S().build();
    const r = S().suggestRelocate('inexistente');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-box');
  });

  it('cyclePlacement mueve el cursor y mantiene la misma caja (uid)', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 5, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    usePalletStore.setState({ buildMode: 'manual' });
    const uid = S().results[0].boxes[0].uid;
    const r = S().cyclePlacement(uid, 1);
    expect(r.ok).toBe(true);
    expect(r.total).toBeGreaterThan(0);
    expect(r.index).toBeGreaterThanOrEqual(0);
    const after = S().results[0];
    expect(after.boxes.some(b => b.uid === uid)).toBe(true);
    assertPalletInvariants(after.boxes, PB_PALLET_TYPES.eua.L, PB_PALLET_TYPES.eua.W, S().maxHeight, 'cycle');
    // el cursor quedó registrado
    expect(S().cyclePlacementCursor.get(uid)).toBe(r.index);
  });

  it('cyclePlacement(+1) y (-1) recorren índices distintos del catálogo', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 6, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    usePalletStore.setState({ buildMode: 'manual' });
    const uid = S().results[0].boxes[0].uid;
    const fwd = S().cyclePlacement(uid, 1);
    if (fwd.total > 1) {
      const back = S().cyclePlacement(uid, -1);
      expect(back.ok).toBe(true);
      // volver atrás cambia el índice respecto del avance.
      expect(back.index).not.toBe(fwd.index);
    } else {
      expect(fwd.total).toBe(1);
    }
  });

  it('cyclePlacement con uid inexistente reporta missing-box', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4 })]);
    S().build();
    const r = S().cyclePlacement('nope', 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-box');
  });
});

// ───────────────────────── addOrUpdateProduct ──────────────────────────────
describe('addOrUpdateProduct', () => {
  it('alta asigna id y color del ciclo PB_COLORS', () => {
    S().addOrUpdateProduct({ name: 'Caja 1', qty: 2, dims: { L: 30, W: 30, H: 30 }, weight: 1 });
    S().addOrUpdateProduct({ name: 'Caja 2', qty: 2, dims: { L: 30, W: 30, H: 30 }, weight: 1 });
    const prods = S().products;
    expect(prods.length).toBe(2);
    expect(prods[0].id).toBeDefined();
    expect(prods[1].id).toBeDefined();
    expect(prods[0].id).not.toBe(prods[1].id);
    expect(prods[0].color).toBe(PB_COLORS[0]);
    expect(prods[1].color).toBe(PB_COLORS[1]);
  });

  it('editar (setEditingId + addOrUpdateProduct) preserva el color y el id', () => {
    S().addOrUpdateProduct({ name: 'Orig', qty: 2, dims: { L: 30, W: 30, H: 30 }, weight: 1 });
    const { id, color } = S().products[0];
    S().setEditingId(id);
    // El form al editar NO reenvía el color → no debe perderse.
    S().addOrUpdateProduct({ name: 'Editado', qty: 9, dims: { L: 50, W: 50, H: 50 }, weight: 4 });
    const after = S().products[0];
    expect(after.id).toBe(id);
    expect(after.color).toBe(color);
    expect(after.name).toBe('Editado');
    expect(after.qty).toBe(9);
    // editingId se limpia tras editar.
    expect(S().editingId).toBeNull();
  });

  it('editar no agrega un producto nuevo (mantiene la cantidad)', () => {
    S().addOrUpdateProduct({ name: 'A', qty: 1, dims: { L: 30, W: 30, H: 30 } });
    S().addOrUpdateProduct({ name: 'B', qty: 1, dims: { L: 30, W: 30, H: 30 } });
    const targetId = S().products[1].id;
    S().setEditingId(targetId);
    S().addOrUpdateProduct({ name: 'B editado', qty: 5 });
    expect(S().products.length).toBe(2);
    expect(S().products[1].name).toBe('B editado');
  });

  it('removeProduct elimina por id', () => {
    S().addOrUpdateProduct({ name: 'A', qty: 1, dims: { L: 30, W: 30, H: 30 } });
    S().addOrUpdateProduct({ name: 'B', qty: 1, dims: { L: 30, W: 30, H: 30 } });
    const id = S().products[0].id;
    S().removeProduct(id);
    expect(S().products.length).toBe(1);
    expect(S().products.some(p => p.id === id)).toBe(false);
  });
});

// ─────────────────── bulk replace + clearResults ───────────────────────────
describe('bulk replace (setProducts / setResults) y clearResults', () => {
  it('setProducts reemplaza por completo la lista previa', () => {
    S().setProducts([mkProduct({ id: 'X', qty: 2 }), mkProduct({ id: 'Y', qty: 2 })]);
    expect(S().products.map(p => p.id)).toEqual(['X', 'Y']);
    S().setProducts([mkProduct({ id: 'Z', qty: 1 })]);
    expect(S().products.map(p => p.id)).toEqual(['Z']);
  });

  it('setProducts limpia editingId', () => {
    usePalletStore.setState({ editingId: 'algo' });
    S().setProducts([mkProduct({ id: 'X', qty: 1 })]);
    expect(S().editingId).toBeNull();
  });

  it('setProducts con null/undefined queda en lista vacía', () => {
    S().setProducts([mkProduct({ id: 'X', qty: 1 })]);
    S().setProducts(null);
    expect(S().products).toEqual([]);
  });

  it('setResults reemplaza results y resetea activeResult/selección', () => {
    usePalletStore.setState({ activeResult: 3, selectedBoxUid: 'foo' });
    const fake = [{ idx: 0, palL: 120, palW: 100, maxHeight: 180, boxes: [], reserveBoxes: [] }];
    S().setResults(fake);
    expect(S().results.length).toBe(1);
    expect(S().activeResult).toBe(0);
    expect(S().selectedBoxUid).toBeNull();
  });

  it('clearResults vacía results y resetea cursores de selección', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    usePalletStore.setState({ activeResult: 0, selectedBoxUid: 'x' });
    S().clearResults();
    expect(S().results).toEqual([]);
    expect(S().activeResult).toBe(0);
    expect(S().selectedBoxUid).toBeNull();
  });

  it('round-trip setProducts->build->setResults reaplica el layout idéntico', () => {
    S().setProducts([mkProduct({ id: 'A', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    S().build();
    const snapshot = JSON.parse(JSON.stringify(S().results));
    S().clearResults();
    expect(S().results).toEqual([]);
    S().setResults(snapshot);
    expect(S().results.length).toBe(snapshot.length);
    expect(S().results[0].boxes.length).toBe(snapshot[0].boxes.length);
    assertPalletInvariants(
      S().results[0].boxes,
      PB_PALLET_TYPES.eua.L,
      PB_PALLET_TYPES.eua.W,
      S().results[0].maxHeight,
      'round-trip'
    );
  });
});
