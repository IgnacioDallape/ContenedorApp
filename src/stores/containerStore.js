import { create } from 'zustand';
import { CONTAINER_TYPES, COLORS, WEIGHT_LIMITS } from '../lib/constants.js';
import { setContainerDimensions, invalidatePackingCache, runPacking } from '../lib/packing.js';
import { _sb } from '../lib/supabase.js';

const GRID_RES = 5;

function makeDefaultContainer(id, type = '20ft') {
  return { id, type, products: [], priorityZones: [null, null, null], instanceManualPos: {}, instanceLockedOri: {} };
}

const useContainerStore = create((set, get) => ({
  // Container dimensions (synced with packing engine)
  CONT_L: 589, CONT_W: 235, CONT_H: 239,
  CONTAINER_VOL: CONTAINER_TYPES['20ft'].vol,
  currentContainerType: '20ft',

  // Multi-container shipment
  shipmentContainers: [makeDefaultContainer(1, '20ft')],
  activeContainerIdx: 0,
  currentShipmentId: null,
  semiWeightLimit: 28000,

  // Active container products
  loadedProducts: [],

  // 3D interaction state
  priorityZones: [null, null, null],
  instanceManualPos: {},
  instanceLockedOri: {},
  selectedZoneSlot: 0,

  // Inspector
  selectedInstanceId: null,
  interactMode: 'move',

  // Catalog
  catalog: JSON.parse(localStorage.getItem('cl_catalog') || '[]'),
  selectedCatalogItems: {},
  selectedCatalogZones: {},
  catalogLoaded: false,

  // Pending capacity overflow
  pendingProduct: null,

  setContainerType(type) {
    const ct = CONTAINER_TYPES[type];
    if (!ct) return;
    setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
    set({
      currentContainerType: type,
      CONT_L: ct.L, CONT_W: ct.W, CONT_H: ct.H,
      CONTAINER_VOL: ct.vol,
    });
    // sync to active shipment container
    const { shipmentContainers, activeContainerIdx } = get();
    const updated = [...shipmentContainers];
    updated[activeContainerIdx] = { ...updated[activeContainerIdx], type };
    set({ shipmentContainers: updated });
    // sync window globals for packing.js compatibility
    get()._syncWindowGlobals();
  },

  _setContainerTypeInternal(type) {
    const ct = CONTAINER_TYPES[type];
    if (!ct) return;
    setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
    set({
      currentContainerType: type,
      CONT_L: ct.L, CONT_W: ct.W, CONT_H: ct.H,
      CONTAINER_VOL: ct.vol,
    });
    get()._syncWindowGlobals();
  },

  _syncWindowGlobals() {
    const { instanceManualPos, instanceLockedOri, priorityZones, CONT_L, CONT_W, CONT_H, CONTAINER_VOL } = get();
    window._instanceManualPos = instanceManualPos;
    window._instanceLockedOri = instanceLockedOri;
    window._priorityZones     = priorityZones;
    window.CONT_L = CONT_L;
    window.CONT_W = CONT_W;
    window.CONT_H = CONT_H;
    window.CONTAINER_VOL = CONTAINER_VOL;
    window._palletsWithNoSpace = [];
  },

  addProduct(productData) {
    const { loadedProducts, COLORS: colors, priorityZones } = get();
    const activeZones = priorityZones.filter(z => z !== null);
    const zone = activeZones.length === 1 ? activeZones[0] : null;

    const newProd = {
      id: Date.now() + Math.random(),
      name:  productData.name,
      type:  productData.type,
      dims:  productData.dims,
      qty:   productData.qty,
      price: productData.price || 0,
      weight: productData.weight || 0,
      vol:   (productData.dims.L * productData.dims.W * productData.dims.H) / 1e6,
      color: COLORS[loadedProducts.length % COLORS.length],
      imgUrl: productData.imgUrl || null,
      priorityZone: productData.priorityZone || zone,
      priorityZoneSlot: productData.priorityZoneSlot != null ? productData.priorityZoneSlot : null,
      packedItems: productData.packedItems || null,
      palletBase: productData.palletBase || null,
    };

    const updated = [...loadedProducts, newProd].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'pallet' ? -1 : 1;
      const pa = a.priorityZone ? 0 : 1, pb = b.priorityZone ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H);
    });

    invalidatePackingCache();
    set({ loadedProducts: updated });
    get()._syncWindowGlobals();
  },

  removeProduct(id) {
    const { loadedProducts, instanceManualPos, instanceLockedOri } = get();
    const filtered = loadedProducts.filter(p => p.id != id);
    const newManual = { ...instanceManualPos };
    const newLocked = { ...instanceLockedOri };
    Object.keys(newManual).forEach(k => { if (k.startsWith(String(id) + '_')) delete newManual[k]; });
    Object.keys(newLocked).forEach(k => { if (k.startsWith(String(id) + '_')) delete newLocked[k]; });
    invalidatePackingCache();
    set({ loadedProducts: filtered, instanceManualPos: newManual, instanceLockedOri: newLocked });
    get()._syncWindowGlobals();
  },

  updateProductQty(id, newQty) {
    const { loadedProducts } = get();
    const updated = loadedProducts.map(p => p.id == id ? { ...p, qty: newQty } : p);
    invalidatePackingCache();
    set({ loadedProducts: updated });
  },

  clearAllProducts() {
    invalidatePackingCache();
    set({ loadedProducts: [], instanceManualPos: {}, instanceLockedOri: {} });
    get()._syncWindowGlobals();
  },

  reorderCargo() {
    const { loadedProducts } = get();
    const reordered = [...loadedProducts].map(p => ({ ...p, priorityZone: null, priorityZoneSlot: null, lockedOri: null }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'pallet' ? -1 : 1;
        return (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H);
      });
    invalidatePackingCache();
    set({
      loadedProducts: reordered,
      instanceManualPos: {},
      instanceLockedOri: {},
      priorityZones: [null, null, null],
    });
    get()._syncWindowGlobals();
  },

  moveProductToZone(id) {
    const { loadedProducts, priorityZones, selectedZoneSlot } = get();
    if (!priorityZones[selectedZoneSlot]) return false;
    const updated = loadedProducts.map(p =>
      p.id == id
        ? { ...p, priorityZoneSlot: selectedZoneSlot, priorityZone: priorityZones[selectedZoneSlot] }
        : p
    );
    invalidatePackingCache();
    set({ loadedProducts: updated });
    return true;
  },

  reorderProduct(id) {
    const { loadedProducts } = get();
    const updated = loadedProducts.map(p =>
      p.id == id ? { ...p, priorityZone: null, priorityZoneSlot: null } : p
    );
    invalidatePackingCache();
    set({ loadedProducts: updated });
  },

  setPriorityZone(slot, zone) {
    const { priorityZones } = get();
    const updated = [...priorityZones];
    updated[slot] = zone;
    set({ priorityZones: updated });
    get()._syncWindowGlobals();
    // refresh product zones
    get()._refreshProductZones(updated);
  },

  _refreshProductZones(zones) {
    const { loadedProducts } = get();
    const updated = loadedProducts.map(p => {
      if (p.priorityZoneSlot != null) {
        return { ...p, priorityZone: zones[p.priorityZoneSlot] || null };
      }
      return p;
    });
    set({ loadedProducts: updated });
  },

  clearPriorityZones() {
    const updated = [null, null, null];
    set({ priorityZones: updated });
    get()._syncWindowGlobals();
    get()._refreshProductZones(updated);
  },

  setSelectedZoneSlot(slot) { set({ selectedZoneSlot: slot }); },

  setInstanceManualPos(iid, pos) {
    const { instanceManualPos } = get();
    const updated = pos ? { ...instanceManualPos, [iid]: pos } : (() => {
      const n = { ...instanceManualPos }; delete n[iid]; return n;
    })();
    invalidatePackingCache();
    set({ instanceManualPos: updated });
    get()._syncWindowGlobals();
  },

  setInstanceLockedOri(iid, ori) {
    const { instanceLockedOri } = get();
    const updated = ori ? { ...instanceLockedOri, [iid]: ori } : (() => {
      const n = { ...instanceLockedOri }; delete n[iid]; return n;
    })();
    invalidatePackingCache();
    set({ instanceLockedOri: updated });
    get()._syncWindowGlobals();
  },

  setSelectedInstance(iid) { set({ selectedInstanceId: iid }); },
  setInteractMode(mode) { set({ interactMode: mode }); },

  // Multi-container
  addNewContainer() {
    const { shipmentContainers, currentContainerType } = get();
    const id = shipmentContainers.length + 1;
    const newC = makeDefaultContainer(id, currentContainerType);
    const updated = [...shipmentContainers, newC];
    set({ shipmentContainers: updated });
    get().switchToContainer(updated.length - 1);
  },

  switchToContainer(idx) {
    const { shipmentContainers, activeContainerIdx, loadedProducts, priorityZones, instanceManualPos, instanceLockedOri, currentContainerType } = get();
    // Save current
    const updated = [...shipmentContainers];
    updated[activeContainerIdx] = {
      ...updated[activeContainerIdx],
      products: [...loadedProducts],
      priorityZones: [...priorityZones],
      instanceManualPos: { ...instanceManualPos },
      instanceLockedOri: { ...instanceLockedOri },
      type: currentContainerType,
    };
    // Load next
    const next = updated[idx];
    set({
      shipmentContainers: updated,
      activeContainerIdx: idx,
      loadedProducts: [...next.products],
      priorityZones: [...(next.priorityZones || [null, null, null])],
      instanceManualPos: { ...(next.instanceManualPos || {}) },
      instanceLockedOri: { ...(next.instanceLockedOri || {}) },
    });
    get()._setContainerTypeInternal(next.type || '20ft');
    invalidatePackingCache();
    get()._syncWindowGlobals();
  },

  removeContainer(idx) {
    const { shipmentContainers } = get();
    if (shipmentContainers.length <= 1) return false;
    const updated = shipmentContainers.filter((_, i) => i !== idx);
    set({ shipmentContainers: updated });
    const newIdx = Math.min(get().activeContainerIdx, updated.length - 1);
    get().switchToContainer(newIdx);
    return true;
  },

  syncActiveContainer() {
    const { shipmentContainers, activeContainerIdx, loadedProducts, priorityZones, instanceManualPos, instanceLockedOri, currentContainerType } = get();
    const updated = [...shipmentContainers];
    updated[activeContainerIdx] = {
      ...updated[activeContainerIdx],
      products: [...loadedProducts],
      priorityZones: [...priorityZones],
      instanceManualPos: { ...instanceManualPos },
      instanceLockedOri: { ...instanceLockedOri },
      type: currentContainerType,
    };
    set({ shipmentContainers: updated });
    return updated;
  },

  loadShipmentData(data) {
    set({ currentShipmentId: data.id, shipmentContainers: data.containers, activeContainerIdx: 0 });
    const first = data.containers[0];
    set({
      loadedProducts: [...first.products],
      priorityZones: [...(first.priorityZones || [null, null, null])],
      instanceManualPos: { ...(first.instanceManualPos || {}) },
      instanceLockedOri: { ...(first.instanceLockedOri || {}) },
    });
    get()._setContainerTypeInternal(first.type || '20ft');
    invalidatePackingCache();
    get()._syncWindowGlobals();
  },

  resetShipmentId() { set({ currentShipmentId: null }); },
  setCurrentShipmentId(id) { set({ currentShipmentId: id }); },

  setSemiWeightLimit(val) { set({ semiWeightLimit: parseInt(val) || 28000 }); },

  // Catalog
  async loadCatalog() {
    try {
      const { data: { user } } = await _sb.auth.getUser();
      if (!user) return;
      const { data } = await _sb
        .from('user_catalog')
        .select('items')
        .eq('user_id', user.id)
        .single();
      if (data?.items?.length) {
        localStorage.setItem('cl_catalog', JSON.stringify(data.items));
        set({ catalog: data.items });
      }
    } catch { /* usa localStorage como fallback */ }
    set({ catalogLoaded: true });
  },

  saveCatalog(newCatalog) {
    localStorage.setItem('cl_catalog', JSON.stringify(newCatalog));
    set({ catalog: newCatalog });
    _sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      _sb.from('user_catalog').upsert({
        user_id: user.id,
        items: newCatalog,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn('Catalog sync error:', error);
      });
    });
  },

  addToCatalog(item) {
    const { catalog } = get();
    const idx = catalog.findIndex(c => c.name === item.name);
    const updated = idx >= 0
      ? catalog.map((c, i) => i === idx ? item : c)
      : [...catalog, item];
    get().saveCatalog(updated);
  },

  deleteCatalogItem(id) {
    const { catalog } = get();
    get().saveCatalog(catalog.filter(c => c.id != id));
  },

  updateCatalogItem(item) {
    const { catalog } = get();
    get().saveCatalog(catalog.map(c => c.id == item.id ? item : c));
  },

  setSelectedCatalogItems(items) { set({ selectedCatalogItems: items }); },
  setSelectedCatalogZones(zones) { set({ selectedCatalogZones: zones }); },
  clearCatalogSelection() { set({ selectedCatalogItems: {}, selectedCatalogZones: {} }); },
  setPendingProduct(p) { set({ pendingProduct: p }); },
}));

export default useContainerStore;
