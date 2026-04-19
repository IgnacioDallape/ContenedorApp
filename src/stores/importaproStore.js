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
  currencyMode: 'usd',
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
  publicationPlans: JSON.parse(localStorage.getItem('importapro-publication-plans') || '[]'),
  publicationOrderDraft: JSON.parse(localStorage.getItem('importapro-publication-order-draft') || '[]'),
  publicationOrderName: localStorage.getItem('importapro-publication-order-name') || '',
  canales: JSON.parse(JSON.stringify(DEFAULT_CANALES)),
  inputs: { ...DEFAULT_INPUTS },
  apiKey: localStorage.getItem('importapro-apikey') || '',
  loadedProductName: null,
  tcUpdatedAt: null,

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
    const removed = savedProducts[idx];
    const updated = savedProducts.filter((_, i) => i !== idx);
    const updatedPlans = removed
      ? get().publicationPlans.filter(plan => plan.productId !== removed.id)
      : get().publicationPlans;
    const updatedOrderDraft = removed
      ? get().publicationOrderDraft.filter(item => item.productId !== removed.id)
      : get().publicationOrderDraft;
    localStorage.setItem('importapro-products', JSON.stringify(updated));
    localStorage.setItem('importapro-publication-plans', JSON.stringify(updatedPlans));
    localStorage.setItem('importapro-publication-order-draft', JSON.stringify(updatedOrderDraft));
    set({ savedProducts: updated, publicationPlans: updatedPlans, publicationOrderDraft: updatedOrderDraft });
  },

  savePublicationPlan(plan) {
    const { publicationPlans } = get();
    const idx = publicationPlans.findIndex(p => p.productId === plan.productId);
    const updated = idx >= 0
      ? publicationPlans.map((p, i) => i === idx ? plan : p)
      : [...publicationPlans, plan];
    localStorage.setItem('importapro-publication-plans', JSON.stringify(updated));
    set({ publicationPlans: updated });
    return updated;
  },

  removePublicationPlan(productId) {
    const updated = get().publicationPlans.filter(plan => plan.productId !== productId);
    const updatedOrderDraft = get().publicationOrderDraft.filter(item => item.productId !== productId);
    localStorage.setItem('importapro-publication-plans', JSON.stringify(updated));
    localStorage.setItem('importapro-publication-order-draft', JSON.stringify(updatedOrderDraft));
    set({ publicationPlans: updated, publicationOrderDraft: updatedOrderDraft });
  },

  setPublicationOrderQty(productId, qty) {
    const safeQty = Math.max(0, parseInt(qty, 10) || 0);
    const current = get().publicationOrderDraft;
    const existing = current.find(item => item.productId === productId);
    let updated;
    if (safeQty <= 0) {
      updated = current.filter(item => item.productId !== productId);
    } else if (existing) {
      updated = current.map(item =>
        item.productId === productId
          ? { ...item, qty: safeQty, updatedAt: new Date().toISOString() }
          : item
      );
    } else {
      updated = [...current, { productId, qty: safeQty, updatedAt: new Date().toISOString() }];
    }
    localStorage.setItem('importapro-publication-order-draft', JSON.stringify(updated));
    set({ publicationOrderDraft: updated });
    return updated;
  },

  removePublicationOrderItem(productId) {
    const updated = get().publicationOrderDraft.filter(item => item.productId !== productId);
    localStorage.setItem('importapro-publication-order-draft', JSON.stringify(updated));
    set({ publicationOrderDraft: updated });
    return updated;
  },

  clearPublicationOrder() {
    localStorage.setItem('importapro-publication-order-draft', '[]');
    localStorage.setItem('importapro-publication-order-name', '');
    set({ publicationOrderDraft: [], publicationOrderName: '' });
  },

  setPublicationOrderName(name) {
    localStorage.setItem('importapro-publication-order-name', name);
    set({ publicationOrderName: name });
  },

  loadProductToCalc(prod) {
    set(s => ({
      inputs: {
        ...s.inputs,
        nombre:       prod.nombre,
        fob:          prod.fob,
        qty:          prod.qty,
        di:           prod.di          ?? s.inputs.di,
        ivaImp:       prod.ivaImp      ?? s.inputs.ivaImp,
        te:           prod.te          ?? s.inputs.te,
        traderPct:    prod.traderPct   ?? s.inputs.traderPct,
        flete:        prod.flete       ?? s.inputs.flete,
        seguroPct:    prod.seguroPct   ?? s.inputs.seguroPct,
        despachante:  prod.despachante ?? s.inputs.despachante,
        fleteInterno: prod.fleteInterno ?? s.inputs.fleteInterno,
        link1688:     prod.link1688 ?? '',
        linkML:       prod.linkML ?? '',
        photos:       prod.photos ?? [null, null],
        tipoUnidad:   prod.tipoUnidad ?? 'box',
        dimL:         prod.dims?.L ?? '',
        dimW:         prod.dims?.W ?? '',
        dimH:         prod.dims?.H ?? '',
        pesoUnit:     prod.pesoUnit ?? 0,
        currencyMode: prod.currencyMode ?? 'usd',
      },
      canales: prod.canales ? JSON.parse(JSON.stringify(prod.canales)) : JSON.parse(JSON.stringify(DEFAULT_CANALES)),
      loadedProductName: prod.nombre,
    }));
  },

  updateGlobalTC(value) {
    set(s => ({ inputs: { ...s.inputs, globalTC: value }, tcUpdatedAt: Date.now() }));
  },

  setApiKey(key) {
    localStorage.setItem('importapro-apikey', key);
    set({ apiKey: key });
  },
}));

export default useImportaproStore;
