/**
 * Guards de formatters: entrada inválida (null/undefined/NaN/strings) no debe
 * tirar; debe degradar a 0 / cadena vacía.
 */
import { describe, it, expect } from 'vitest';
import { fmt, ars, rd, shortenUrl } from '../lib/formatters.js';

describe('formatters — entrada inválida', () => {
  it('fmt tolera null/undefined/NaN/strings no numéricos → "0,00"', () => {
    expect(fmt(null)).toBe('0,00');
    expect(fmt(undefined)).toBe('0,00');
    expect(fmt(NaN)).toBe('0,00');
    expect(fmt('no-num')).toBe('0,00');
  });

  it('fmt parsea strings numéricos', () => {
    expect(fmt('1234.5')).toContain(',50');
  });

  it('ars tolera nullish → "$0"', () => {
    expect(ars(null)).toBe('$0');
    expect(ars(undefined)).toBe('$0');
    expect(ars(NaN)).toBe('$0');
  });

  it('rd tolera nullish → 0 y aplica default d=0', () => {
    expect(rd(null)).toBe(0);
    expect(rd(NaN, 2)).toBe(0);
    expect(rd(1.7)).toBe(2);
  });

  it('shortenUrl tolera nullish sin tirar', () => {
    expect(shortenUrl(null)).toBe('');
    expect(shortenUrl(undefined)).toBe('');
  });
});
