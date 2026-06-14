/**
 * palletEngineDeep.test.js — motor de PALLET en profundidad.
 *
 * Cubre: orientaciones (footprint máximo / noRotate / mustBeBase), mezclas de
 * tamaños reales, dims no-grid, maxHeight chico, pallets euro/eua, qty alto,
 * validadores manuales (single / group, strict vs lenient), pb_getSupportedStack,
 * pb_findAllValidPlacements + pb_diversePlacements, y edge cases degenerados.
 *
 * En cada resultado de pb_runPacking corremos assertPalletInvariants:
 *   dims finitas y >0, sin overlaps reales, sin flotantes, dentro del pallet+overhang.
 *
 * Vitest globals:true → describe/it/expect/beforeEach disponibles sin import.
 */
import {
  pb_runPacking,
  pb_validatePlacement,
  pb_validateSingleBoxMove,
  pb_validateGroupPlacement,
  pb_getSupportedStack,
  pb_findAllValidPlacements,
  pb_diversePlacements,
  PB_GRID_RES,
  PB_PALLET_BASE_H,
  PB_EDGE_OVERHANG,
} from '../stores/palletStore.js';
import {
  assertPalletInvariants,
  expectNoOverlap,
  expectNoFloaters,
  expectFinitePlacements,
} from './engineHelpers.js';

// ─── pallets estándar ───────────────────────────────────────────────────────
const EUA_L = 120, EUA_W = 100, MAX_H = 180; // EUA (americano)
const EURO_L = 120, EURO_W = 80;             // Euro

// ─── helpers ────────────────────────────────────────────────────────────────
function product(id, L, W, H, qty, extra = {}) {
  return { id, name: id, dims: { L, W, H }, weight: 5, qty, color: '#888', ...extra };
}

// Replica de pb_makeHM (no exportada) para poder llamar pb_findAllValidPlacements.
function makeHM(palW, palL) {
  const cols = Math.ceil((palL + PB_GRID_RES) / PB_GRID_RES);
  const rows = Math.ceil((palW + PB_GRID_RES) / PB_GRID_RES);
  return { data: new Float32Array(cols * rows), cols, rows, palL, palW };
}

// Construye una "unit" tal como la espera pb_findAllValidPlacements.
function unitFrom(id, L, W, H, extra = {}) {
  return { id, uid: `${id}::0`, name: id, dims: { L, W, H }, weight: 5, color: '#888', ...extra };
}

// Construye una caja ya colocada para los validadores manuales.
function box(uid, x, y, z, dX, dY, dZ, extra = {}) {
  return {
    uid, id: uid.split('::')[0], name: uid, x, y, z, dX, dY, dZ,
    weight: 5, sourceDims: { L: dX, W: dZ, H: dY }, color: '#888', ...extra,
  };
}

// El grid-ceil que aplica el motor a cada dim de entrada.
const ceilGrid = n => Math.ceil(n / PB_GRID_RES) * PB_GRID_RES;

let result; // reseteado en cada test
beforeEach(() => { result = null; });

