export const SIMULATOR_CHANNELS = [
  { nombre: 'Mercado Libre', comision: 13 },
  { nombre: 'Tienda propia', comision: 3 },
  { nombre: 'Instagram / WA', comision: 0 },
  { nombre: 'Otro marketplace', comision: 8 },
];

export function simulateChannelPrices(costo, margenT, iva, iibb, iigg, channels = SIMULATOR_CHANNELS) {
  return channels.map(ch => {
    const ivaF = 1 + iva / 100;
    const comF = ch.comision / 100;
    const iibbF = iibb / 100;
    const iiggF = Math.min(iigg / 100, 0.9999);
    const denomCh = 1 - comF - iibbF;
    const safeDenom = denomCh > 0.0001 ? denomCh : 0.0001;
    const base = costo * (1 + margenT / 100 / (1 - iiggF)) / safeDenom;
    const precio = Math.round(base * ivaF);
    const ganB = precio - costo - precio * comF - precio * iibbF - precio / ivaF * (iva / 100);
    const ganPost = ganB * (1 - iigg / 100);
    const mgReal = costo > 0 ? Math.round(ganPost / costo * 100) : 0;
    return { ...ch, precio, ganPost, mgReal };
  });
}
