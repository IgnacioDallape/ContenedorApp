import { create } from 'zustand';

const DEFAULT_CANALES = [
  { nombre: 'Mercado Libre',          comision: 13, cuotas: 0, precio: 32000 },
  { nombre: 'Tienda propia',          comision: 3,  cuotas: 0, precio: 28000 },
  { nombre: 'Instagram / WhatsApp',   comision: 0,  cuotas: 0, precio: 26000 },
];

const DEFAULT_INPUTS = {
  nombre:      'Alfombra cocina',
  fobCny:      27.5,
  fob:         3.80,
  fobArs:      0,
  qty:         100,
  cny:         0.1466,
  arsTC:       1359,
  flete:       500,
  seguroPct:   1,
  despachante:   2000,
  fleteInterno:  1000,
  traderPct:   6,
  di:          20,
  ivaImp:      21,
  te:          3,
  globalTC:    1359,
  currencyMode: 'cny',
  tipoUnidad:  'box',
  pesoUnit:    0,
  dimL:        '',
  dimW:        '',
  dimH:        '',
  palletType:  'euro',
  palletHeight: 120,
  link1688:    '',
  linkML:      '',
  photos:      [null, null],
};

const useImportaproStore = create((set, get) => ({
  savedProducts: JSON.parse(localStorage.getItem('importapro-products') || '[]'),
  canales: DEFAULT_CANALES,
  inputs: { ...DEFAULT_INPUTS },
  apiKey: localStorage.getItem('importapro-apikey') || '',

  setInputs(patch) {
    set(s => ({ inputs: { ...s.inputs, ...patch } }));
  },

  setCanales(canales) { set({ canales }); },

  addCanal() {
    const { canales } = get();
    set({ canales: [...canales, { nombre: 'Canal nuevo', comision: 0, cuotas: 0, precio: 0 }] });
  },

  updateCanal(idx, patch) {
    const { canales } = get();
    const updated = canales.map((c, i) => i === idx ? { ...c, ...patch } : c);
    set({ canales: updated });
  },

  removeCanal(idx) {
    const { canales } = get();
    set({ canales: canales.filter((_, i) => i !== idx) });
  },

  saveProduct(prod) {
    const { savedProducts } = get();
    const idx = savedProducts.findIndex(p => p.nombre === prod.nombre);
    const updated = idx >= 0
      ? savedProducts.map((p, i) => i === idx ? prod : p)
      : [...savedProducts, prod];
    localStorage.setItem('importapro-products', JSON.stringify(updated));
    set({ savedProducts: updated });
    return updated;
  },

  deleteProduct(idx) {
    const { savedProducts } = get();
    const updated = savedProducts.filter((_, i) => i !== idx);
    localStorage.setItem('importapro-products', JSON.stringify(updated));
    set({ savedProducts: updated });
  },

  loadProductToCalc(prod) {
    set(s => ({
      inputs: {
        ...s.inputs,
        nombre:     prod.nombre,
        fob:        prod.fob,
        qty:        prod.qty,
        di:         prod.di,
        traderPct:  prod.traderPct ?? s.inputs.traderPct,
        link1688:   prod.link1688 ?? '',
        linkML:     prod.linkML ?? '',
        photos:     prod.photos ?? [null, null],
        tipoUnidad: prod.tipoUnidad ?? 'box',
        dimL:       prod.dims?.L ?? '',
        dimW:       prod.dims?.W ?? '',
        dimH:       prod.dims?.H ?? '',
        pesoUnit:   prod.pesoUnit ?? 0,
        currencyMode: prod.currencyMode ?? 'cny',
      },
      canales: prod.canales ? JSON.parse(JSON.stringify(prod.canales)) : DEFAULT_CANALES,
    }));
  },

  setApiKey(key) {
    localStorage.setItem('importapro-apikey', key);
    set({ apiKey: key });
  },
}));

export default useImportaproStore;
