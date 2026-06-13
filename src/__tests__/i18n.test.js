/**
 * Invariantes de i18n: los 3 idiomas deben tener exactamente las mismas claves,
 * sin valores vacíos, y con los mismos placeholders {{var}}. Esto evita que una
 * traducción quede incompleta o rompa una interpolación al escalar el catálogo.
 */
import { describe, it, expect } from 'vitest';
import es from '../i18n/locales/es.json';
import en from '../i18n/locales/en.json';
import pt from '../i18n/locales/pt.json';

const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

const get = (loc, key) => key.split('.').reduce((o, k) => o[k], loc);

const placeholders = s =>
  (String(s).match(/{{\s*\w+\s*}}/g) || []).map(x => x.replace(/\s/g, '')).sort();

const esKeys = flat(es).sort();

describe('i18n locales', () => {
  it('en tiene exactamente las mismas claves que es', () => {
    expect(flat(en).sort()).toEqual(esKeys);
  });

  it('pt tiene exactamente las mismas claves que es', () => {
    expect(flat(pt).sort()).toEqual(esKeys);
  });

  it('ningún valor de traducción está vacío', () => {
    for (const loc of [es, en, pt]) {
      for (const key of flat(loc)) {
        expect(get(loc, key), key).toBeTruthy();
      }
    }
  });

  it('los placeholders {{var}} coinciden entre idiomas', () => {
    for (const key of esKeys) {
      expect(placeholders(get(en, key)), key).toEqual(placeholders(get(es, key)));
      expect(placeholders(get(pt, key)), key).toEqual(placeholders(get(es, key)));
    }
  });
});
