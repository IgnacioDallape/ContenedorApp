/**
 * Utility / lib tests: formatters, pricing, calcCostos.
 */
import { describe, it, expect } from 'vitest';
import { fmt, ars, rd, shortenUrl } from '../lib/formatters.js';
import { simulateChannelPrices, SIMULATOR_CHANNELS } from '../lib/pricing.js';
import { calcCostos } from '../components/ImportaPro/Calculator.jsx';

// ── FORMATTERS ────────────────────────────────────────────────────────────

describe('fmt — formato con 2 decimales (es-AR)', () => {
  it('formatea 1234.5 con dos decimales y separador local', () => {
    const out = fmt(1234.5);
    expect(out).toContain('1');
    expect(out).toContain(',50');
  });

  it('formatea 0 → "0,00"', () => {
    expect(fmt(0)).toBe('0,00');
  });

  it('formatea valores muy pequeños correctamente', () => {
    expect(fmt(0.038)).toBe('0,04');
  });
});

describe('ars — formato pesos con redondeo', () => {
  it('antepone "$" y redondea al entero', () => {
    expect(ars(1234.7)).toMatch(/^\$1\.235$/);
  });

  it('redondea hacia abajo cuando corresponde', () => {
    expect(ars(1234.4)).toMatch(/^\$1\.234$/);
  });

  it('valores negativos llevan signo menos', () => {
    expect(ars(-500)).toBe('$-500');
  });

  it('cero → "$0"', () => {
    expect(ars(0)).toBe('$0');
  });
});

