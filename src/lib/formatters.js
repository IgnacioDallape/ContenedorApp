// Formato de números para UI (es-AR) + helpers de URL.
// Todos toleran valores nullish / NaN / strings sin tirar (devuelven 0).

const toNum = n => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
};

export const fmt = n =>
  toNum(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ars = n => '$' + Math.round(toNum(n)).toLocaleString('es-AR');

export const rd = (n, d = 0) => +toNum(n).toFixed(d);

export const shortenUrl = url => {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    const s = String(url ?? '');
    return s.substring(0, 30) + (s.length > 30 ? '...' : '');
  }
};
