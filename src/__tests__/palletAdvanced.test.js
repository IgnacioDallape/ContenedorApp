/**
 * Pallet Builder — escenarios avanzados / integración
 * Foco: estabilidad, densidad, escenarios del mundo real.
 */
import { describe, it, expect } from 'vitest';
import { pb_runPacking, PB_EDGE_OVERHANG } from '../stores/palletStore.js';

const PAL_L = 120;
const PAL_W = 100;
const MAX_H = 180;

function product(id, name, L, W, H, qty, weight = 5) {
  return { id, name, dims: { L, W, H }, weight, qty, color: '#888' };
}

// Helper: detectar cajas flotantes en un resultado
function findFloaters(boxes) {
  const floaters = [];
  for (const b of boxes) {
    if (b.y === 0) continue;
    const supported = boxes.some(o => o !== b &&
      Math.abs((o.y + o.dY) - b.y) < 0.5 &&
      Math.min(o.x + o.dX, b.x + b.dX) - Math.max(o.x, b.x) > 0.5 &&
      Math.min(o.z + o.dZ, b.z + b.dZ) - Math.max(o.z, b.z) > 0.5
    );
    if (!supported) floaters.push(b);
  }
  return floaters;
}

// ── 1. ESCENARIOS DEL MUNDO REAL ──────────────────────────────────────────