describe('rd — redondeo a N decimales', () => {
  it('redondea a 2 decimales por defecto', () => {
    expect(rd(1.2345, 2)).toBe(1.23);
  });

  it('redondea a 0 decimales', () => {
    expect(rd(1.7, 0)).toBe(2);
  });

  it('redondea a 3 decimales', () => {
    expect(rd(1.23456, 3)).toBe(1.235);
  });

  it('no genera floating point artefacts', () => {
    expect(rd(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe('shortenUrl', () => {
  it('URL válida → hostname sin www', () => {
    expect(shortenUrl('https://www.example.com/path')).toBe('example.com');
  });

  it('URL sin www → hostname tal cual', () => {
    expect(shortenUrl('https://articulo.mercadolibre.com.ar/MLA-123')).toBe('articulo.mercadolibre.com.ar');
  });

  it('string corto inválido → string original', () => {
    const out = shortenUrl('not-a-url');
    expect(out.length).toBeLessThanOrEqual(33);
  });

  it('string largo inválido → truncado con "..."', () => {
    const longStr = 'a'.repeat(100);
    const out = shortenUrl(longStr);
    expect(out).toContain('...');
  });
});

// ── PRICING ───────────────────────────────────────────────────────────────

describe('simulateChannelPrices', () => {
  it('devuelve un canal por defecto por cada SIMULATOR_CHANNELS', () => {
    const result = simulateChannelPrices(1000, 30, 21, 0, 0);
    expect(result.length).toBe(SIMULATOR_CHANNELS.length);
  });

  it('cada canal tiene precio, ganPost y mgReal', () => {
    const result = simulateChannelPrices(1000, 30, 21, 0, 0);
    for (const ch of result) {
      expect(typeof ch.precio).toBe('number');
      expect(typeof ch.ganPost).toBe('number');
      expect(typeof ch.mgReal).toBe('number');
      expect(ch.nombre).toBeDefined();
    }
  });

  it('costo 0 → mgReal 0 (sin división por cero)', () => {
    const result = simulateChannelPrices(0, 30, 21, 0, 0);
    for (const ch of result) {
      expect(ch.mgReal).toBe(0);
    }
  });

  it('margen mayor → precio más alto en mismo canal', () => {
    const low = simulateChannelPrices(1000, 10, 21, 0, 0);
    const high = simulateChannelPrices(1000, 50, 21, 0, 0);
    for (let i = 0; i < low.length; i++) {
      expect(high[i].precio).toBeGreaterThan(low[i].precio);
    }
  });

  it('canales custom funcionan', () => {
    const result = simulateChannelPrices(500, 20, 21, 0, 0, [{ nombre: 'Test', comision: 5 }]);
    expect(result.length).toBe(1);
    expect(result[0].nombre).toBe('Test');
  });
});

// ── CALCCOSTOS (calculadora de importación) ───────────────────────────────

describe('calcCostos — calculadora de importación', () => {
  const baseInputs = {
    fob: 10,
    qty: 100,
    flete: 500,
    fleteMode: 'manual',
    seguroPct: 1,
    despachante: 2000,
    fleteInterno: 1000,
    traderPct: 6,
    di: 20,
    ivaImp: 21,
    te: 3,
    globalTC: 1359,
  };

  it('input vacío → calcula con defaults', () => {
    const c = calcCostos({});
    expect(c.fob).toBe(0);
    expect(c.qty).toBe(1);
    expect(c.costoUSD).toBeGreaterThanOrEqual(0);
  });

  it('FOB unitario se mantiene', () => {
    const c = calcCostos(baseInputs);
    expect(c.fob).toBe(10);
  });

  it('flete unitario = flete total / qty (modo manual)', () => {
    const c = calcCostos(baseInputs);
    expect(c.fleteUnit).toBe(5); // 500/100
  });

  it('modo fob36: flete unitario = 36% del FOB', () => {
    const c = calcCostos({ ...baseInputs, fleteMode: 'fob36' });
    expect(c.fleteUnit).toBeCloseTo(10 * 0.36, 2);
  });

  it('seguro unitario = FOB × seguroPct / 100', () => {
    const c = calcCostos(baseInputs);
    expect(c.seguroUnit).toBeCloseTo(10 * 0.01, 4);
  });

  it('CIF = FOB + flete + seguro (unitarios)', () => {
    const c = calcCostos(baseInputs);
    expect(c.cif).toBeCloseTo(c.fob + c.fleteUnit + c.seguroUnit, 2);
  });

  it('D.I. = CIF × di%', () => {
    const c = calcCostos(baseInputs);
    expect(c.diUnit).toBeCloseTo(c.cif * 0.2, 2);
  });

  it('IVA = (CIF + DI) × ivaImp%', () => {
    const c = calcCostos(baseInputs);
    expect(c.ivaUnit).toBeCloseTo((c.cif + c.diUnit) * 0.21, 2);
  });

  it('costoARS = costoUSD × tc', () => {
    const c = calcCostos(baseInputs);
    expect(c.costoARS).toBeCloseTo(c.costoUSD * 1359, 0);
  });

  it('aranceles/comisiones a 0 → costoUSD = CIF + IVA (21% default) + logística', () => {
    // Nota: calcCostos forza ivaImp=21 si se pasa 0 (regla Argentina, no hay
    // IVA de importación al 0%). Por eso el cálculo incluye IVA sobre CIF.
    const c = calcCostos({ ...baseInputs, traderPct: 0, di: 0, te: 0, ivaImp: 0 });
    expect(c.ivaImp).toBe(21); // verifica que el fallback se aplicó
    const expected = c.cif + c.ivaUnit + c.despachanteUnit + c.fleteInternoUnit;
    expect(c.costoUSD).toBeCloseTo(expected, 2);
  });

  it('despachante y flete interno se prorratean por cantidad', () => {
    const c = calcCostos({ ...baseInputs, despachante: 1000, fleteInterno: 500, qty: 100 });
    expect(c.despachanteUnit).toBe(10);
    expect(c.fleteInternoUnit).toBe(5);
  });

  it('qty=1 → todo el costo de aduana cae en la unidad única', () => {
    const c = calcCostos({ ...baseInputs, qty: 1, despachante: 2000, fleteInterno: 1000 });
    expect(c.despachanteUnit).toBe(2000);
    expect(c.fleteInternoUnit).toBe(1000);
  });

  it('todos los valores numéricos son finitos (no NaN/Infinity)', () => {
    const c = calcCostos(baseInputs);
    for (const [k, v] of Object.entries(c)) {
      if (typeof v === 'number') {
        expect(Number.isFinite(v), `${k} debe ser finito (es ${v})`).toBe(true);
      }
    }
  });
});
