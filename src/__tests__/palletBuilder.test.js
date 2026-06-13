/**
 * Comprehensive tests for Pallet Builder engine
 * Run with: npx vitest run
 */
import { describe, it, expect } from 'vitest';
import {
  pb_runPacking,
  pb_validatePlacement,
  pb_validateSingleBoxMove,
  pb_getSupportedStack,
  pb_validateGroupPlacement,
  pb_findAllValidPlacements,
  pb_diversePlacements,
  PB_GRID_RES,
  PB_PALLET_BASE_H,
  PB_EDGE_OVERHANG,
} from '../stores/palletStore.js';
import { posDescription, orientationDescription } from '../lib/palletGuide.js';

// pb_findAllValidPlacements espera (unit, packed, hm, palL, palW, maxH)
// donde unit tiene dims:{L,W,H}, y hm es un heightmap.
// Replicamos pb_makeHM localmente para poder llamarla:
function makeHM(palW, palL) {
  const cols = Math.ceil((palL + PB_GRID_RES) / PB_GRID_RES);
  const rows = Math.ceil((palW + PB_GRID_RES) / PB_GRID_RES);
  return { data: new Float32Array(cols * rows), cols, rows, palL, palW };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Caja Test',
    dims: overrides.dims ?? { L: 40, W: 40, H: 40 },
    weight: overrides.weight ?? 5,
    qty: overrides.qty ?? 1,
    color: '#b07050',
    ...overrides,
  };
}

function makeBox(overrides = {}) {
  return {
    uid: overrides.uid ?? 'b1',
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Caja Test',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    dX: overrides.dX ?? 40,
    dY: overrides.dY ?? 40,
    dZ: overrides.dZ ?? 40,
    weight: overrides.weight ?? 5,
    sourceDims: overrides.sourceDims ?? { L: 40, W: 40, H: 40 },
  };
}

// Pallet standard EUA 120×100cm, 180cm height
const PAL_L = 120;
const PAL_W = 100;
const MAX_H = 180;

// ─── 1. MOTOR AUTO: pb_runPacking ──────────────────────────────────────────