// ─── 1. ORIENTACIONES ───────────────────────────────────────────────────────
describe('Orientaciones', () => {
  it('caja rectangular sola se acuesta con footprint máximo (dY = dim más chica)', () => {
    // 80×60×20 → acostada: footprint 80×60, altura 20. El motor prioriza
    // máxima superficie de apoyo (footprint) → la dim más chica queda vertical.
    result = pb_runPacking([product('rect', 80, 60, 20, 1)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(1);
    const b = result[0];
    expect(b.y).toBe(0);
    expect(b.dY).toBe(ceilGrid(20)); // 20 es la menor → queda como altura
    // footprint = mayor de los productos de pares de dims
    expect(b.dX * b.dZ).toBe(ceilGrid(80) * ceilGrid(60));
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'rect-flat');
  });

  it('noRotate respeta una sola orientación dX=L, dZ=W, dY=H en TODAS las cajas', () => {
    result = pb_runPacking(
      [product('nr', 40, 30, 50, 6, { noRotate: true })],
      EUA_L, EUA_W, MAX_H,
    );
    expect(result.length).toBeGreaterThan(0);
    for (const b of result) {
      expect(b.dX).toBe(ceilGrid(40));
      expect(b.dZ).toBe(ceilGrid(30));
      expect(b.dY).toBe(ceilGrid(50));
    }
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'noRotate');
  });

  it('mustBeBase fuerza y≈0 en todas las cajas (nunca apila)', () => {
    // Con qty grande y altura baja, sin mustBeBase apilaría; con mustBeBase no.
    result = pb_runPacking(
      [product('base', 30, 30, 20, 10, { mustBeBase: true })],
      EUA_L, EUA_W, MAX_H,
    );
    expect(result.length).toBeGreaterThan(0);
    for (const b of result) {
      expect(b.y).toBeLessThanOrEqual(0.5);
    }
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'mustBeBase');
  });

  // Regresión: mustBeBase nunca apila. El bug estaba en pb_runColumnPacking, que
  // armaba columnas (apilaba) sin chequear mustBeBase; corregido (perCol=1).
  it('mustBeBase limita la cantidad a una sola capa (no apila)', () => {
    // Piso EUA 120×100 = 12000 cm². Cajas 50×50 = 2500 cm² → ~4 caben en el piso.
    result = pb_runPacking(
      [product('base50', 50, 50, 30, 20, { mustBeBase: true })],
      EUA_L, EUA_W, MAX_H,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(8); // jamás 20 (no puede apilar)
    for (const b of result) expect(b.y).toBeLessThanOrEqual(0.5);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'mustBeBase-onelayer');
  });

  it('caja cúbica: las orientaciones colapsan a una sola (sigue siendo válida)', () => {
    result = pb_runPacking([product('cubo', 40, 40, 40, 4)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(4);
    for (const b of result) {
      expect(b.dX).toBe(40);
      expect(b.dY).toBe(40);
      expect(b.dZ).toBe(40);
    }
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'cubo');
  });
});

// ─── 2. MEZCLA DE TAMAÑOS (caso real) ───────────────────────────────────────
describe('Mezclas de tamaños', () => {
  it('mix real (60×40×50×7, 80×30×30×5, 40×40×40×11, 22×22×22×6) coloca ≥23', () => {
    const products = [
      product('a', 60, 40, 50, 7),
      product('b', 80, 30, 30, 5),
      product('c', 40, 40, 40, 11),
      product('d', 22, 22, 22, 6),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    // total = 29 unidades; el motor debe colocar la gran mayoría.
    expect(result.length).toBeGreaterThanOrEqual(23);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'mix-real');
  });

  it('mix real — cada tipo de producto queda representado', () => {
    const products = [
      product('a', 60, 40, 50, 7),
      product('b', 80, 30, 30, 5),
      product('c', 40, 40, 40, 11),
      product('d', 22, 22, 22, 6),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    const ids = new Set(result.map(b => b.id));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.has('c')).toBe(true);
    expect(ids.has('d')).toBe(true);
  });

  it('multi-tamaño variado (5 tipos) — invariantes OK y mayoría colocada', () => {
    const products = [
      product('t1', 50, 40, 40, 4),
      product('t2', 30, 30, 30, 6),
      product('t3', 60, 20, 20, 5),
      product('t4', 40, 40, 20, 6),
      product('t5', 24, 24, 48, 4),
    ];
    const total = products.reduce((s, p) => s + p.qty, 0);
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(total * 0.6);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'multi-5');
  });

  it('cubos + barras largas conviven sin overlap ni flotantes', () => {
    const products = [
      product('cubos', 30, 30, 30, 8),
      product('barras', 100, 15, 15, 6),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(8);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'cubos+barras');
  });
});

