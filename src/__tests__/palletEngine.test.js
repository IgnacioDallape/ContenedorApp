/**
 * Suite exhaustiva del motor de PALLET (pb_* en palletStore.js) + acciones del store.
 * Cubre huecos: pb_validateGroupPlacement, flags strict/lenient, dims no-grid,
 * dims corruptas (NaN/string), y el store en modo manual (build, setMaxHeight,
 * palletType inválido, cyclePlacement, placeLeftover).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import usePalletStore, {
  pb_runPacking,
  pb_validatePlacement,
  pb_getSupportedStack,
  pb_validateGroupPlacement,
  PB_EDGE_OVERHANG,
} from '../stores/palletStore.js';
import { assertPalletInvariants, expectFinitePlacements } from './engineHelpers.js';

const PAL_L = 120, PAL_W = 100, MAX_H = 180;

function makeProduct(o = {}) {
  return { id: o.id ?? 'p1', name: o.name ?? 'Caja', dims: o.dims ?? { L: 40, W: 40, H: 40 }, weight: o.weight ?? 5, qty: o.qty ?? 1, color: '#b07050', mustBeBase: false, noRotate: false, ...o };
}
function makeBox(o = {}) {
  return { uid: o.uid ?? 'b1', id: o.id ?? 'p1', name: 'Caja', x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, dX: o.dX ?? 40, dY: o.dY ?? 40, dZ: o.dZ ?? 40, weight: 5, sourceDims: o.sourceDims ?? { L: 40, W: 40, H: 40 }, ...o };
}

beforeEach(() => {
  usePalletStore.setState({ products: [], results: [], activeResult: 0, buildMode: 'auto', palletType: 'eua', maxHeight: 180, selectedBoxUid: null });
});

// ── 1. pb_validateGroupPlacement (0 cobertura previa) ──────────────────────
describe('pb_validateGroupPlacement', () => {
  it('mueve una pila apoyada (2 cajas) en grupo y mantiene la relación', () => {
    const bottom = makeBox({ uid: 'b1', x: 0, y: 0, z: 0 });
    const top = makeBox({ uid: 'b2', x: 0, y: 40, z: 0 });
    const boxes = [bottom, top];
    expect(pb_getSupportedStack(boxes, 'b1')).toEqual(expect.arrayContaining(['b1', 'b2']));
    const r = pb_validateGroupPlacement(boxes, 'b1', PAL_L, PAL_W, MAX_H, 60, 40);
    expect(r.valid).not.toBe(false);
    expect(r.groupUids.length).toBe(2);
  });
});

// ── 2. Flags strict / lenient en pb_validatePlacement ──────────────────────
describe('pb_validatePlacement — strict vs lenient', () => {
  it('apoyo ~75%: strict rechaza, default (lenient) acepta', () => {
    const lower = makeBox({ uid: 'l', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    const upper = makeBox({ uid: 'u', x: 0, y: 40, z: 0, dX: 40, dY: 40, dZ: 40 });
    const boxes = [lower, upper];
    const dims = { dX: 40, dY: 40, dZ: 40 };
    // x=10 → solapa 30/40 = 75% del eje X con la de abajo
    const strict = pb_validatePlacement(boxes, upper, PAL_L, PAL_W, MAX_H, 10, 0, dims, { strict: true });
    const lenient = pb_validatePlacement(boxes, upper, PAL_L, PAL_W, MAX_H, 10, 0, dims);
    expect(strict.valid).toBe(false);
    expect(lenient.valid).toBe(true);
  });
});

// ── 3. Regresión: dims no múltiplo de grid (2cm) no generan overlap ─────────
describe('pb_runPacking — regresión overlap con dims no-grid', () => {
  it('cajas de 25cm (grid 2cm) → sin overlap', () => {
    const result = pb_runPacking([makeProduct({ qty: 12, dims: { L: 25, W: 25, H: 25 } })], PAL_L, PAL_W, MAX_H);
    expect(result.length).toBeGreaterThan(4);
    assertPalletInvariants(result, PAL_L, PAL_W, MAX_H, 'nogrid');
  });

  it('cajas de 33×17×9 (impares) → sin overlap ni flotantes', () => {
    const result = pb_runPacking([makeProduct({ qty: 10, dims: { L: 33, W: 17, H: 9 } })], PAL_L, PAL_W, MAX_H);
    assertPalletInvariants(result, PAL_L, PAL_W, MAX_H, 'impares');
  });
});

// ── 4. Dims corruptas: NaN / string no producen items degenerados ──────────
describe('pb_runPacking — dims corruptas', () => {
  it('una dim NaN → no crashea y no coloca cajas degeneradas', () => {
    const result = pb_runPacking([makeProduct({ qty: 3, dims: { L: NaN, W: 40, H: 40 } })], PAL_L, PAL_W, MAX_H);
    expectFinitePlacements(result, 'nan');
  });

  it('dims como string → no produce posiciones/dims NaN', () => {
    const result = pb_runPacking([makeProduct({ qty: 3, dims: { L: '40', W: '40', H: '40' } })], PAL_L, PAL_W, MAX_H);
    expectFinitePlacements(result, 'string');
  });

  it('una dim 0 o negativa → no coloca cajas degeneradas', () => {
    const r1 = pb_runPacking([makeProduct({ qty: 2, dims: { L: 0, W: 40, H: 40 } })], PAL_L, PAL_W, MAX_H);
    const r2 = pb_runPacking([makeProduct({ qty: 2, dims: { L: -5, W: 40, H: 40 } })], PAL_L, PAL_W, MAX_H);
    expectFinitePlacements(r1, 'zero');
    expectFinitePlacements(r2, 'neg');
  });
});

// ── 5. Store: build + invariantes ──────────────────────────────────────────
describe('palletStore.build — invariantes sobre el resultado', () => {
  it('arma un pallet y respeta los invariantes', () => {
    const store = usePalletStore.getState();
    store.setProducts([makeProduct({ id: 'a', qty: 14, dims: { L: 40, W: 40, H: 35 } })]);
    usePalletStore.getState().build();
    const results = usePalletStore.getState().results;
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) assertPalletInvariants(r.boxes, r.palL, r.palW, r.maxHeight, 'build');
  });
});

// ── 6. Store: setMaxHeight no debe dejar cajas por encima del nuevo límite ──
describe('palletStore.setMaxHeight — re-valida cajas existentes', () => {
  it('bajar la altura máxima no deja cajas que la excedan', () => {
    const store = usePalletStore.getState();
    store.setProducts([makeProduct({ id: 'a', qty: 24, dims: { L: 40, W: 40, H: 40 } })]);
    usePalletStore.getState().build();
    const before = usePalletStore.getState().results;
    expect(before.some(r => r.boxes.some(b => b.y + b.dY > 60))).toBe(true); // hay pila alta
    usePalletStore.getState().setMaxHeight(60);
    const after = usePalletStore.getState().results;
    for (const r of after) {
      for (const b of r.boxes) {
        expect(b.y + b.dY, 'caja por encima del nuevo maxHeight').toBeLessThanOrEqual(60 + 0.5);
      }
    }
  });
});

// ── 7. Store: palletType inválido no debe crashear ─────────────────────────
describe('palletStore — palletType inválido', () => {
  it('un palletType corrupto no crashea build() ni startManualEmpty()', () => {
    usePalletStore.getState().setProducts([makeProduct({ qty: 2 })]);
    usePalletStore.setState({ palletType: 'NO_EXISTE' });
    expect(() => usePalletStore.getState().build()).not.toThrow();
    expect(() => usePalletStore.getState().startManualEmpty()).not.toThrow();
  });
});

// ── 8. Store: modo manual (smoke) ──────────────────────────────────────────
describe('palletStore — modo manual', () => {
  it('startManualEmpty + placeLeftover coloca una unidad sin romper invariantes', () => {
    const store = usePalletStore.getState();
    store.setProducts([makeProduct({ id: 'a', qty: 4, dims: { L: 40, W: 40, H: 40 } })]);
    usePalletStore.getState().startManualEmpty();
    const res = usePalletStore.getState().placeLeftoverInActiveResult('a');
    expect(res).toBeTruthy();
    const r = usePalletStore.getState().results[0];
    assertPalletInvariants(r.boxes, r.palL, r.palW, r.maxHeight, 'manual');
  });
});

// ── 9. Store: editar producto no pierde el color ───────────────────────────
describe('palletStore.addOrUpdateProduct — editar preserva el color', () => {
  it('al editar un producto se mantiene su color asignado', () => {
    usePalletStore.getState().addOrUpdateProduct({ name: 'X', dims: { L: 40, W: 40, H: 40 }, qty: 2 });
    const created = usePalletStore.getState().products[0];
    expect(created.color).toBeTruthy();
    usePalletStore.getState().setEditingId(created.id);
    usePalletStore.getState().addOrUpdateProduct({ name: 'X2', dims: { L: 50, W: 50, H: 50 }, qty: 3 });
    const edited = usePalletStore.getState().products[0];
    expect(edited.name).toBe('X2');
    expect(edited.color).toBe(created.color);
  });
});

// ── 10. Packing por columnas: mejora mezclas de tamaños ────────────────────
describe('pb_runPacking — mezcla de tamaños (caso real)', () => {
  it('los 5 productos del caso real entran ≥23 cajas en EUA (mejora vs 20 original)', () => {
    const products = [
      makeProduct({ id: 'alf2', dims: { L: 60, W: 40, H: 50 }, qty: 7, weight: 38 }),
      makeProduct({ id: 'fundas', dims: { L: 80, W: 30, H: 30 }, qty: 5, weight: 50 }),
      makeProduct({ id: 'faja1', dims: { L: 40, W: 40, H: 40 }, qty: 6, weight: 7 }),
      makeProduct({ id: 'faja2', dims: { L: 40, W: 40, H: 40 }, qty: 5, weight: 7 }),
      makeProduct({ id: 'alf1', dims: { L: 22, W: 22, H: 22 }, qty: 6, weight: 1 }),
    ];
    const result = pb_runPacking(products, 120, 100, 180);
    expect(result.length).toBeGreaterThanOrEqual(23);
    assertPalletInvariants(result, 120, 100, 180, 'real-mix');
  });
});
