export const fmt = n => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ars = n => '$' + Math.round(n).toLocaleString('es-AR');
export const rd  = (n, d) => +n.toFixed(d);
export const shortenUrl = url => {
  try { const u = new URL(url); return u.hostname.replace('www.',''); }
  catch { return url.substring(0, 30) + (url.length > 30 ? '...' : ''); }
};