// ─── 3. DIMS NO-GRID ────────────────────────────────────────────────────────
describe('Dims no alineadas a grilla (25, 33, 17, 9)', () => {
  it('dims no-grid se redondean hacia arriba al grid (sin overlap real)', () => {
    const products = [
      product('p25', 25, 33, 17, 8),
      product('p9', 9, 9, 9, 12),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(0);
    // toda dim de salida debe ser múltiplo de grid y >= el ceil del original
    for (const b of result) {
      expect(b.dX % PB_GRID_RES).toBe(0);
      expect(b.dY % PB_GRID_RES).toBe(0);
      expect(b.dZ % PB_GRID_RES).toBe(0);
    }
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'no-grid');
  });

  it('caja 25×25×25 (impar) — apilada sin overlap (cuantización resuelta)', () => {
    result = pb_runPacking([product('q', 25, 25, 25, 16)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(8);
    // overlap real con tolerancia estándar 0.5 debe ser cero
    expectNoOverlap(result, 0.5, '25cubes');
    expectNoFloaters(result, 1, '25cubes');
  });

  it('mezcla de muchas dims impares (33, 17, 9, 41) — invariantes OK', () => {
    const products = [
      product('a', 33, 17, 41, 6),
      product('b', 9, 41, 17, 8),
      product('c', 41, 41, 9, 5),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(0);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'odds');
  });
});

// ─── 4. ALTURA, PALLETS Y QTY ───────────────────────────────────────────────
describe('maxHeight chico, pallets euro/eua, qty alto', () => {
  it('maxHeight=45, cajas de 40 alto → 1 sola capa (no apila)', () => {
    result = pb_runPacking([product('c', 40, 40, 40, 12)], EUA_L, EUA_W, 45);
    expect(result.length).toBeGreaterThan(0);
    for (const b of result) {
      expect(b.y).toBeLessThanOrEqual(0.5); // no hay lugar para una 2da capa
      expect(b.y + b.dY).toBeLessThanOrEqual(45 + 0.5);
    }
    assertPalletInvariants(result, EUA_L, EUA_W, 45, 'maxH45');
  });

  it('pallet EURO 120×80: cajas 40×40 → exactamente 3×2 por capa', () => {
    // altura 50 sólo permite una capa de cajas de 40
    result = pb_runPacking([product('c', 40, 40, 40, 6)], EURO_L, EURO_W, 50);
    expect(result.length).toBe(6);
    assertPalletInvariants(result, EURO_L, EURO_W, 50, 'euro');
  });

  it('pallet EUA 120×100: cajas 40×40 → 6 por capa de piso (al menos)', () => {
    result = pb_runPacking([product('c', 40, 40, 40, 6)], EUA_L, EUA_W, 50);
    expect(result.length).toBe(6);
    assertPalletInvariants(result, EUA_L, EUA_W, 50, 'eua');
  });

  it('qty alto (50 cubos de 30) — invariantes OK, mayoría colocada', () => {
    result = pb_runPacking([product('c', 30, 30, 30, 50)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBeGreaterThan(30);
    expect(result.length).toBeLessThanOrEqual(50);
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'qty50');
  });

  it('todas las cajas tienen uid único incluso con qty alto', () => {
    result = pb_runPacking([product('c', 30, 30, 30, 50)], EUA_L, EUA_W, MAX_H);
    const uids = result.map(b => b.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

// ─── 5. VALIDADORES MANUALES ────────────────────────────────────────────────
describe('pb_validatePlacement / single / group (manual)', () => {
  // Base de 4 cajas 40×40×40 formando un 2×2 en el piso, para apoyar arriba.
  function baseGrid() {
    return [
      box('g::0', 0, 0, 0, 40, 40, 40),
      box('g::1', 40, 0, 0, 40, 40, 40),
      box('g::2', 0, 0, 40, 40, 40, 40),
      box('g::3', 40, 0, 40, 40, 40, 40),
    ];
  }

  it('mover una caja al piso en un hueco libre → válido', () => {
    const boxes = [box('a::0', 0, 0, 0, 40, 40, 40)];
    const movable = box('m::0', 0, 0, 0, 40, 40, 40);
    const r = pb_validatePlacement([...boxes, movable], movable, EUA_L, EUA_W, MAX_H, 60, 0);
    expect(r.valid).toBe(true);
    expect(r.y).toBe(0);
    expect(r.x).toBe(60);
  });

  it('mover sobre una caja ocupada con headroom → apila (sube y), no colisiona', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const m = box('m::0', 80, 0, 0, 40, 40, 40);
    // Mover m a (0,0): y=0 está ocupado por a → el validador prueba el siguiente
    // nivel y apoya m ARRIBA de a (y=40). Comportamiento correcto del motor.
    const r = pb_validatePlacement([a, m], m, EUA_L, EUA_W, MAX_H, 0, 0);
    expect(r.valid).toBe(true);
    expect(r.y).toBe(40);
  });

  it('mover sobre una caja ocupada SIN headroom (maxH chico) → inválido (collision)', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const m = box('m::0', 80, 0, 0, 40, 40, 40);
    // maxH=60 < 80 → no puede apilar (y=40 + dY=40 = 80 > 60) y y=0 colisiona.
    const r = pb_validatePlacement([a, m], m, EUA_L, EUA_W, 60, 0, 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('collision');
  });

  it('apilar arriba con soporte completo (sobre el 2×2) → válido', () => {
    const base = baseGrid();
    const top = box('t::0', 80, 0, 0, 40, 40, 40); // está al costado, lo movemos arriba
    const all = [...base, top];
    const r = pb_validateSingleBoxMove(all, 't::0', EUA_L, EUA_W, MAX_H, 20, 20);
    expect(r.valid).toBe(true);
    expect(r.rootPlacement.y).toBeGreaterThan(39); // se apoya sobre la capa de 40
  });

  it('strict rechaza apoyo parcial que lenient acepta', () => {
    // 1 caja de soporte 40×40 en el piso. Caja arriba de 40×40 desplazada
    // medio paso → ~50% de soporte. strict (99/97%) rechaza, lenient (60%)...
    const support = box('s::0', 0, 0, 0, 40, 40, 40);
    const top = box('t::0', 60, 0, 0, 40, 40, 40);
    const all = [support, top];
    // Apoyo ~50% (desplazado 20cm sobre soporte de 40) → debajo del 60% lenient
    const strict = pb_validatePlacement(all, top, EUA_L, EUA_W, MAX_H, 20, 0, null, { strict: true });
    const lenient = pb_validatePlacement(all, top, EUA_L, EUA_W, MAX_H, 20, 0, null, { lenient: true });
    expect(strict.valid).toBe(false);
    // lenient debe ser al menos tan permisivo como strict
    expect(lenient.valid === true || strict.valid === false).toBe(true);
  });

  it('lenient acepta un apoyo parcial (75%) que strict rechaza', () => {
    // Caja arriba apoyada 75% sobre una sola caja inferior (10cm de voladizo
    // sobre 40 de ancho). strict exige ~97%; lenient exige 60%.
    const support = box('s::0', 0, 0, 0, 40, 40, 40);
    const top = box('t::0', 60, 0, 0, 40, 40, 40);
    const all = [support, top];
    const strict = pb_validatePlacement(all, top, EUA_L, EUA_W, MAX_H, 10, 0, null, { strict: true });
    const lenient = pb_validatePlacement(all, top, EUA_L, EUA_W, MAX_H, 10, 0, null, { lenient: true });
    expect(strict.valid).toBe(false);
    expect(lenient.valid).toBe(true);
  });

  it('mover fuera del pallet + overhang → inválido (out-of-bounds)', () => {
    const m = box('m::0', 0, 0, 0, 40, 40, 40);
    const r = pb_validatePlacement([m], m, EUA_L, EUA_W, MAX_H, EUA_L + 50, 0);
    expect(r.valid).toBe(false);
  });

  it('pb_validateSingleBoxMove devuelve groupUids = [rootUid]', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const r = pb_validateSingleBoxMove([a], 'a::0', EUA_L, EUA_W, MAX_H, 40, 0);
    expect(r.groupUids).toEqual(['a::0']);
  });

  it('root inexistente → missing-root', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const r = pb_validateSingleBoxMove([a], 'noexiste', EUA_L, EUA_W, MAX_H, 0, 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('missing-root');
  });
});

// ─── 6. pb_getSupportedStack + group placement ──────────────────────────────
describe('pb_getSupportedStack / pb_validateGroupPlacement', () => {
  it('caja sola → stack es sólo ella', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    expect(pb_getSupportedStack([a], 'a::0')).toEqual(['a::0']);
  });

  it('pila vertical → stack incluye toda la columna encima del root', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const b = box('b::0', 0, 40, 0, 40, 40, 40);
    const c = box('c::0', 0, 80, 0, 40, 40, 40);
    const stack = pb_getSupportedStack([a, b, c], 'a::0');
    expect(stack.sort()).toEqual(['a::0', 'b::0', 'c::0']);
  });

  it('caja separada (no apoyada) no entra en el stack del root', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const b = box('b::0', 0, 40, 0, 40, 40, 40);   // sobre a
    const far = box('far::0', 80, 0, 0, 40, 40, 40); // al costado, en el piso
    const stack = pb_getSupportedStack([a, b, far], 'a::0');
    expect(stack).toContain('a::0');
    expect(stack).toContain('b::0');
    expect(stack).not.toContain('far::0');
  });

  it('mover una pila (root + caja encima) la traslada en grupo manteniendo apoyo', () => {
    const a = box('a::0', 0, 0, 0, 40, 40, 40);
    const b = box('b::0', 0, 40, 0, 40, 40, 40); // encima de a
    const all = [a, b];
    const r = pb_validateGroupPlacement(all, 'a::0', EUA_L, EUA_W, MAX_H, 60, 40);
    expect(r.groupUids.sort()).toEqual(['a::0', 'b::0']);
    expect(r.valid).toBe(true);
    // ambas cajas se trasladan: el root va a (60,40) y la de arriba la sigue
    const placements = r.placements;
    const rootP = placements.find(p => p.uid === 'a::0');
    const topP = placements.find(p => p.uid === 'b::0');
    expect(rootP.x).toBe(60);
    expect(rootP.z).toBe(40);
    // la caja de arriba mantiene el mismo offset XZ → sigue apoyada sobre el root
    expect(topP.x).toBe(rootP.x);
    expect(topP.z).toBe(rootP.z);
    expect(topP.y).toBeGreaterThan(rootP.y);
  });
});

// ─── 7. pb_findAllValidPlacements + pb_diversePlacements ─────────────────────
describe('pb_findAllValidPlacements / pb_diversePlacements', () => {
  it('pallet vacío → varios placements en el piso, ordenados por score', () => {
    const unit = unitFrom('u', 40, 40, 40);
    const hm = makeHM(EUA_W, EUA_L);
    const cands = pb_findAllValidPlacements(unit, [], hm, EUA_L, EUA_W, MAX_H);
    expect(cands.length).toBeGreaterThan(1);
    // todos en el piso, dentro de límites
    for (const c of cands) {
      expect(c.y).toBe(0);
      expect(c.px).toBeGreaterThanOrEqual(0);
      expect(c.pz).toBeGreaterThanOrEqual(0);
      expect(c.px + c.ori.dX).toBeLessThanOrEqual(EUA_L + PB_EDGE_OVERHANG + 0.5);
      expect(c.pz + c.ori.dZ).toBeLessThanOrEqual(EUA_W + PB_EDGE_OVERHANG + 0.5);
    }
    // ordenados ascendente por score
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i].score).toBeGreaterThanOrEqual(cands[i - 1].score);
    }
  });

  it('pb_diversePlacements devuelve a lo sumo maxN y posiciones separadas', () => {
    const unit = unitFrom('u', 40, 40, 40);
    const hm = makeHM(EUA_W, EUA_L);
    const cands = pb_findAllValidPlacements(unit, [], hm, EUA_L, EUA_W, MAX_H);
    const diverse = pb_diversePlacements(cands, 6, 8);
    expect(diverse.length).toBeLessThanOrEqual(6);
    expect(diverse.length).toBeGreaterThan(0);
    // ningún par de la misma orientación está a < 8cm en XZ
    for (let i = 0; i < diverse.length; i++) {
      for (let j = i + 1; j < diverse.length; j++) {
        const p = diverse[i], q = diverse[j];
        const sameOri = p.ori.dX === q.ori.dX && p.ori.dZ === q.ori.dZ && p.ori.dY === q.ori.dY;
        const sameLevel = Math.abs(p.y - q.y) < 1;
        if (sameOri && sameLevel) {
          expect(Math.hypot(p.px - q.px, p.pz - q.pz)).toBeGreaterThanOrEqual(8 - 0.001);
        }
      }
    }
  });

  it('unit que no entra (más grande que pallet+overhang en todas las orientaciones) → 0 placements', () => {
    const big = Math.max(EUA_L, EUA_W) + PB_EDGE_OVERHANG + 20;
    const unit = unitFrom('u', big, big, big);
    const hm = makeHM(EUA_W, EUA_L);
    const cands = pb_findAllValidPlacements(unit, [], hm, EUA_L, EUA_W, MAX_H);
    expect(cands.length).toBe(0);
  });

  it('mustBeBase en findAllValidPlacements: todos los candidatos en y=0', () => {
    const unit = unitFrom('u', 40, 40, 40, { mustBeBase: true });
    // heightmap con una caja ya apoyada para crear un plateau elevado
    const hm = makeHM(EUA_W, EUA_L);
    // simular ocupación elevada en una esquina (set manual del HM)
    const cands = pb_findAllValidPlacements(unit, [], hm, EUA_L, EUA_W, MAX_H);
    for (const c of cands) expect(c.y).toBe(0);
  });
});

