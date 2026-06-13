/**
 * parseAuthHash: detección del flujo de auth desde el hash de la URL
 * (recovery / invite / errores de link / login normal).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getAppUrl, parseAuthHash } from '../lib/appUrl.js';

const setHash = h => {
  window.location.hash = h;
};

describe('appUrl', () => {
  beforeEach(() => setHash(''));

  it('getAppUrl devuelve la URL canónica de la app', () => {
    expect(getAppUrl()).toBe('https://fleetloader.vercel.app/');
  });

  it('sin hash → login', () => {
    expect(parseAuthHash()).toEqual({ mode: 'login', message: '' });
  });

  it('type=recovery → recovery', () => {
    setHash('#type=recovery&access_token=abc');
    expect(parseAuthHash().mode).toBe('recovery');
  });

  it('type=invite → recovery', () => {
    setHash('#type=invite');
    expect(parseAuthHash().mode).toBe('recovery');
  });

  it('otp_expired → forgot con mensaje de expiración', () => {
    setHash('#error=access_denied&error_code=otp_expired');
    const r = parseAuthHash();
    expect(r.mode).toBe('forgot');
    expect(r.message).toMatch(/expir/i);
  });

  it('error con description → forgot con texto decodificado', () => {
    setHash('#error=server_error&error_description=Algo+sali%C3%B3+mal');
    const r = parseAuthHash();
    expect(r.mode).toBe('forgot');
    expect(r.message).toBe('Algo salió mal');
  });
});
