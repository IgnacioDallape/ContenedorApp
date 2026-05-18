import { useState, useEffect } from 'react';
import usePalletStore, { pb_validatePlacement } from '../../stores/palletStore.js';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { PB_PALLET_TYPES, PB_COLORS } from '../../lib/constants.js';
import { _sb } from '../../lib/supabase.js';
import PalletThreeCanvas from './PalletThreeCanvas.jsx';

const PRODUCT_DEFAULTS = {
  name: '', L: '', W: '', H: '', qty: '', weight: '', mustBeBase: false, noRotate: false, imgUrl: null,
};

// Mismo flujo de estados que el Container Loader.
const STATUS_CONFIG = {
  preparacion:         { label: 'En preparación',              color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  en_transito_puerto:  { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto_partida:   { label: 'En puerto de partida',        color: '#8C6B3C', bg: '#FBF3E6', icon: '⚓' },
  embarcado:           { label: 'Embarcado',                   color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto_destino:   { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
  en_transito_destino: { label: 'En tránsito a destino final', color: '#4D7C8A', bg: '#EDF6F8', icon: '🚚' },
  entregado:           { label: 'Entregado',                   color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
};
const STATUS_ORDER = ['preparacion','en_transito_puerto','en_puerto_partida','embarcado','en_puerto_destino','en_transito_destino','entregado'];
const PALLET_SHARE_ORIGIN = 'https://fleetloader.vercel.app';
function getPalletShareUrl(id) { return `${PALLET_SHARE_ORIGIN}/share/pallet/${id}`; }
function normalizeJobStatus(status) { return STATUS_CONFIG[status] ? status : 'preparacion'; }

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { return document.execCommand('copy'); } catch { return false; }
  finally { document.body.removeChild(ta); }
}

const REORDER_OPTIONS = [
  { id: 'auto', label: 'Auto compacto' },
  { id: 'layers', label: 'Capas parejas' },
  { id: 'low-height', label: 'Baja altura' },
  { id: 'grid', label: 'Grilla densa' },
];

export default function PalletBuilder() {
  const {
    palletType, maxHeight, products, results, activeResult,
    setPalletType, setMaxHeight, addOrUpdateProduct, removeProduct,
    setEditingId, editingId, build, setActiveResult, clearResults,
    selectedBoxUid, setSelectedBoxUid, updateActiveResultBoxes, removeBoxFromActiveResult,
    restoreReserveBoxToActiveResult, reorderActiveResult, placeLeftoverInActiveResult,
    buildMode, setBuildMode, startManualEmpty, startManualPrebuilt, suggestRelocate,
  } = usePalletStore();
  const { setPendingProduct, catalog, setActiveSection: containerNav } = useContainerStore();
  const { setActiveSection, showToast } = useAppStore();

  const [form, setForm] = useState({ ...PRODUCT_DEFAULTS });
  const [showProductForm, setShowProductForm] = useState(false);
  const [catalogModal, setCatalogModal] = useState(false);
  const [catalogSel, setCatalogSel] = useState({}); // { id: qty }
  const [isBuilding, setIsBuilding] = useState(false);

  // ── Save / load / status state (mirror del Container Loader) ──
  const [currentJobId, setCurrentJobId] = useState(null);
  const [currentJobName, setCurrentJobName] = useState('');
  const [currentJobStatus, setCurrentJobStatus] = useState('preparacion');
  const [currentJobTracking, setCurrentJobTracking] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showTrackingEditor, setShowTrackingEditor] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [overwriteId, setOverwriteId] = useState(null);
  const [overwriteName, setOverwriteName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedList, setSavedList] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState('');

  const currentJobStatusCfg = STATUS_CONFIG[currentJobStatus] || STATUS_CONFIG.preparacion;
  const canEditJob = !currentJobId || currentJobStatus === 'preparacion';

  // Close status picker on outside click.
  useEffect(() => {
    if (!showStatusPicker) return;
    function close(e) {
      if (!e.target.closest?.('.pb-status-wrap')) setShowStatusPicker(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showStatusPicker]);

  const pt = PB_PALLET_TYPES[palletType];

  // ── Product form ──
  function openNewForm() {
    setEditingId(null);
    setForm({ ...PRODUCT_DEFAULTS });
    setShowProductForm(true);
  }

  function openEditForm(p) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      L: String(p.dims.L),
      W: String(p.dims.W),
      H: String(p.dims.H),
      qty: String(p.qty),
      weight: String(p.weight || ''),
      mustBeBase: p.mustBeBase || false,
      noRotate: p.noRotate || false,
      imgUrl: p.imgUrl || null,
    });
    setShowProductForm(true);
  }

  function loadPhotoFilePB(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setForm(f => ({ ...f, imgUrl: e.target.result }));
    reader.readAsDataURL(file);
  }

  function saveProduct() {
    const name = form.name.trim();
    const L = parseFloat(form.L), W = parseFloat(form.W), H = parseFloat(form.H);
    const qty = parseInt(form.qty);
    const weight = parseFloat(form.weight) || 0;

    if (!name) return showToast('Ingresá el nombre', 'error');
    if (!L || !W || !H) return showToast('Ingresá las dimensiones', 'error');
    if (!qty || qty < 1) return showToast('Ingresá la cantidad', 'error');
    if (qty > 250) return showToast('Máximo 250 por producto', 'error');

    const minDim = Math.min(L, W, H);
    if (minDim > Math.max(pt.L, pt.W)) return showToast('La caja es más grande que el pallet', 'error');

    addOrUpdateProduct({
      name,
      dims: { L, W, H },
      qty,
      weight,
      mustBeBase: form.mustBeBase,
      noRotate: form.noRotate,
      imgUrl: form.imgUrl || null,
    });
    clearResults();
    setShowProductForm(false);
    setForm({ ...PRODUCT_DEFAULTS });
  }

  function cancelForm() {
    setShowProductForm(false);
    setEditingId(null);
    setForm({ ...PRODUCT_DEFAULTS });
  }

  // ── Build ──
  function handleBuild() {
    if (!products.length) return showToast('Agregá productos primero', 'error');
    setIsBuilding(true);
    window.setTimeout(() => {
      try {
        build();
        if (usePalletStore.getState().results.length) {
          showToast(`✓ ${usePalletStore.getState().results.length} pallet(s) armado(s)`, 'success');
        }
      } finally {
        setIsBuilding(false);
      }
    }, 0);
  }

  // ── Manual mode helpers ──
  function handleStartEmpty() {
    if (!products.length) return showToast('Agregá productos primero', 'error');
    startManualEmpty();
    showToast('Pallet vacío listo — arrastrá o usá "+ Acá" para colocar', 'success');
  }
  function handleStartPrebuilt() {
    if (!products.length) return showToast('Agregá productos primero', 'error');
    setIsBuilding(true);
    window.setTimeout(() => {
      try {
        startManualPrebuilt();
        showToast('Pre-armado listo — podés mover y editar las cajas', 'success');
      } finally { setIsBuilding(false); }
    }, 0);
  }
  // Suma cantidades colocadas en TODOS los pallets+reservas
  function getPlacedCount(productId) {
    return results.reduce((sum, r) => {
      const b = r.boxes.filter(x => x.id === productId).length;
      const rsv = (r.reserveBoxes || []).filter(x => x.id === productId).length;
      return sum + b + rsv;
    }, 0);
  }
  // "+ Acá" / "Sugerir lugar" en modo manual: usa motor para encontrar mejor posición
  function handlePlaceUnit(productId) {
    const r = placeLeftoverInActiveResult(productId);
    if (!r?.ok) {
      const reasons = { 'no-fit': 'No hay espacio en este pallet', 'no-leftover': 'Ya están todas colocadas', 'missing-result': 'No hay pallet activo', 'missing-product': 'Producto no encontrado' };
      showToast(reasons[r?.reason] || 'No se pudo ubicar', 'error');
    }
  }

  // ── Export to container ──
  function addPalletToContainer(result) {
    setPendingProduct({
      name: `Pallet ${result.idx + 1} (${result.boxes.length} cj)`,
      type: 'pallet',
      dims: { L: result.palL, W: result.palW, H: result.totalHeight },
      qty: 1,
      price: 0,
      weight: result.totalWeight,
      priorityZone: null,
      packedItems: result.boxes,
      palletBase: { L: result.palL, W: result.palW },
    });
    setActiveSection('container');
  }

  function addAllPalletsToContainer() {
    if (!results.length) return;
    const store = useContainerStore.getState();
    let added = 0;
    for (const r of results) {
      const s = useContainerStore.getState();
      const vol = (r.palL * r.palW * r.totalHeight) / 1e6;
      const usedVol = s.loadedProducts.reduce((acc, p) => acc + p.vol * p.qty, 0);
      if (usedVol + vol > s.CONTAINER_VOL) break;
      store.addProduct({
        name: `Pallet ${r.idx + 1} (${r.boxes.length} cj)`,
        type: 'pallet',
        dims: { L: r.palL, W: r.palW, H: r.totalHeight },
        qty: 1, price: 0, weight: r.totalWeight,
        priorityZone: null, packedItems: r.boxes, palletBase: { L: r.palL, W: r.palW },
      });
      added++;
    }
    setActiveSection('container');
    if (added < results.length) {
      showToast(`✓ ${added} de ${results.length} pallets agregados — el contenedor se llenó`, 'error');
    } else {
      showToast(`✓ ${added} pallets agregados al contenedor`, 'success');
    }
  }

  // ── Catalog picker ──
  function openCatalogPicker() {
    const boxItems = catalog.filter(p => p.dims && p.type !== 'pallet');
    if (!boxItems.length) return showToast('No hay cajas con dimensiones en el catálogo', 'error');
    setCatalogSel({});
    setCatalogModal(true);
  }

  function loadFromCatalog() {
    const catItems = catalog.filter(p => p.dims && p.type !== 'pallet');
    let added = 0;
    for (const [sid, qty] of Object.entries(catalogSel)) {
      if (!qty) continue;
      const p = catItems.find(x => String(x.id) === sid);
      if (!p) continue;
      addOrUpdateProduct({
        name: p.name,
        dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
        qty: Math.max(1, parseInt(qty) || 1),
        weight: p.weight || 0,
        mustBeBase: false,
        noRotate: !!p.noRotate,
      });
      added++;
    }
    clearResults();
    setCatalogModal(false);
    showToast(`✓ ${added} producto(s) agregado(s) al pallet`, 'success');
  }

  // ── Active result ──
  const activeRes = results[activeResult] || null;
  const selectedBox = activeRes?.boxes?.find(box => box.uid === selectedBoxUid) || null;

  function rotateSelectedBox() {
    if (!activeRes || !selectedBox) return;
    if (selectedBox.noRotate) return showToast('Esta caja solo puede ir en su posición por defecto', 'error');

    // Generar las 6 orientaciones posibles a partir de las dims originales
    // (incluyendo "acostarla" — cambiar dY). El botón cicla a la próxima
    // orientación válida después de la actual.
    const src = selectedBox.sourceDims || { L: selectedBox.dX, W: selectedBox.dZ, H: selectedBox.dY };
    const allOris = [
      { dX: src.L, dZ: src.W, dY: src.H }, // de pie original
      { dX: src.W, dZ: src.L, dY: src.H }, // de pie rotado 90°
      { dX: src.L, dZ: src.H, dY: src.W }, // acostada de costado
      { dX: src.H, dZ: src.L, dY: src.W },
      { dX: src.W, dZ: src.H, dY: src.L }, // acostada de frente
      { dX: src.H, dZ: src.W, dY: src.L },
    ];
    // Quitar duplicados (cubos perfectos tienen menos orientaciones únicas)
    const unique = [];
    const seen = new Set();
    for (const o of allOris) {
      const k = `${o.dX}|${o.dY}|${o.dZ}`;
      if (!seen.has(k)) { seen.add(k); unique.push(o); }
    }

    // Identificar la orientación actual y empezar a probar desde la siguiente
    const currentKey = `${selectedBox.dX}|${selectedBox.dY}|${selectedBox.dZ}`;
    const startIdx = Math.max(0, unique.findIndex(o => `${o.dX}|${o.dY}|${o.dZ}` === currentKey));

    for (let i = 1; i <= unique.length; i++) {
      const candidate = unique[(startIdx + i) % unique.length];
      if (`${candidate.dX}|${candidate.dY}|${candidate.dZ}` === currentKey) continue;
      const placement = pb_validatePlacement(
        activeRes.boxes,
        selectedBox,
        activeRes.palL,
        activeRes.palW,
        activeRes.maxHeight,
        selectedBox.x,
        selectedBox.z,
        candidate
      );
      if (placement.valid) {
        updateActiveResultBoxes(activeRes.boxes.map(box =>
          box.uid === selectedBox.uid ? { ...box, ...placement } : box
        ));
        showToast(`Orientación: ${candidate.dX}×${candidate.dY}×${candidate.dZ} cm`, 'success');
        return;
      }
    }

    showToast('Ninguna otra orientación entra en esta posición. Movela primero a un lugar con más espacio.', 'error');
  }

  function restoreSelectedBoxOrientation() {
    if (!activeRes || !selectedBox?.sourceDims) return;
    const nextDims = {
      dX: selectedBox.sourceDims.L,
      dY: selectedBox.sourceDims.H,
      dZ: selectedBox.sourceDims.W,
    };
    const placement = pb_validatePlacement(
      activeRes.boxes,
      selectedBox,
      activeRes.palL,
      activeRes.palW,
      activeRes.maxHeight,
      selectedBox.x,
      selectedBox.z,
      nextDims
    );

    if (!placement.valid) {
      return showToast('No se puede restaurar esa orientación en esta posición', 'error');
    }

    updateActiveResultBoxes(activeRes.boxes.map(box =>
      box.uid === selectedBox.uid
        ? { ...box, ...placement }
        : box
    ));
    showToast('Orientación restaurada', 'success');
  }

  function restoreReserveBox(uid, nextX = null, nextZ = null) {
    const result = restoreReserveBoxToActiveResult(uid, nextX, nextZ);
    if (!result?.ok) {
      showToast('No encontré una posición estable para volver a subir esa caja', 'error');
      return false;
    }
    showToast('Caja reinsertada en el pallet', 'success');
    return true;
  }

  // "No entraron" → probar a meterla en el pallet activo.
  function placeLeftoverHere(productId, productName) {
    const result = placeLeftoverInActiveResult(productId);
    if (!result?.ok) {
      const msg = result?.reason === 'no-fit'
        ? `No entra "${productName}" en este pallet. Probá moverlo a otro pallet o reordenar.`
        : 'No pude colocar la caja';
      return showToast(msg, 'error');
    }
    showToast(`✓ "${productName}" colocada en el pallet activo`, 'success');
  }

  function reorderPallet(variant, label) {
    const result = reorderActiveResult(variant);
    if (!result?.ok) {
      showToast('No pude generar un reordenamiento estable para este pallet', 'error');
      return;
    }
    showToast(`Pallet reordenado: ${label}`, 'success');
  }

  // ── Persistence (Supabase `pallets` table) ──
  // Limpia un objeto para garantizar JSON.stringify safe: solo primitives,
  // arrays planos y objetos planos. Quita functions, undefined, símbolos.
  function jsonSafe(v) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) return v.map(jsonSafe);
    if (t === 'object') {
      const out = {};
      for (const k of Object.keys(v)) {
        if (typeof v[k] === 'function' || typeof v[k] === 'symbol') continue;
        out[k] = jsonSafe(v[k]);
      }
      return out;
    }
    return null;
  }

  function buildJobPayload() {
    return jsonSafe({
      v: 1,
      palletType,
      maxHeight,
      products: products.map(p => ({ ...p })),
      results: results.map(r => ({
        idx: r.idx,
        type: r.type,
        palL: r.palL,
        palW: r.palW,
        maxHeight: r.maxHeight,
        boxes: r.boxes.map(b => ({ ...b })),
        reserveBoxes: (r.reserveBoxes || []).map(b => ({ ...b })),
        products: (r.products || []).map(p => ({ ...p })),
      })),
    });
  }

  function applyJobPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    try {
      if (payload.palletType) setPalletType(payload.palletType);
      if (payload.maxHeight)  setMaxHeight(payload.maxHeight);
      const { setProducts, setResults } = usePalletStore.getState();
      if (typeof setProducts === 'function') setProducts(payload.products || []);
      if (typeof setResults === 'function')  setResults(payload.results || []);
    } catch (e) {
      console.error('[PalletBuilder] applyJobPayload error:', e);
      showToast('No pude restaurar el pallet guardado: ' + (e.message || e), 'error');
    }
  }

  function newJob() {
    setCurrentJobId(null);
    setCurrentJobName('');
    setCurrentJobStatus('preparacion');
    setCurrentJobTracking('');
  }

  function openSaveModal() {
    if (!products.length) return showToast('Agregá productos antes de guardar', 'error');
    setSaveName(currentJobName || '');
    setShowSave(true);
  }

  async function confirmSave() {
    const name = saveName.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    try {
      let session;
      try { ({ data: { session } } = await _sb.auth.getSession()); }
      catch (e) {
        console.error('[PalletBuilder] auth.getSession failed:', e);
        showToast('Error de conexión', 'error'); return;
      }
      if (!session) { showToast('Necesitás estar logueado', 'error'); return; }

      const { data: existing, error: queryError } = await _sb.from('pallets')
        .select('id,name').eq('user_id', session.user.id).ilike('name', name);
      if (queryError) {
        console.error('[PalletBuilder] query existing failed:', queryError);
        const msg = /relation .* does not exist|does not exist/i.test(queryError.message || '')
          ? 'La tabla `pallets` no existe en Supabase. Corré la SQL migration primero.'
          : 'Error al verificar nombre: ' + queryError.message;
        showToast(msg, 'error');
        return;
      }

      // Si el nombre choca con OTRO pallet (no el actual), pedir confirmación.
      const conflict = existing?.find(row => String(row.id) !== String(currentJobId));
      if (conflict) {
        setOverwriteId(conflict.id);
        setOverwriteName(name);
        setShowSave(false);
        setShowOverwrite(true);
        return;
      }

      const payload = buildJobPayload();

      // Si ya tenemos currentJobId (editando un pallet cargado), update directo.
      if (currentJobId) {
        const { error } = await _sb.from('pallets').update({
          name,
          payload,
          status: currentJobStatus,
          tracking_url: currentJobTracking || null,
        }).eq('id', currentJobId);
        if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
        setCurrentJobName(name);
        setShowSave(false);
        showToast(`Pallet actualizado: "${name}"`, 'success');
        return;
      }

      // Caso nuevo: insert.
      const { data: inserted, error } = await _sb.from('pallets').insert({
        user_id: session.user.id,
        name,
        payload,
        status: currentJobStatus,
        tracking_url: currentJobTracking || null,
        is_public: false,
      }).select('id').single();
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }

      setCurrentJobId(inserted.id);
      setCurrentJobName(name);
      setShowSave(false);
      showToast(`Pallet guardado: "${name}"`, 'success');
    } catch (e) {
      console.error('[PalletBuilder] confirmSave error:', e);
      showToast('No pude guardar: ' + (e.message || e), 'error');
    } finally { setIsSaving(false); }
  }

  async function confirmOverwrite() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = buildJobPayload();
      const { error } = await _sb.from('pallets').update({
        name: overwriteName,
        payload,
        status: currentJobStatus,
        tracking_url: currentJobTracking || null,
      }).eq('id', overwriteId);
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
      setCurrentJobId(overwriteId);
      setCurrentJobName(overwriteName);
      setShowOverwrite(false);
      showToast(`Pallet actualizado: "${overwriteName}"`, 'success');
    } finally { setIsSaving(false); }
  }

  async function handleLoadList() {
    setSavedLoading(true);
    try {
      let session;
      try { ({ data: { session } } = await _sb.auth.getSession()); }
      catch (e) {
        console.error('[PalletBuilder] auth.getSession failed:', e);
        return showToast('Error de conexión', 'error');
      }
      if (!session) return showToast('Necesitás estar logueado', 'error');

      const { data, error } = await _sb.from('pallets')
        .select('id,name,created_at,status,tracking_url')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.error('[PalletBuilder] list pallets failed:', error);
        const msg = /relation .* does not exist|does not exist/i.test(error.message || '')
          ? 'La tabla `pallets` no existe en Supabase. Corré la SQL migration primero.'
          : 'Error al cargar pallets: ' + error.message;
        return showToast(msg, 'error');
      }
      setSavedList(data || []);
      setShowLoad(true);
    } catch (e) {
      console.error('[PalletBuilder] handleLoadList error:', e);
      showToast('No pude cargar la lista: ' + (e.message || e), 'error');
    } finally { setSavedLoading(false); }
  }

  async function loadJob(id) {
    try {
      const { data, error } = await _sb.from('pallets').select('*').eq('id', id).single();
      if (error || !data) {
        console.error('[PalletBuilder] loadJob failed:', error);
        return showToast('Error al cargar pallet: ' + (error?.message || 'no encontrado'), 'error');
      }
      applyJobPayload(data.payload);
      setCurrentJobId(data.id);
      setCurrentJobName(data.name);
      setCurrentJobStatus(normalizeJobStatus(data.status));
      setCurrentJobTracking(data.tracking_url || '');
      setShowLoad(false);
      showToast(`✓ Pallet "${data.name}" cargado`, 'success');
    } catch (e) {
      console.error('[PalletBuilder] loadJob error:', e);
      showToast('No pude cargar el pallet: ' + (e.message || e), 'error');
    }
  }

  async function deleteJob(id) {
    if (!window.confirm('¿Borrar este pallet guardado?')) return;
    try {
      const { error } = await _sb.from('pallets').delete().eq('id', id);
      if (error) {
        console.error('[PalletBuilder] deleteJob failed:', error);
        return showToast('Error al borrar: ' + error.message, 'error');
      }
      setSavedList(prev => prev.filter(s => s.id !== id));
      if (String(id) === String(currentJobId)) newJob();
      showToast('Pallet borrado', 'success');
    } catch (e) {
      console.error('[PalletBuilder] deleteJob error:', e);
      showToast('No pude borrar: ' + (e.message || e), 'error');
    }
  }

  async function updateJobStatus(nextStatus) {
    const normalized = normalizeJobStatus(nextStatus);
    setCurrentJobStatus(normalized);
    setShowStatusPicker(false);
    if (!currentJobId) return;
    const { error } = await _sb.from('pallets').update({ status: normalized }).eq('id', currentJobId);
    if (error) showToast('No pude actualizar el estado: ' + error.message, 'error');
  }

  async function saveTracking() {
    const url = trackingDraft.trim();
    setCurrentJobTracking(url);
    setShowTrackingEditor(false);
    if (!currentJobId) return; // se persistirá al guardar
    const { error } = await _sb.from('pallets').update({ tracking_url: url || null }).eq('id', currentJobId);
    if (error) showToast('No pude actualizar el link: ' + error.message, 'error');
    else showToast('Link de seguimiento actualizado', 'success');
  }

  async function copyShareLink() {
    if (!currentJobId) return showToast('Guardá el pallet primero', 'error');
    const ok = await copyToClipboard(getPalletShareUrl(currentJobId));
    showToast(ok ? 'Link copiado al portapapeles' : 'No pude copiar el link', ok ? 'success' : 'error');
  }

  return (
    <div className="pallet-builder-root" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="pallet-builder-sidebar" style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Armador de pallets</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Motor BFD de precisión 2 cm</p>
        </div>

        {/* Pallet config */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 8 }}>TIPO DE PALLET</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Object.entries(PB_PALLET_TYPES).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setPalletType(key)}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
                  border: palletType === key ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: palletType === key ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'var(--bg-3)',
                  color: palletType === key ? 'var(--accent)' : 'var(--text-2)',
                }}
              >
                {val.label}<br />
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", opacity: 0.8 }}>{val.dims}</span>
              </button>
            ))}
          </div>

          <div className="field">
            <label>Altura máxima <span className="unit">cm</span></label>
            <input
              type="range" min="80" max="240" step="5" value={maxHeight}
              onChange={e => setMaxHeight(e.target.value)}
              style={{ width: '100%', marginBottom: 2 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
              <span>80 cm</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{maxHeight} cm</span>
              <span>240 cm</span>
            </div>
          </div>
        </div>

        {/* Products list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)' }}>PRODUCTOS ({products.length})</span>
            <button
              onClick={openCatalogPicker}
              style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-2)' }}
            >
              + Catálogo
            </button>
          </div>

          {!products.length ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 12 }}>Sin productos aún.</p>
            </div>
          ) : (
            products.map(p => {
              const placed = getPlacedCount(p.id);
              const remaining = Math.max(0, (p.qty || 0) - placed);
              const showManualBtn = buildMode === 'manual' && results.length > 0 && remaining > 0;
              return (
              <div key={p.id} className="queue-item" style={{ marginBottom: 6 }}>
                {p.imgUrl
                  ? <img src={p.imgUrl} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div className="queue-dot" style={{ background: p.color }} />
                }
                <div className="queue-info">
                  <div className="queue-name">
                    {p.name}
                    {p.mustBeBase && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>
                        ⬇ BASE
                      </span>
                    )}
                    {p.noRotate && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-3)', color: 'var(--text)', fontFamily: "'DM Mono', monospace", marginLeft: 4, border: '1px solid var(--border)' }}>
                        POS. FIJA
                      </span>
                    )}
                  </div>
                  <div className="queue-meta">
                    {p.dims.L}×{p.dims.W}×{p.dims.H} cm · {p.qty} cj
                    {p.weight > 0 ? ` · ${p.weight} kg/u` : ''}
                    {buildMode === 'manual' && results.length > 0 && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, background: remaining > 0 ? 'var(--bg-3)' : 'var(--accent-dim, #d8efe2)', color: remaining > 0 ? 'var(--text-2)' : 'var(--accent)', fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700 }}>
                        {placed}/{p.qty}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {showManualBtn && (
                    <button
                      onClick={() => handlePlaceUnit(p.id)}
                      title="Ubicar 1 unidad con asistencia del motor"
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}
                    >+ Acá</button>
                  )}
                  <button
                    onClick={() => openEditForm(p)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 5px', fontSize: 9, color: 'var(--text-3)', cursor: 'pointer' }}
                  >✎</button>
                  <button
                    className="btn-remove"
                    onClick={() => { removeProduct(p.id); clearResults(); }}
                  >×</button>
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Bottom buttons */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={openNewForm}
            style={{ width: '100%', padding: '9px 0', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            + Agregar producto
          </button>
          {buildMode === 'auto' ? (
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '10px 0' }}
              onClick={handleBuild}
              disabled={!products.length || isBuilding}
            >
              {isBuilding ? 'Armando...' : '🤖 Armar pallets (motor)'}
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                onClick={handleStartEmpty}
                disabled={!products.length || isBuilding}
                style={{ padding: '10px 4px', fontSize: 11, borderRadius: 6, border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}
              >
                📦 Vacío
              </button>
              <button
                onClick={handleStartPrebuilt}
                disabled={!products.length || isBuilding}
                style={{ padding: '10px 4px', fontSize: 11, borderRadius: 6, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}
              >
                {isBuilding ? '...' : '🤖 Pre-armar'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="pallet-builder-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar: nombre del job, estado, link de seguimiento, guardar/cargar */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0, background: 'var(--bg-2)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 220px' }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)' }}>
              {currentJobId ? 'PALLET GUARDADO' : 'PALLET SIN GUARDAR'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentJobName || 'Nuevo pallet'}
            </div>
          </div>

          {/* Status badge + picker */}
          <div className="pb-status-wrap" style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowStatusPicker(v => !v)}
              title={currentJobStatusCfg.label}
              style={{
                padding: '6px 12px', fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.4px',
                borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${currentJobStatusCfg.color}55`,
                background: currentJobStatusCfg.bg, color: currentJobStatusCfg.color,
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontWeight: 700,
              }}
            >
              <span>{currentJobStatusCfg.icon}</span>
              <span>{currentJobStatusCfg.label}</span>
              <span style={{ opacity: 0.6 }}>▾</span>
            </button>
            {showStatusPicker && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'grid', gap: 3, minWidth: 220 }}>
                {STATUS_ORDER.map((key) => {
                  const cfg = STATUS_CONFIG[key];
                  return (
                    <button
                      key={key}
                      onClick={() => updateJobStatus(key)}
                      style={{
                        background: currentJobStatus === key ? cfg.bg : 'transparent',
                        border: `1.5px solid ${currentJobStatus === key ? cfg.color + '55' : 'transparent'}`,
                        borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                        color: cfg.color, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 7,
                      }}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tracking link */}
          <button
            type="button"
            onClick={() => { setTrackingDraft(currentJobTracking || ''); setShowTrackingEditor(true); }}
            title={currentJobTracking || 'Sin link de seguimiento'}
            style={{
              padding: '6px 12px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.3px',
              borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${currentJobTracking ? 'var(--accent)' : 'var(--border)'}`,
              background: currentJobTracking ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'transparent',
              color: currentJobTracking ? 'var(--accent)' : 'var(--text-3)',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontWeight: 600,
            }}
          >
            🔗 {currentJobTracking ? 'Link seguimiento' : 'Sin link'}
          </button>

          {/* Toggle modo Auto / Manual */}
          <div style={{ display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg-3)' }}>
            <button
              type="button"
              onClick={() => setBuildMode('auto')}
              style={{
                padding: '5px 12px', fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.4px',
                borderRadius: 6, cursor: 'pointer', border: 'none', fontWeight: 700,
                background: buildMode === 'auto' ? 'var(--accent)' : 'transparent',
                color: buildMode === 'auto' ? '#fff' : 'var(--text-3)',
              }}
              title="El motor arma los pallets automáticamente"
            >🤖 Auto</button>
            <button
              type="button"
              onClick={() => setBuildMode('manual')}
              style={{
                padding: '5px 12px', fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.4px',
                borderRadius: 6, cursor: 'pointer', border: 'none', fontWeight: 700,
                background: buildMode === 'manual' ? 'var(--accent)' : 'transparent',
                color: buildMode === 'manual' ? '#fff' : 'var(--text-3)',
              }}
              title="Vos armás el pallet con asistencia del motor (snap, gravedad, sugerencias)"
            >✋ Manual</button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {currentJobId && (
              <button type="button" onClick={newJob} style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                + Nuevo
              </button>
            )}
            <button type="button" onClick={handleLoadList} style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
              📂 Cargar
            </button>
            <button type="button" onClick={openSaveModal} disabled={!products.length} style={{ padding: '6px 14px', fontSize: 11, borderRadius: 6, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: products.length ? 'pointer' : 'default', fontFamily: "'DM Mono', monospace", fontWeight: 700, opacity: products.length ? 1 : 0.5 }}>
              💾 Guardar
            </button>
          </div>
        </div>

        {/* Results panel */}
        <div className="pallet-builder-results" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!results.length ? (
            <div className="pallet-builder-empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <PalletThreeCanvas
                  result={{ idx: 'empty', boxes: [], palL: pt.L, palW: pt.W, maxHeight }}
                  selectedBoxUid={null}
                  onSelectBox={() => {}}
                  onUpdateBoxes={() => {}}
                  onDropReserveBox={() => {}}
                />
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', color: 'var(--text-3)' }}>
                {buildMode === 'manual' ? (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Modo manual: agregá productos y elegí cómo empezar</p>
                    <p style={{ fontSize: 11, margin: 0, opacity: 0.8 }}>📦 Vacío: colocás cada caja con asistencia · 🤖 Pre-armar: el motor arma una base y vos la editás</p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Agregá productos y presioná "Armar pallets"</p>
                    <p style={{ fontSize: 11, margin: 0, opacity: 0.8 }}>El motor BFD calculará la distribución óptima.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Pallet tabs + export buttons */}
              <div className="pallet-builder-tabs" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveResult(i)}
                    style={{
                      padding: '6px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px',
                      border: `1.5px solid ${i === activeResult ? 'var(--accent)' : 'var(--border)'}`,
                      background: i === activeResult ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'transparent',
                      color: i === activeResult ? 'var(--accent)' : 'var(--text-3)',
                      fontWeight: i === activeResult ? 700 : 400,
                    }}
                  >
                    🟫 Pallet {r.idx + 1} <span style={{ opacity: 0.7 }}>{r.boxes.length} cj</span>
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => activeRes && addPalletToContainer(activeRes)}
                    style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 700 }}
                  >
                    + Este pallet
                  </button>
                  {results.length > 1 && (
                    <button
                      onClick={addAllPalletsToContainer}
                      style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700 }}
                    >
                      + Todos ({results.length})
                    </button>
                  )}
                </div>
              </div>

              {/* 3D + summary split */}
              <div className="pallet-builder-view" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* 3D view */}
                <div className="pallet-builder-canvas-panel" style={{ flex: 1, padding: 12, minWidth: 0, position: 'relative' }}>
                  <PalletThreeCanvas
                    result={activeRes}
                    selectedBoxUid={selectedBoxUid}
                    onSelectBox={setSelectedBoxUid}
                    onUpdateBoxes={updateActiveResultBoxes}
                    onDropReserveBox={restoreReserveBox}
                    strictMode={buildMode === 'manual'}
                  />
                  {selectedBox && (
                    <div className="pallet-builder-inspector" style={{ position: 'absolute', right: 22, top: 22, zIndex: 30, width: 'min(272px, calc(100% - 44px))', maxHeight: 'calc(100% - 44px)', background: 'linear-gradient(180deg, rgba(251,247,241,0.98), rgba(243,236,227,0.98))', border: '1px solid rgba(141,121,102,0.22)', borderRadius: 18, boxShadow: '0 20px 44px rgba(97,78,60,0.18)', fontFamily: "'DM Mono', monospace", backdropFilter: 'blur(14px)', overflowX: 'hidden', overflowY: 'auto' }}>
                      <div style={{ padding: '14px 14px 12px', background: 'linear-gradient(135deg, var(--c1), #a48f7d)', color: 'var(--c5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(248,241,233,0.16)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedBox.name}</div>
                            <div style={{ fontSize: 9, color: 'rgba(248,241,233,0.78)', letterSpacing: 0.8 }}>UNIDAD {selectedBox.uid.split('::').pop()}</div>
                          </div>
                        </div>
                        <button onClick={() => setSelectedBoxUid(null)} style={{ width: 28, height: 28, borderRadius: 9, border: '1px solid rgba(248,241,233,0.18)', background: 'rgba(248,241,233,0.12)', color: 'var(--c5)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>×</button>
                      </div>

                      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>MEDIDAS</div>
                            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{selectedBox.dX}×{selectedBox.dZ}×{selectedBox.dY} cm</div>
                          </div>
                          <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>POSICIÓN</div>
                            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>X {selectedBox.x} · Z {selectedBox.z} · Y {selectedBox.y}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 9 }}>ORIENTACIÓN Y POSICIÓN</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          <button
                            onClick={rotateSelectedBox}
                            disabled={selectedBox.noRotate}
                            style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text)', cursor: selectedBox.noRotate ? 'not-allowed' : 'pointer', opacity: selectedBox.noRotate ? 0.38 : 1 }}
                          >
                            Giro horizontal
                          </button>
                          <button
                            onClick={restoreSelectedBoxOrientation}
                            style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
                          >
                            Restaurar
                          </button>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(141,121,102,0.08)', color: 'var(--muted)', fontSize: 10, lineHeight: 1.45 }}>
                          Podés arrastrar la caja dentro del pallet. Se mueve individualmente; si querés mover la pila completa, mantené Shift mientras arrastrás.
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px 14px', display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                        {buildMode === 'manual' && (
                          <button
                            onClick={() => {
                              const r = suggestRelocate(selectedBox.uid);
                              if (!r?.ok) showToast('Motor no encontró mejor lugar', 'warn');
                              else showToast('✓ Reubicado por el motor', 'success');
                            }}
                            style={{ padding: '10px 8px', borderRadius: 12, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                          >
                            🤖 Sugerir mejor lugar
                          </button>
                        )}
                        <button onClick={() => removeBoxFromActiveResult(selectedBox.uid)} style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(184,92,92,0.26)', background: 'rgba(184,92,92,0.06)', color: 'var(--danger)', cursor: 'pointer' }}>Mover a reserva</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary panel */}
                {activeRes && (
                  <div className="pallet-builder-summary" style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 14 }}>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'TIPO', val: PB_PALLET_TYPES[activeRes.type]?.label, sub: PB_PALLET_TYPES[activeRes.type]?.dims },
                        { label: 'ALTURA', val: `${activeRes.totalHeight} cm`, sub: `de ${maxHeight} cm máx` },
                        { label: 'CAJAS', val: activeRes.boxes.length, sub: 'unidades' },
                        { label: 'PESO', val: `${activeRes.totalWeight.toFixed(1)} kg`, sub: 'estimado' },
                      ].map(s => (
                        <div key={s.label} style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 6 }}>REORDENAR</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {REORDER_OPTIONS.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => reorderPallet(option.id, option.label)}
                          style={{
                            padding: '8px 8px',
                            borderRadius: 8,
                            border: '1.5px solid rgba(141,121,102,0.24)',
                            background: 'rgba(255,255,255,0.58)',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.2,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {/* Per-product breakdown */}
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 6 }}>DISTRIBUCIÓN</div>
                    {(() => {
                      const counts = {};
                      for (const b of activeRes.boxes) counts[b.name] = (counts[b.name] || 0) + 1;
                      return Object.entries(counts).map(([name, cnt]) => {
                        const prod = products.find(p => p.name === name);
                        return (
                          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: prod?.color || '#999', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{cnt} cj</span>
                          </div>
                        );
                      });
                    })()}

                    {!!activeRes.reserveBoxes?.length && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 8 }}>RESERVA MANUAL</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {activeRes.reserveBoxes.map(box => (
                            <div
                              key={box.uid}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('application/x-pallet-reserve-box', box.uid);
                              }}
                              style={{
                                padding: '10px 10px 9px',
                                borderRadius: 10,
                                border: '1px dashed rgba(141,121,102,0.35)',
                                background: 'rgba(255,255,255,0.58)',
                                cursor: 'grab',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: box.color || '#999', flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{box.name}</span>
                                <button
                                  type="button"
                                  onClick={() => restoreReserveBox(box.uid)}
                                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(141,121,102,0.18)', background: 'var(--bg-2)', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
                                >
                                  Reinsertar
                                </button>
                              </div>
                              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-3)' }}>
                                {box.dX}×{box.dZ}×{box.dY} cm · Arrastrala al pallet para ubicarla manualmente
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Leftover check */}
                    {(() => {
                      if (!results.length) return null;
                      const totalPlaced = results.reduce((sum, r) => {
                        const c = {};
                        r.boxes.forEach(b => { c[b.name] = (c[b.name] || 0) + 1; });
                        return sum;
                      }, 0);
                      const leftover = products.filter(p => {
                        const placed = results.reduce((s, r) => s + r.boxes.filter(b => b.name === p.name).length, 0);
                        return placed < p.qty;
                      });
                      if (!leftover.length) return null;
                      return (
                        <div style={{ marginTop: 12, background: 'rgba(184,92,92,0.08)', border: '1.5px solid rgba(184,92,92,0.35)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', letterSpacing: 1, marginBottom: 6 }}>NO ENTRARON</div>
                          {leftover.map(p => {
                            const placed = results.reduce((s, r) => s + r.boxes.filter(b => b.name === p.name).length, 0);
                            const remaining = p.qty - placed;
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 6 }}>
                                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: p.color || '#999' }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 10, flexShrink: 0 }}>{remaining} sin ubicar</span>
                                <button
                                  type="button"
                                  onClick={() => placeLeftoverHere(p.id, p.name)}
                                  title="Probar a meter una unidad en el pallet activo"
                                  style={{
                                    padding: '4px 8px', fontSize: 10, fontWeight: 700,
                                    borderRadius: 6, border: '1px solid var(--accent)',
                                    background: 'var(--accent)', color: '#fff',
                                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                    fontFamily: "'DM Mono', monospace",
                                  }}
                                >
                                  + Acá
                                </button>
                              </div>
                            );
                          })}
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                            "+ Acá" intenta meter 1 unidad en este pallet. Si no entra acá, probá otro pallet o aumentá la altura máxima.
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── PRODUCT FORM MODAL ── */}
      {showProductForm && (
        <div
          className="pb-product-modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm(); }}
        >
          <div
            className="pb-product-modal"
            style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                {editingId != null ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button onClick={cancelForm} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
            </div>

            <div className="form-grid-2">
              <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox" id="pbNoRotate"
                  checked={form.noRotate}
                  onChange={e => setForm(f => ({ ...f, noRotate: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="pbNoRotate" style={{ cursor: 'pointer', fontSize: 13, margin: 0 }}>
                  Solo puede ir en posición por defecto
                  <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>
                    Si no lo marcás, el motor puede rotarla para acomodarla mejor.
                  </span>
                </label>
              </div>
              <div className="field full">
                <label>Nombre</label>
                <input
                  type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Caja chica"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Largo <span className="unit">cm</span></label>
                <input type="number" value={form.L} onChange={e => setForm(f => ({ ...f, L: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Ancho <span className="unit">cm</span></label>
                <input type="number" value={form.W} onChange={e => setForm(f => ({ ...f, W: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Alto <span className="unit">cm</span></label>
                <input type="number" value={form.H} onChange={e => setForm(f => ({ ...f, H: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Cantidad</label>
                <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} min="1" max="250" />
              </div>
              <div className="field full">
                <label>Peso <span className="unit">kg/u</span></label>
                <input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} min="0" step="0.1" />
              </div>
              <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox" id="pbMustBeBase"
                  checked={form.mustBeBase}
                  onChange={e => setForm(f => ({ ...f, mustBeBase: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="pbMustBeBase" style={{ cursor: 'pointer', fontSize: 13, margin: 0 }}>
                  ⬇ Debe ir en la base (capa inferior del pallet)
                </label>
              </div>
              <div className="field full">
                <label>Foto de referencia <span className="unit">opcional</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {form.imgUrl ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={form.imgUrl} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <button onClick={() => setForm(f => ({ ...f, imgUrl: null }))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => document.getElementById('pb-photo-input').click()}
                    style={{ padding: '7px 14px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}
                  >
                    {form.imgUrl ? 'Cambiar foto' : '+ Subir foto'}
                  </button>
                  <input type="file" id="pb-photo-input" accept="image/*" style={{ display: 'none' }}
                    onChange={e => loadPhotoFilePB(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className="pb-product-form-actions" style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelForm}
                style={{ padding: '9px 18px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveProduct}>
                {editingId != null ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CATALOG PICKER MODAL ── */}
      {catalogModal && (() => {
        const items = catalog.filter(p => p.dims && p.type !== 'pallet');
        const anyChecked = Object.values(catalogSel).some(Boolean);
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
            onClick={e => { if (e.target === e.currentTarget) setCatalogModal(false); }}
          >
            <div
              style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Catálogo de productos</h3>
                <button onClick={() => setCatalogModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => {
                    const all = {};
                    items.forEach(p => { all[p.id] = catalogSel[p.id] || 1; });
                    setCatalogSel(all);
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                >
                  Seleccionar todo
                </button>
                <button
                  onClick={() => setCatalogSel({})}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                >
                  Deseleccionar
                </button>
                <button
                  onClick={loadFromCatalog}
                  disabled={!anyChecked}
                  style={{ marginLeft: 'auto', padding: '6px 16px', background: anyChecked ? 'var(--accent)' : 'var(--bg-3)', color: anyChecked ? '#fff' : 'var(--text-3)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: anyChecked ? 'pointer' : 'default', transition: 'all 0.15s' }}
                >
                  ✓ Cargar selección
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {items.map(p => {
                  const checked = !!catalogSel[p.id];
                  const qty = catalogSel[p.id] || 1;
                  return (
                    <div key={p.id} style={{ padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setCatalogSel(prev => e.target.checked ? { ...prev, [p.id]: qty } : (() => { const n = { ...prev }; delete n[p.id]; return n; })())}
                          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }}
                        />
                        {p.imgUrl ? (
                          <img src={p.imgUrl} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} alt={p.name} />
                        ) : (
                          <div style={{ width: 40, height: 40, background: 'var(--border)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
                            {p.dims.L}×{p.dims.W}×{p.dims.H} cm{p.weight ? ` · ${p.weight} kg/u` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                        <div className="pb-catalog-qty-stepper" style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <button
                            onClick={() => setCatalogSel(prev => ({ ...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1) }))}
                            style={{ width: 28, height: 28, background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text)' }}
                          >−</button>
                          <input
                            className="pb-catalog-qty-input"
                            type="number" value={qty} min="1" max="500"
                            onChange={e => setCatalogSel(prev => ({ ...prev, [p.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            style={{ width: 58, height: 28, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 13, background: 'var(--bg-2)', color: 'var(--text)' }}
                          />
                          <button
                            onClick={() => setCatalogSel(prev => ({ ...prev, [p.id]: Math.min(500, (prev[p.id] || 1) + 1) }))}
                            style={{ width: 28, height: 28, background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text)' }}
                          >+</button>
                        </div>
                        <button
                          onClick={() => {
                            const existingProd = products.find(x => x.name === p.name);
                            if (existingProd) {
                              addOrUpdateProduct({ ...existingProd, qty: existingProd.qty + qty });
                            } else {
                              addOrUpdateProduct({
                                name: p.name,
                                dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
                                qty,
                                weight: p.weight || 0,
                                mustBeBase: false,
                                noRotate: !!p.noRotate,
                              });
                            }
                            clearResults();
                            setCatalogModal(false);
                            showToast(`✓ ${p.name} (${qty} u) agregado`, 'success');
                          }}
                          style={{ flex: 1, padding: '6px 8px', background: 'transparent', color: 'var(--accent)', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Individual
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Save modal ── */}
      {showSave && (
        <div onClick={() => setShowSave(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 440, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Guardar pallet</div>
            <label style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>NOMBRE</label>
            <input
              type="text" autoFocus value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSave(); }}
              placeholder="Ej: Embarque cliente X"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid var(--border-2)', borderRadius: 6, background: 'var(--bg-3)', color: 'var(--text)', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowSave(false)} style={{ padding: '8px 16px', fontSize: 12, border: '1px solid var(--border)', background: 'transparent', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>Cancelar</button>
              <button onClick={confirmSave} disabled={!saveName.trim() || isSaving} style={{ padding: '8px 22px', fontSize: 12, border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 6, cursor: saveName.trim() && !isSaving ? 'pointer' : 'default', fontWeight: 700, opacity: saveName.trim() && !isSaving ? 1 : 0.5 }}>
                {isSaving ? 'Guardando...' : 'Guardar →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overwrite confirm modal ── */}
      {showOverwrite && (
        <div onClick={() => setShowOverwrite(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 440, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Ya existe un pallet con ese nombre</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 18 }}>
              "<b>{overwriteName}</b>" ya está guardado. ¿Lo sobrescribís con la versión actual?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowOverwrite(false)} style={{ padding: '8px 16px', fontSize: 12, border: '1px solid var(--border)', background: 'transparent', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>Cancelar</button>
              <button onClick={confirmOverwrite} disabled={isSaving} style={{ padding: '8px 22px', fontSize: 12, border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 6, cursor: !isSaving ? 'pointer' : 'default', fontWeight: 700, opacity: !isSaving ? 1 : 0.5 }}>
                {isSaving ? 'Guardando...' : 'Sobrescribir →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Load modal ── */}
      {showLoad && (
        <div onClick={() => setShowLoad(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 600, maxHeight: '80vh', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Pallets guardados</div>
              <button onClick={() => setShowLoad(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 12 }}>Cargando...</div>
              ) : !savedList.length ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 12 }}>No tenés pallets guardados aún.</div>
              ) : (
                savedList.map(s => {
                  const cfg = STATUS_CONFIG[normalizeJobStatus(s.status)] || STATUS_CONFIG.preparacion;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-3)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
                          {new Date(s.created_at).toLocaleDateString()} · <span style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                        </div>
                      </div>
                      <button onClick={() => loadJob(s.id)} style={{ padding: '5px 14px', fontSize: 11, borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>Cargar →</button>
                      <button onClick={() => deleteJob(s.id)} title="Borrar" style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(192,57,43,0.3)', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>×</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tracking link editor ── */}
      {showTrackingEditor && (
        <div onClick={() => setShowTrackingEditor(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 480, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Link de seguimiento</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Pegá la URL externa (transportista, courier, etc.) para tener un acceso rápido.</div>
            <input
              type="url" autoFocus value={trackingDraft}
              onChange={e => setTrackingDraft(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: '10px 12px', fontSize: 12, border: '1px solid var(--border-2)', borderRadius: 6, background: 'var(--bg-3)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: "'DM Mono', monospace" }}
            />
            {currentJobTracking && (
              <a href={currentJobTracking} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: 'var(--accent)', textDecoration: 'underline' }}>
                Abrir link actual ↗
              </a>
            )}
            {currentJobId && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>LINK PÚBLICO INTERNO</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPalletShareUrl(currentJobId)}</div>
                </div>
                <button onClick={copyShareLink} style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)' }}>Copiar</button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowTrackingEditor(false)} style={{ padding: '8px 16px', fontSize: 12, border: '1px solid var(--border)', background: 'transparent', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>Cancelar</button>
              <button onClick={saveTracking} style={{ padding: '8px 22px', fontSize: 12, border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
