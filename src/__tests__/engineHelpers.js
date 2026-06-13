// Helpers compartidos para los tests de motores (NO es un archivo de test).
// RNG sembrado (reproducible) + generadores + invariantes geométricos duros.
import { expect } from 'vitest';

// ── RNG sembrado (mulberry32): los fallos de fuzz son reproducibles por seed ──
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
export const randFloat = (rng, min, max) => rng() * (max - min) + min;
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ── Invariantes geométricos ──────────────────────────────────────────────
export function overlaps(a, b, tol = 0.5) {
  const ox = Math.min(a.x + a.dX, b.x + b.dX) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.dY, b.y + b.dY) - Math.max(a.y, b.y);
  const oz = Math.min(a.z + a.dZ, b.z + b.dZ) - Math.max(a.z, b.z);
  return ox > tol && oy > tol && oz > tol;
}

/** Toda caja colocada tiene posición/dims finitas y dims > 0. */
export function expectFinitePlacements(boxes, label = '') {
  for (const b of boxes) {
    for (const k of ['x', 'y', 'z', 'dX', 'dY', 'dZ']) {
      expect(Number.isFinite(b[k]), `${label} ${k}=${b[k]}`).toBe(true);
    }
    expect(b.dX > 0 && b.dY > 0 && b.dZ > 0, `${label} dims>0 (${b.dX}x${b.dY}x${b.dZ})`).toBe(true);
  }
}

/** Ningún par de cajas se solapa en 3D (con tolerancia). */
export function expectNoOverlap(boxes, tol = 0.5, label = '') {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i], boxes[j], tol), `${label} overlap[${i},${j}]`).toBe(false);
    }
  }
}

/** Ninguna caja flota: o está en el piso (y≈0) o se apoya sobre otra. */
export function expectNoFloaters(boxes, tol = 1, label = '') {
  for (const b of boxes) {
    if (b.y <= tol) continue;
    const supported = boxes.some(
      o =>
        o !== b &&
        Math.abs(o.y + o.dY - b.y) <= tol &&
        Math.min(o.x + o.dX, b.x + b.dX) - Math.max(o.x, b.x) > tol &&
        Math.min(o.z + o.dZ, b.z + b.dZ) - Math.max(o.z, b.z) > tol
    );
    const id = b.uid ?? b.instanceId ?? '';
    expect(supported, `${label} flotante ${id} en y=${b.y}`).toBe(true);
  }
}

/** Toda caja dentro del contenedor (con tolerancia). */
export function expectWithinContainer(boxes, L, W, H, tol = 1, label = '') {
  for (const b of boxes) {
    expect(b.x >= -tol && b.y >= -tol && b.z >= -tol, `${label} pos>=0`).toBe(true);
    expect(b.x + b.dX <= L + tol, `${label} x+dX=${b.x + b.dX} > L=${L}`).toBe(true);
    expect(b.z + b.dZ <= W + tol, `${label} z+dZ=${b.z + b.dZ} > W=${W}`).toBe(true);
    expect(b.y + b.dY <= H + tol, `${label} y+dY=${b.y + b.dY} > H=${H}`).toBe(true);
  }
}

/** Toda caja dentro del pallet + overhang permitido, sin superar la altura máxima. */
export function expectWithinPallet(boxes, palL, palW, maxH, overhang = 5, tol = 0.6, label = '') {
  for (const b of boxes) {
    expect(b.x >= -overhang - tol, `${label} x=${b.x}`).toBe(true);
    expect(b.z >= -overhang - tol, `${label} z=${b.z}`).toBe(true);
    expect(b.x + b.dX <= palL + overhang + tol, `${label} x+dX=${b.x + b.dX}`).toBe(true);
    expect(b.z + b.dZ <= palW + overhang + tol, `${label} z+dZ=${b.z + b.dZ}`).toBe(true);
    expect(b.y + b.dY <= maxH + tol, `${label} altura=${b.y + b.dY} > ${maxH}`).toBe(true);
  }
}

/** Corre todos los invariantes del pallet de una. */
export function assertPalletInvariants(boxes, palL, palW, maxH, label = '') {
  expectFinitePlacements(boxes, label);
  expectNoOverlap(boxes, 0.5, label);
  expectNoFloaters(boxes, 1, label);
  expectWithinPallet(boxes, palL, palW, maxH, 5, 0.6, label);
}

/** Corre todos los invariantes del contenedor de una. */
export function assertContainerInvariants(boxes, L, W, H, label = '') {
  expectFinitePlacements(boxes, label);
  expectNoOverlap(boxes, 0.5, label);
  expectWithinContainer(boxes, L, W, H, 1, label);
}