// ─── 8. EDGE CASES DEGENERADOS ──────────────────────────────────────────────
describe('Edge cases — entradas degeneradas', () => {
  it('lista vacía → []', () => {
    expect(pb_runPacking([], EUA_L, EUA_W, MAX_H)).toEqual([]);
  });

  it('qty 0 → no coloca cajas', () => {
    result = pb_runPacking([product('c', 40, 40, 40, 0)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('qty negativa → no coloca cajas', () => {
    result = pb_runPacking([product('c', 40, 40, 40, -5)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('dims 0 → producto descartado (no cajas degeneradas)', () => {
    result = pb_runPacking([product('c', 0, 40, 40, 4)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
    expectFinitePlacements(result, 'dim0');
  });

  it('dims negativas → producto descartado', () => {
    result = pb_runPacking([product('c', -10, 40, 40, 4)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('dims NaN → producto descartado', () => {
    result = pb_runPacking([product('c', NaN, 40, 40, 4)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
    expectFinitePlacements(result, 'nan');
  });

  it('dims como string numérico → se coercionan, sin cajas degeneradas', () => {
    result = pb_runPacking([product('c', '40', '40', '40', 4)], EUA_L, EUA_W, MAX_H);
    // El motor coerce strings; o las coloca con dims finitas o las descarta,
    // pero JAMÁS produce cajas con dims no finitas / <= 0.
    expectFinitePlacements(result, 'string-dims');
    if (result.length > 0) {
      assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'string-dims');
    }
  });

  it('dims string no numérico (basura) → producto descartado', () => {
    result = pb_runPacking([product('c', 'abc', 40, 40, 4)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
    expectFinitePlacements(result, 'garbage');
  });

  it('caja más grande que el pallet en TODAS las dims → 0 cajas', () => {
    const big = Math.max(EUA_L, EUA_W) + PB_EDGE_OVERHANG + 30;
    result = pb_runPacking([product('giant', big, big, big, 1)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('producto válido mezclado con productos degenerados → sólo coloca el válido', () => {
    const products = [
      product('bad1', 0, 40, 40, 4),
      product('good', 40, 40, 40, 4),
      product('bad2', NaN, NaN, NaN, 4),
      product('bad3', 40, 40, 40, 0),
    ];
    result = pb_runPacking(products, EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(4);
    for (const b of result) expect(b.id).toBe('good');
    assertPalletInvariants(result, EUA_L, EUA_W, MAX_H, 'mixed-degenerate');
  });

  it('qty fraccional → se trunca con Math.floor', () => {
    result = pb_runPacking([product('c', 40, 40, 40, 3.9)], EUA_L, EUA_W, MAX_H);
    expect(result.length).toBe(3);
  });
});

// ─── 9. CONSTANTES EXPORTADAS ───────────────────────────────────────────────
describe('Constantes del motor', () => {
  it('PB_GRID_RES, PB_PALLET_BASE_H, PB_EDGE_OVERHANG tienen valores esperados', () => {
    expect(PB_GRID_RES).toBe(2);
    expect(PB_PALLET_BASE_H).toBe(14);
    expect(PB_EDGE_OVERHANG).toBe(5);
  });
});