describe('pb_runPacking — motor automático', () => {
  it('empaca 0 productos → devuelve array vacío', () => {
    const result = pb_runPacking([], PAL_L, PAL_W, MAX_H);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(0);
  });

  it('empaca 1 caja → 1 box colocada en y=0', () => {
    const products = [makeProduct({ qty: 1 })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(1);
    expect(result[0].y).toBe(0);
  });

  it('todos los boxes tienen uid único', () => {
    const products = [makeProduct({ id: 'p1', qty: 5 }), makeProduct({ id: 'p2', qty: 3, dims: { L: 30, W: 30, H: 30 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    const uids = result.map(b => b.uid);
    const unique = new Set(uids);
    expect(unique.size).toBe(uids.length);
  });

  it('ninguna caja sobresale el ancho del pallet más del overhang permitido', () => {
    const products = [makeProduct({ qty: 6 })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    for (const b of result) {
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.z).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.dX).toBeLessThanOrEqual(PAL_L + PB_EDGE_OVERHANG + 0.5);
      expect(b.z + b.dZ).toBeLessThanOrEqual(PAL_W + PB_EDGE_OVERHANG + 0.5);
    }
  });

  it('ninguna caja supera la altura máxima', () => {
    const products = [makeProduct({ qty: 10, dims: { L: 40, W: 40, H: 30 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    for (const b of result) {
      expect(b.y + b.dY).toBeLessThanOrEqual(MAX_H + 0.5);
    }
  });

  it('cajas no se solapan entre sí (XZ overlap check)', () => {
    const products = [makeProduct({ qty: 6, dims: { L: 50, W: 50, H: 40 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        const sameY = Math.abs(a.y - b.y) < 0.5 || (a.y < b.y + b.dY - 0.5 && b.y < a.y + a.dY - 0.5);
        if (!sameY) continue; // boxes en niveles distintos no pueden solapar en Y tampoco
        const overlapX = Math.min(a.x + a.dX, b.x + b.dX) - Math.max(a.x, b.x);
        const overlapZ = Math.min(a.z + a.dZ, b.z + b.dZ) - Math.max(a.z, b.z);
        const overlapY = Math.min(a.y + a.dY, b.y + b.dY) - Math.max(a.y, b.y);
        const hasOverlap = overlapX > 0.5 && overlapY > 0.5 && overlapZ > 0.5;
        expect(hasOverlap).toBe(false);
      }
    }
  });

  it('ninguna caja flota (y=0 o apoyada sobre otra)', () => {
    const products = [makeProduct({ qty: 8, dims: { L: 40, W: 40, H: 30 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    for (const b of result) {
      if (b.y === 0) continue; // en el piso, ok
      // Debe haber al menos una caja debajo que lo soporte
      const hasSupportBelow = result.some(other => {
        if (other.uid === b.uid) return false;
        const topOfOther = other.y + other.dY;
        if (Math.abs(topOfOther - b.y) > 0.5) return false;
        const overlapX = Math.min(other.x + other.dX, b.x + b.dX) - Math.max(other.x, b.x);
        const overlapZ = Math.min(other.z + other.dZ, b.z + b.dZ) - Math.max(other.z, b.z);
        return overlapX > 0.5 && overlapZ > 0.5;
      });
      expect(hasSupportBelow).toBe(true);
    }
  });

  it('empaca correctamente distintos tipos de pallet', () => {
    const products = [makeProduct({ qty: 4 })];
    // Euro 120×80
    const r1 = pb_runPacking(products, 120, 80, 180);
    expect(r1.length).toBeGreaterThan(0);
    // EUA 120×100
    const r2 = pb_runPacking(products, 120, 100, 180);
    expect(r2.length).toBeGreaterThan(0);
  });

  it('respeta altura máxima baja (60 cm)', () => {
    const products = [makeProduct({ qty: 10, dims: { L: 30, W: 30, H: 30 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, 60);
    for (const b of result) {
      expect(b.y + b.dY).toBeLessThanOrEqual(60 + 0.5);
    }
  });

  it('productos con qty:0 son ignorados', () => {
    const products = [
      makeProduct({ id: 'p1', qty: 0 }),
      makeProduct({ id: 'p2', qty: 3, dims: { L: 30, W: 30, H: 30 } }),
    ];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    // Only p2 boxes should appear
    expect(result.every(b => b.id === 'p2')).toBe(true);
  });

  it('caja que no cabe en el pallet no se coloca', () => {
    // Caja de 200cm de largo no puede entrar en un pallet de 120cm
    const products = [makeProduct({ qty: 1, dims: { L: 200, W: 200, H: 40 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('cajas muy pequeñas se pueden apilar muchas', () => {
    const products = [makeProduct({ qty: 20, dims: { L: 20, W: 20, H: 20 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    // Debería caber al menos 12 en un pallet 120×100
    expect(result.length).toBeGreaterThan(10);
  });

  it('mezcla de tamaños: al menos los boxes más grandes se colocan', () => {
    const products = [
      makeProduct({ id: 'grande', qty: 2, dims: { L: 50, W: 50, H: 50 } }),
      makeProduct({ id: 'chico', qty: 6, dims: { L: 20, W: 20, H: 20 } }),
    ];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    const grandes = result.filter(b => b.id === 'grande');
    expect(grandes.length).toBe(2);
  });
});

// ─── 2. GRAVEDAD: sin cajas flotantes ──────────────────────────────────────

describe('Gravedad — no boxes flotantes después del packing', () => {
  it('packing de cajas rectangulares altas no genera flotantes', () => {
    const products = [makeProduct({ qty: 6, dims: { L: 60, W: 40, H: 80 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    for (const b of result) {
      if (b.y === 0) continue;
      const hasSupportBelow = result.some(other => {
        if (other.uid === b.uid) return false;
        if (Math.abs((other.y + other.dY) - b.y) > 0.5) return false;
        const ox = Math.min(other.x + other.dX, b.x + b.dX) - Math.max(other.x, b.x);
        const oz = Math.min(other.z + other.dZ, b.z + b.dZ) - Math.max(other.z, b.z);
        return ox > 0.5 && oz > 0.5;
      });
      expect(hasSupportBelow).toBe(true);
    }
  });
});

// ─── 3. VALIDACIÓN DE MOVIMIENTO ───────────────────────────────────────────

describe('pb_validatePlacement / pb_validateSingleBoxMove', () => {
  it('caja en y=0, posición válida dentro del pallet → valid:true', () => {
    const box = makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    const result = pb_validatePlacement([box], box, PAL_L, PAL_W, MAX_H, 0, 0);
    expect(result.valid).toBe(true);
  });

  it('caja intentando moverse fuera del pallet → valid:false', () => {
    const box = makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    // x=200 está fuera del pallet de 120cm
    const result = pb_validatePlacement([box], box, PAL_L, PAL_W, MAX_H, 200, 0);
    expect(result.valid).toBe(false);
  });

  it('caja que excede la altura máxima en su posición → valid:false', () => {
    // Caja de 80cm de alto contra maxH=60 → no entra ni apoyada en el piso (top=80 > 60)
    const box = makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 80, dZ: 40, sourceDims: { L: 40, W: 40, H: 80 } });
    const result = pb_validatePlacement([box], box, PAL_L, PAL_W, 60, 0, 0, { dX: 40, dY: 80, dZ: 40 });
    expect(result.valid).toBe(false);
  });

  it('pb_validateSingleBoxMove: box ausente → valid:false', () => {
    const result = pb_validateSingleBoxMove([], 'uid-inexistente', PAL_L, PAL_W, MAX_H, 0, 0);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing-root');
  });

  it('pb_validateSingleBoxMove: move válido devuelve x,y,z correctos', () => {
    const boxes = [makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 })];
    const result = pb_validateSingleBoxMove(boxes, 'b1', PAL_L, PAL_W, MAX_H, 0, 0);
    expect(result.valid).toBe(true);
    expect(result.placements[0].uid).toBe('b1');
  });
});

// ─── 4. STACK / GRUPO ──────────────────────────────────────────────────────

describe('pb_getSupportedStack', () => {
  it('caja sola → stack de 1 elemento', () => {
    const boxes = [makeBox({ uid: 'b1' })];
    const stack = pb_getSupportedStack(boxes, 'b1');
    expect(stack).toContain('b1');
    expect(stack.length).toBe(1);
  });

  it('caja encima de otra → stack incluye ambas', () => {
    const bottom = makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    const top = makeBox({ uid: 'b2', x: 0, y: 40, z: 0, dX: 40, dY: 40, dZ: 40 });
    const stack = pb_getSupportedStack([bottom, top], 'b1');
    expect(stack).toContain('b1');
    expect(stack).toContain('b2');
  });

  it('caja separada (no encima) → no incluida en stack', () => {
    const left = makeBox({ uid: 'b1', x: 0, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    const right = makeBox({ uid: 'b2', x: 60, y: 0, z: 0, dX: 40, dY: 40, dZ: 40 });
    const stack = pb_getSupportedStack([left, right], 'b1');
    expect(stack).toContain('b1');
    expect(stack).not.toContain('b2');
  });
});

// ─── 5. VALID PLACEMENTS / CYCLE ───────────────────────────────────────────

describe('pb_findAllValidPlacements / pb_diversePlacements', () => {
  // unit = producto con dims:{L,W,H}
  const unit40 = { id: 'u1', name: 'Test', dims: { L: 40, W: 40, H: 40 }, weight: 5, color: '#b07050' };
  const unit20 = { id: 'u2', name: 'Test2', dims: { L: 20, W: 20, H: 20 }, weight: 2, color: '#8D7966' };

  it('pallet vacío → retorna al menos 1 placement', () => {
    const hm = makeHM(PAL_W, PAL_L);
    const placements = pb_findAllValidPlacements(unit40, [], hm, PAL_L, PAL_W, MAX_H);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('pb_diversePlacements reduce a máximo 16 candidatos distintos', () => {
    const hm = makeHM(PAL_W, PAL_L);
    const all = pb_findAllValidPlacements(unit20, [], hm, PAL_L, PAL_W, MAX_H);
    const diverse = pb_diversePlacements(all, 16);
    expect(diverse.length).toBeLessThanOrEqual(16);
    expect(diverse.length).toBeGreaterThan(0);
  });

  it('todos los placements tienen propiedades px, pz, y y ori', () => {
    const hm = makeHM(PAL_W, PAL_L);
    const placements = pb_findAllValidPlacements(unit40, [], hm, PAL_L, PAL_W, MAX_H);
    for (const p of placements) {
      expect(typeof p.px).toBe('number');
      expect(typeof p.pz).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(p.ori).toBeDefined();
    }
  });

  it('todos los placements están dentro del pallet (con overhang)', () => {
    const hm = makeHM(PAL_W, PAL_L);
    const placements = pb_findAllValidPlacements(unit40, [], hm, PAL_L, PAL_W, MAX_H);
    for (const p of placements) {
      expect(p.px).toBeGreaterThanOrEqual(-0.5);
      expect(p.pz).toBeGreaterThanOrEqual(-0.5);
      expect(p.px + p.ori.dX).toBeLessThanOrEqual(PAL_L + PB_EDGE_OVERHANG + 0.5);
      expect(p.pz + p.ori.dZ).toBeLessThanOrEqual(PAL_W + PB_EDGE_OVERHANG + 0.5);
    }
  });
});

// ─── 6. CONSTANTES ─────────────────────────────────────────────────────────

describe('Constantes del motor', () => {
  it('PB_GRID_RES es 2', () => expect(PB_GRID_RES).toBe(2));
  it('PB_PALLET_BASE_H es 14', () => expect(PB_PALLET_BASE_H).toBe(14));
  it('PB_EDGE_OVERHANG es 5', () => expect(PB_EDGE_OVERHANG).toBe(5));
});

// ─── 7. ORIENTACIONES ──────────────────────────────────────────────────────

describe('Orientaciones del packing', () => {
  it('caja rectangular se coloca acostada (footprint máximo, menor altura)', () => {
    // Caja 80×40×20 → la orientación más estable es acostada: dY=20, footprint 80×40
    const products = [makeProduct({ qty: 1, dims: { L: 80, W: 40, H: 20 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(1);
    const b = result[0];
    expect(b.dY).toBeLessThanOrEqual(20 + 0.5);
    expect(b.dX * b.dZ).toBeGreaterThanOrEqual(80 * 40 - 0.5);
  });

  it('caja cuadrada tiene una sola orientación efectiva', () => {
    const products = [makeProduct({ qty: 1, dims: { L: 40, W: 40, H: 40 } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(1);
    expect(result[0].dX).toBe(40);
    expect(result[0].dY).toBe(40);
    expect(result[0].dZ).toBe(40);
  });
});

// ─── 8. CASOS BORDE ────────────────────────────────────────────────────────

describe('Casos borde', () => {
  it('pallet muy pequeño (30×30) rechaza caja grande', () => {
    const products = [makeProduct({ qty: 1, dims: { L: 40, W: 40, H: 40 } })];
    const result = pb_runPacking(products, 30, 30, MAX_H);
    // La caja es más grande que el pallet incluso con el overhang
    expect(result.length).toBe(0);
  });

  it('pallet muy pequeño (30×30) acepta caja que cabe', () => {
    const products = [makeProduct({ qty: 1, dims: { L: 20, W: 20, H: 20 } })];
    const result = pb_runPacking(products, 30, 30, MAX_H);
    expect(result.length).toBe(1);
  });

  it('qty negativa se trata como 0', () => {
    const products = [makeProduct({ qty: -3 })];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(0);
  });

  it('dimensiones cero no crashean', () => {
    const products = [makeProduct({ qty: 1, dims: { L: 0, W: 0, H: 0 } })];
    expect(() => pb_runPacking(products, PAL_L, PAL_W, MAX_H)).not.toThrow();
  });

  it('altura máxima igual a dimensión de caja → cabe exactamente 1 capa', () => {
    const h = 40;
    const products = [makeProduct({ qty: 4, dims: { L: 40, W: 40, H: h } })];
    const result = pb_runPacking(products, PAL_L, PAL_W, h);
    for (const b of result) {
      expect(b.y + b.dY).toBeLessThanOrEqual(h + 0.5);
    }
  });
});

// ─── 9. PDF GUIDE HELPERS (unit tests sin DOM) ─────────────────────────────

describe('Guía PDF — posDescription / orientationDescription (código real de palletGuide.js)', () => {
  // posDescription
  it('esquina trasera izquierda', () => {
    // cx=10 < 120*0.33=39.6 → izquierda; cz=5 < 100*0.33=33 → trasera
    const box = { x: 0, z: 0, dX: 20, dZ: 10 };
    expect(posDescription(box, 120, 100)).toBe('la esquina trasera izquierda');
  });

  it('esquina delantera derecha', () => {
    // cx=90+20 → >80 → derecha; cz=80+10 → >67 → delantera
    const box = { x: 80, z: 80, dX: 20, dZ: 20 };
    expect(posDescription(box, 120, 100)).toBe('la esquina delantera derecha');
  });

  it('centro del pallet', () => {
    const box = { x: 40, z: 35, dX: 40, dZ: 30 }; // cx=60, cz=50 → ambos centro
    expect(posDescription(box, 120, 100)).toBe('el centro del pallet');
  });

  it('zona central izquierda', () => {
    const box = { x: 0, z: 35, dX: 20, dZ: 30 }; // cx=10 → izquierda; cz=50 → central
    expect(posDescription(box, 120, 100)).toBe('la zona central izquierda');
  });

  it('zona trasera (centro horizontal)', () => {
    const box = { x: 50, z: 0, dX: 20, dZ: 10 }; // cx=60 → centro; cz=5 → trasera
    expect(posDescription(box, 120, 100)).toBe('la zona trasera');
  });

  // orientationDescription
  it('cubo → null (sin orientación relevante)', () => {
    const box = { dX: 40, dY: 40, dZ: 40, sourceDims: { L: 40, W: 40, H: 40 } };
    expect(orientationDescription(box)).toBeNull();
  });

  it('caja parada (lado más largo arriba) → "parada"', () => {
    // dims 40×40×80, maxD=80, dY=80 → parada
    const box = { dX: 40, dY: 80, dZ: 40, sourceDims: { L: 40, W: 40, H: 80 } };
    expect(orientationDescription(box)).toBe('parada');
  });

  it('caja acostada (lado más corto arriba) → "acostada"', () => {
    // dims 40×80×20, minD=20, dY=20 → acostada
    const box = { dX: 40, dY: 20, dZ: 80, sourceDims: { L: 40, W: 80, H: 20 } };
    expect(orientationDescription(box)).toBe('acostada');
  });

  it('caja de costado → "de costado"', () => {
    // dims 40×80×20; dY=40 (ni el max=80 ni el min=20)
    const box = { dX: 20, dY: 40, dZ: 80, sourceDims: { L: 40, W: 80, H: 20 } };
    expect(orientationDescription(box)).toBe('de costado');
  });
});

// ─── 10. RENDIMIENTO BÁSICO ─────────────────────────────────────────────────

describe('Rendimiento — tiempo de packing', () => {
  it('50 cajas medianas se empacan en menos de 10 segundos', { timeout: 12000 }, () => {
    const products = [makeProduct({ qty: 50, dims: { L: 30, W: 30, H: 30 } })];
    const t0 = Date.now();
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(10000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('2 productos × 30 unidades c/u se empacan en menos de 15 segundos', { timeout: 18000 }, () => {
    const products = [
      makeProduct({ id: 'a', qty: 30, dims: { L: 30, W: 30, H: 30 } }),
      makeProduct({ id: 'b', qty: 30, dims: { L: 20, W: 20, H: 20 } }),
    ];
    const t0 = Date.now();
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(15000);
    expect(result.length).toBeGreaterThan(0);
  });
});