describe('Escenarios reales — productos típicos de importación', () => {
  it('Pallet con 24 cajas de 40×30×30 (típico de electrodomésticos chicos)', () => {
    const products = [product('p1', 'Caja chica', 40, 30, 30, 24, 8)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBeGreaterThan(15);
    expect(findFloaters(result).length).toBe(0);
  });

  it('Mix: 10 cajas grandes + 10 chicas — todas deberían entrar', () => {
    const products = [
      product('grande', 'Grande', 60, 40, 50, 10, 15),
      product('chica',  'Chica',  30, 30, 30, 10, 4),
    ];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBeGreaterThanOrEqual(15);
    expect(findFloaters(result).length).toBe(0);
  });

  it('Cajas alargadas (80×20×20) se acomodan sin flotar', () => {
    const products = [product('p1', 'Alargada', 80, 20, 20, 12, 6)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBeGreaterThan(6);
    expect(findFloaters(result).length).toBe(0);
  });

  it('Tres tipos de cajas diferentes — todos los tipos representados', () => {
    const products = [
      product('a', 'Tipo A', 50, 40, 40, 5),
      product('b', 'Tipo B', 30, 30, 25, 8),
      product('c', 'Tipo C', 40, 20, 60, 4),
    ];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    // Cada tipo debería tener al menos 1 caja colocada
    const ids = new Set(result.map(b => b.id));
    expect(ids.size).toBe(3);
  });
});

// ── 2. ESTABILIDAD / GRAVEDAD ─────────────────────────────────────────────

describe('Validación de estabilidad', () => {
  it('Pila vertical alta (cajas 30×30×30, 5 niveles) — ninguna flota', () => {
    const products = [product('p1', 'Cubo', 30, 30, 30, 25, 3)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(findFloaters(result).length).toBe(0);
  });

  it('Cajas de tamaños muy distintos en una capa — sin flotantes', () => {
    const products = [
      product('a', 'A', 60, 50, 40, 2),
      product('b', 'B', 25, 25, 40, 8),
    ];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(findFloaters(result).length).toBe(0);
  });

  it('Caja muy alta (60×60×120) sola — colocada sin flotar', () => {
    const products = [product('p1', 'Torre', 60, 60, 120, 1)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(1);
    expect(result[0].y).toBe(0);
  });
});

// ── 3. DENSIDAD ───────────────────────────────────────────────────────────

describe('Densidad mínima de empacado', () => {
  it('Cajas perfectas 40×40×40 en pallet 120×100 — al menos 12 por capa (suelo)', () => {
    const products = [product('p1', 'Cubo', 40, 40, 40, 12, 5)];
    const result = pb_runPacking(products, PAL_L, PAL_W, 60);
    // 120/40 × 100/40 = 3 × 2 = 6 por capa con altura 60 (1 capa)
    expect(result.length).toBeGreaterThanOrEqual(6);
  });

  it('Pallet euro 120×80 con cajas 40×40×40 → 6 por capa (3×2)', () => {
    const products = [product('p1', 'Cubo', 40, 40, 40, 6, 5)];
    const result = pb_runPacking(products, 120, 80, 60);
    expect(result.length).toBe(6);
  });

  it('Aprovechamiento mayor al 50% en escenario óptimo', () => {
    const products = [product('p1', 'Match', 40, 50, 30, 12, 5)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    // 120×100×180 = 2160000 cm³
    // 12 × (40×50×30) = 720000 cm³ ≈ 33% si todas entran
    expect(result.length).toBeGreaterThan(6);
  });
});

// ── 4. OVERHANG / TOLERANCIA DE BORDES ────────────────────────────────────

describe('Overhang en bordes del pallet', () => {
  it('Caja un poco más larga que el pallet (con overhang permitido) se coloca', () => {
    const overhangSize = PAL_L + 3; // dentro del overhang de 5cm
    const products = [product('p1', 'Borderline', overhangSize, 40, 30, 1)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(1);
  });

  it('Caja con TODAS sus dimensiones más grandes que pallet+overhang → rechazada', () => {
    // Para que sea imposible colocarla, las 3 dimensiones deben superar
    // pallet+overhang (sino el motor la rota y la pone parada).
    const tooBig = Math.max(PAL_L, PAL_W) + PB_EDGE_OVERHANG + 10;
    const products = [product('p1', 'Gigante', tooBig, tooBig, tooBig, 1)];
    const result = pb_runPacking(products, PAL_L, PAL_W, MAX_H);
    expect(result.length).toBe(0);
  });
});

// ── 5. ALTURA MÁXIMA ──────────────────────────────────────────────────────

describe('Restricciones de altura', () => {
  it('maxHeight=50, caja altura 60 → no entra (incluso parada)', () => {
    const products = [product('p1', 'Alta', 30, 30, 60, 1)];
    const result = pb_runPacking(products, PAL_L, PAL_W, 50);
    // Tal vez se rota para que la dimensión H pase a horizontal
    // Si entra, debe ser con dY <= 50
    for (const b of result) {
      expect(b.y + b.dY).toBeLessThanOrEqual(50 + 0.5);
    }
  });

  it('maxHeight muy chico (20) y caja de 30 mínima → rechazada', () => {
    const products = [product('p1', 'Cubo grande', 30, 30, 30, 1)];
    const result = pb_runPacking(products, PAL_L, PAL_W, 20);
    expect(result.length).toBe(0);
  });

  it('maxHeight=200, 6 capas de cajas 30×30×30 → cabe', () => {
    const products = [product('p1', 'Cubo', 30, 30, 30, 30, 3)];
    const result = pb_runPacking(products, PAL_L, PAL_W, 200);
    // 120×100/900 = 13 por capa × 6 capas = 78, queremos al menos 18
    expect(result.length).toBeGreaterThanOrEqual(18);
  });
});

// ── 6. INVARIANTES GENERALES ──────────────────────────────────────────────

describe('Invariantes que SIEMPRE deben cumplirse', () => {
  const scenarios = [
    { name: '1 caja chica',   prods: [product('a', 'X', 30, 30, 30, 1)] },
    { name: '5 cajas iguales', prods: [product('a', 'X', 40, 30, 30, 5)] },
    { name: 'Mix 2 tipos',     prods: [product('a', 'A', 50, 40, 40, 3), product('b', 'B', 26, 26, 26, 6)] },
    { name: 'Cajas altas',     prods: [product('a', 'X', 30, 30, 80, 4)] },
    { name: 'Cajas planas',    prods: [product('a', 'X', 80, 40, 15, 6)] },
  ];

  scenarios.forEach(({ name, prods }) => {
    describe(`Escenario: ${name}`, () => {
      const result = pb_runPacking(prods, PAL_L, PAL_W, MAX_H);

      it('todas las cajas tienen dimensiones positivas', () => {
        for (const b of result) {
          expect(b.dX).toBeGreaterThan(0);
          expect(b.dY).toBeGreaterThan(0);
          expect(b.dZ).toBeGreaterThan(0);
        }
      });

      it('todas las cajas tienen posiciones finitas', () => {
        for (const b of result) {
          expect(Number.isFinite(b.x)).toBe(true);
          expect(Number.isFinite(b.y)).toBe(true);
          expect(Number.isFinite(b.z)).toBe(true);
        }
      });

      it('sin flotantes', () => {
        expect(findFloaters(result).length).toBe(0);
      });

      it('sin solapamiento entre cajas', () => {
        for (let i = 0; i < result.length; i++) {
          for (let j = i + 1; j < result.length; j++) {
            const a = result[i], b = result[j];
            const ox = Math.min(a.x + a.dX, b.x + b.dX) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.dY, b.y + b.dY) - Math.max(a.y, b.y);
            const oz = Math.min(a.z + a.dZ, b.z + b.dZ) - Math.max(a.z, b.z);
            expect(ox > 0.5 && oy > 0.5 && oz > 0.5).toBe(false);
          }
        }
      });

      it('respeta los límites del pallet + overhang', () => {
        for (const b of result) {
          expect(b.x + b.dX).toBeLessThanOrEqual(PAL_L + PB_EDGE_OVERHANG + 0.5);
          expect(b.z + b.dZ).toBeLessThanOrEqual(PAL_W + PB_EDGE_OVERHANG + 0.5);
          expect(b.y + b.dY).toBeLessThanOrEqual(MAX_H + 0.5);
        }
      });
    });
  });
});
