import { useState, useCallback, useEffect, useRef } from 'react';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { CONTAINER_TYPES, PALLET_SIZES, ZONE_COLORS_HEX, ZONE_LABELS, WEIGHT_LIMITS, COLORS } from '../../lib/constants.js';
import { fmt } from '../../lib/formatters.js';
import { runPacking, runPackingCached, invalidatePackingCache, setContainerDimensions, setPackingPhysicalConstraints } from '../../lib/packing.js';
import ThreeCanvas from './ThreeCanvas.jsx';
import ThreeErrorBoundary from './ThreeErrorBoundary.jsx';
import { _sb } from '../../lib/supabase.js';
import { exportShipmentPDF } from '../../lib/exportPDF.js';
import '../../../css/redesign/ContainerLoader.css';

const STATUS_CONFIG = {
  preparacion:            { label: 'En preparación',              color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  en_transito_puerto:     { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto_partida:      { label: 'En puerto de partida',        color: '#8C6B3C', bg: '#FBF3E6', icon: '⚓' },
  embarcado:              { label: 'Embarcado',                   color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto_destino:      { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
  en_transito_destino:    { label: 'En tránsito a destino final', color: '#4D7C8A', bg: '#EDF6F8', icon: '🚚' },
  entregado:              { label: 'Entregado',                   color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
  en_transito:            { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto:              { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
};

const STATUS_ORDER = [
  'preparacion',
  'en_transito_puerto',
  'en_puerto_partida',
  'embarcado',
  'en_puerto_destino',
  'en_transito_destino',
  'entregado',
];

const SHIPMENT_SHARE_ORIGIN = 'https://fleetloader.vercel.app';

function getShipmentShareUrl(id) {
  return `${SHIPMENT_SHARE_ORIGIN}/share/${id}`;
}

function normalizeShipmentStatus(status) {
  if (status === 'en_transito') return 'en_transito_puerto';
  if (status === 'en_puerto') return 'en_puerto_destino';
  return STATUS_CONFIG[status] ? status : 'preparacion';
}

async function copyShareUrl(url) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // iOS webviews can expose clipboard but reject it; try the legacy path below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function StatsStrip({ totalVol, ct, pctVol, totalUnits, activeZoneCount, totalWeight, weightOver, weightLimit, totalValue }) {
  const freeVol = Math.max(0, ct.vol - totalVol);
  const weightPct = (totalWeight / weightLimit) * 100 || 0;

  return (
    <div className="stats-strip">
      <div className="stat-item stat-item-volume">
        <div className="stat-head">
          <div className="stat-label">Volumen usado</div>
          <div className="stat-chip">{freeVol.toFixed(2)} m3 libres</div>
        </div>
        <div className="stat-value">{totalVol.toFixed(2)} <span>m3</span></div>
        <div className="stat-progress">
          <span style={{ width: `${Math.min(pctVol, 100)}%` }} />
        </div>
        <div className="stat-sub">de {ct.vol.toFixed(2)} m3 del contenedor {ct.label}</div>
      </div>

      <div className="stat-item stat-item-occupancy">
        <div className="stat-head">
          <div className="stat-label">Ocupacion</div>
          <div className="stat-chip">{totalUnits} unidades</div>
        </div>
        <div className="stat-value">{pctVol.toFixed(1)}<span>%</span></div>
        <div className="stat-sub">capacidad aprovechada sobre el total disponible</div>
      </div>

      <div className="stat-item stat-item-units">
        <div className="stat-head">
          <div className="stat-label">Unidades totales</div>
          <div className="stat-chip">{activeZoneCount} zonas activas</div>
        </div>
        <div className="stat-value">{totalUnits}</div>
        <div className="stat-sub">cajas y pallets cargados en esta configuracion</div>
      </div>

      <div className={`stat-item stat-item-weight${weightOver ? ' is-alert' : ''}`}>
        <div className="stat-head">
          <div className="stat-label">Peso total</div>
          <div className={`stat-chip${weightOver ? ' is-alert' : ''}`}>{weightPct.toFixed(1)}%</div>
        </div>
        <div className="stat-value">
          {totalWeight >= 1000 ? `${(totalWeight / 1000).toFixed(2)} t` : `${totalWeight.toFixed(0)} kg`}
        </div>
        <div className="stat-progress stat-progress-weight">
          <span style={{ width: `${Math.min(weightPct, 100)}%` }} />
        </div>
        <div className="stat-sub" style={{ color: weightOver ? 'var(--danger)' : '' }}>
          {weightOver ? `supera el limite de ${(weightLimit / 1000).toFixed(1)} t` : `limite estimado ${(weightLimit / 1000).toFixed(1)} t`}
        </div>
      </div>

      <div className="stat-item stat-item-value">
        <div className="stat-head">
          <div className="stat-label">Valor total USD</div>
          <div className="stat-chip">mercaderia</div>
        </div>
        <div className="stat-value">$ {fmt(totalValue)}</div>
        <div className="stat-sub">valor consolidado de la carga actual</div>
      </div>
    </div>
  );
}

export default function ContainerLoader() {
  const {
    loadedProducts, CONT_L, CONT_W, CONT_H, CONTAINER_VOL,
    currentContainerType, shipmentContainers, activeContainerIdx,
    priorityZones, selectedZoneSlot, semiWeightLimit,
    instanceManualPos, instanceLockedOri,
    addProduct, removeProduct, updateProductQty, clearAllProducts, reorderCargo,
    moveProductToZone, reorderProduct: reorderOneProduct,
    setContainerType, addNewContainer, switchToContainer, removeContainer, syncActiveContainer,
    setPriorityZone, clearPriorityZones, setSelectedZoneSlot,
    setInstanceManualPos, setInstanceLockedOri, setSelectedInstance, setInteractMode,
    currentShipmentId, currentShipmentName, setCurrentShipmentId, setCurrentShipmentName, resetShipmentId, loadShipmentData,
    setSemiWeightLimit, pendingProduct, setPendingProduct,
    undo, redo, canUndo, canRedo,
  } = useContainerStore();
  const { showToast } = useAppStore();

  // ── Canvas ref (for PDF screenshot capture) ──
  const canvasRef = useRef(null);

  // ── Form state ──
  const [formType,    setFormType]    = useState('box');
  const [prodNotes,   setProdNotes]   = useState('');
  const [prodName,    setProdName]    = useState('');
  const [qty,         setQty]         = useState('');
  const [price,       setPrice]       = useState('');
  const [weight,      setWeight]      = useState('');
  const [boxL,        setBoxL]        = useState('');
  const [boxW,        setBoxW]        = useState('');
  const [boxH,        setBoxH]        = useState('');
  const [palletType,  setPalletType]  = useState('eua');
  const [palletHeight, setPalletHeight] = useState(120);
  const [formError,   setFormError]   = useState('');

  // ── Inspector state ──
  const [inspector,   setInspector]   = useState(null); // { instanceId, label, unitIdx, type, dims, weight }
  const [interactMode, setInteractModeLocal] = useState('move');
  const [nudgeStep,   setNudgeStep]   = useState(10);

  // ── Shipments modal state ──
  const [showShipments, setShowShipments] = useState(false);
  const [shipmentsList,  setShipmentsList] = useState([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [saveName,      setSaveName]    = useState('');
  const [showSave,      setShowSave]    = useState(false);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [overwriteId,   setOverwriteId]  = useState(null);
  const [overwriteName, setOverwriteName] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [shipmentsFilter, setShipmentsFilter] = useState('');
  const [showDeleteShip, setShowDeleteShip] = useState(false);
  const [deleteShipId,   setDeleteShipId]  = useState(null);
  const [isSaving,       setIsSaving]      = useState(false);
  const [openStatusId,   setOpenStatusId]  = useState(null);
  const [currentShipmentStatus, setCurrentShipmentStatus] = useState('preparacion');
  const [currentShipmentPublic, setCurrentShipmentPublic] = useState(false);
  const [sharingShipmentId, setSharingShipmentId] = useState(null);
  const [showCurrentStatusPicker, setShowCurrentStatusPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragTabIdx,    setDragTabIdx]    = useState(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState(null);
  const [showWeightMap, setShowWeightMap] = useState(false);
  const [allowAuxiliarySupport, setAllowAuxiliarySupport] = useState(false);
  const weightCanvasRef = useRef(null);

  // ── Capacity modal ──
  const [capModal, setCapModal] = useState(null); // { body, stats, product }

  // ── Derived stats ──
  const totalVol    = loadedProducts.reduce((s, p) => s + p.vol * p.qty, 0);
  const totalUnits  = loadedProducts.reduce((s, p) => s + p.qty, 0);
  const totalValue  = loadedProducts.reduce((s, p) => s + p.price * p.qty, 0);
  const totalWeight = loadedProducts.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
  const pctVol      = totalVol / CONTAINER_VOL * 100;
  const over        = pctVol > 100;
  const packingResult = runPackingCached(loadedProducts);
  const physicalWarnings = packingResult?.warnings || [];
  const supportSummary = packingResult?.supportSummary || { stable: 0, partial: 0, auxiliary: 0 };
  const ct          = CONTAINER_TYPES[currentContainerType];
  const weightLimit = currentContainerType.startsWith('semi') ? semiWeightLimit : (WEIGHT_LIMITS[currentContainerType] || 28000);
  const weightOver  = totalWeight > weightLimit;
  const isSemi      = currentContainerType.startsWith('semi');
  const canEditShipment = !currentShipmentId || currentShipmentStatus === 'preparacion';
  const filteredShipments = shipmentsList.filter(s => !shipmentsFilter || s.name.toLowerCase().includes(shipmentsFilter.toLowerCase()));
  const activeShipments = filteredShipments.filter(s => !parseShipmentPayload(s.containers).isFinalized);
  const finalizedShipments = filteredShipments.filter(s => parseShipmentPayload(s.containers).isFinalized);

  useEffect(() => {
    setPackingPhysicalConstraints({ ALLOW_AUXILIARY_SUPPORT: allowAuxiliarySupport });
  }, [allowAuxiliarySupport]);

  function getSupportVisual(status) {
    if (status === 'auxiliary') return { label: 'Requiere soporte físico adicional', color: '#B7791F', bg: '#FFF6E5' };
    if (status === 'partial') return { label: 'Apoyo parcial aceptable', color: '#8C6B3C', bg: '#FBF3E6' };
    if (status === 'invalid') return { label: 'Posición inválida', color: '#C0614A', bg: '#FDF0ED' };
    return { label: 'Carga estable', color: '#2F8F5B', bg: '#EAF7F0' };
  }

  function ensureEditable(action = 'editar este embarque') {
    if (canEditShipment) return true;
    showToast(`Solo podés ${action} cuando el embarque está en "En preparación"`, 'error');
    return false;
  }

  // ── Add product (manual) ──
  function handleAddProduct() {
    if (!ensureEditable('agregar o quitar mercadería')) return;
    setFormError('');
    if (!prodName.trim()) { setFormError('Ingresá el nombre del producto'); return; }
    const q = parseInt(qty);
    if (!q || q < 1) { setFormError('Ingresá una cantidad válida (mínimo 1)'); return; }
    if (q > 500) { setFormError('Máximo 500 unidades por producto'); return; }
    let dims;
    if (formType === 'box') {
      const L = parseFloat(boxL), W = parseFloat(boxW), H = parseFloat(boxH);
      if (!L || !W || !H || L <= 0 || W <= 0 || H <= 0) { setFormError('Ingresá dimensiones válidas (mayores a 0)'); return; }
      if (L > 1400 || W > 1400 || H > 1400) { setFormError('Dimensiones demasiado grandes (máx. 1400 cm)'); return; }
      const fits = [L,W,H].some((v,i,a) => {
        const rest = a.filter((_,j) => j !== i);
        return v <= 1200 && rest[0] <= 235 && rest[1] <= 269 || v <= 1200 && rest[1] <= 235 && rest[0] <= 269;
      });
      if (!fits) { setFormError('La caja no entra en ninguna orientación posible'); return; }
      dims = { L, W, H };
    } else {
      const sz = PALLET_SIZES[palletType];
      const pH = parseFloat(palletHeight);
      if (!pH || pH <= 0 || pH > 400) { setFormError('Altura del pallet inválida (1–400 cm)'); return; }
      dims = { L: sz.L, W: sz.W, H: pH };
    }
    const w = parseFloat(weight) || 0;
    const p2 = parseFloat(price) || 0;
    if (w < 0 || w > 50000) { setFormError('Peso inválido (0–50,000 kg)'); return; }
    if (p2 < 0) { setFormError('Precio inválido'); return; }
    checkAndAdd({ name: prodName.trim(), type: formType, dims, qty: q, price: p2, weight: w, notes: prodNotes.trim() });
    setProdName(''); setQty(''); setPrice(''); setWeight(''); setProdNotes('');
    setBoxL(''); setBoxW(''); setBoxH(''); setFormError('');
  }

  function checkAndAdd(productData) {
    const vol = (productData.dims.L * productData.dims.W * productData.dims.H) / 1e6;
    const previewId = 'preview';
    const newProd = { id: previewId, name: productData.name, type: productData.type, dims: productData.dims, qty: productData.qty, price: productData.price, weight: productData.weight || 0, vol, color: '#999', priorityZone: productData.priorityZone || null };
    const currentVol = loadedProducts.reduce((s, p) => s + p.vol * p.qty, 0);
    const addedVol = vol * productData.qty;
    const totalVol2 = currentVol + addedVol;
    const curWeight = loadedProducts.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
    const addedWt = (productData.weight || 0) * productData.qty;
    const totalWt = curWeight + addedWt;
    const volExceeds = totalVol2 > CONTAINER_VOL;
    const weightExceeds = totalWt > weightLimit;
    const testList = [...loadedProducts, newProd];
    const totalUnitsTest = testList.reduce((s, p) => s + p.qty, 0);
    if (totalUnitsTest > 800) return showToast('Demasiadas unidades — dividí en más contenedores', 'error');
    const { placed } = runPacking(testList);
    const placedQty = placed[previewId] || 0;
    const physExceeds = placedQty < productData.qty;

    if (volExceeds || physExceeds || weightExceeds) {
      const remainingVol = CONTAINER_VOL - currentVol;
      let body = '';
      if (weightExceeds && !volExceeds && !physExceeds) {
        body = `El peso total supera el límite al agregar <b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b>.`;
      } else if (placedQty === 0) {
        body = `<b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b> no tienen espacio físico en el contenedor.`;
      } else if (placedQty === productData.qty && volExceeds) {
        body = `El volumen total supera la capacidad al agregar <b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b>.`;
      } else {
        body = `Solo <b>${placedQty} de ${productData.qty}</b> unidades de "<b>${productData.name}</b>" tienen espacio físico. Las restantes <b>(${productData.qty - placedQty})</b> no caben.`;
      }
      const overVol = Math.max(0, totalVol2 - CONTAINER_VOL);
      const overWt  = Math.max(0, totalWt - weightLimit);
      const fitPct  = (remainingVol / CONTAINER_VOL * 100).toFixed(1);
      const stats = [
        ['Volumen disponible', `${remainingVol.toFixed(3)} m³ (${fitPct}%)`],
        ['Volumen del producto', `${addedVol.toFixed(3)} m³`],
        volExceeds    ? ['Exceso volumétrico', `+${overVol.toFixed(3)} m³`, true] : null,
        physExceeds   ? ['Unidades que sí caben', `${placedQty} de ${productData.qty}`, false, true] : null,
        weightExceeds ? ['Peso actual', `${(curWeight/1000).toFixed(2)} t`] : null,
        weightExceeds ? ['Peso a agregar', `${(addedWt/1000).toFixed(2)} t`] : null,
        weightExceeds ? ['Límite del contenedor', `${(weightLimit/1000).toFixed(1)} t`] : null,
        weightExceeds ? ['Exceso de peso', `+${(overWt/1000).toFixed(2)} t`, true] : null,
      ].filter(Boolean);
      // Build body as structured data (avoids dangerouslySetInnerHTML XSS)
      const typeLabel = productData.type === 'box' ? 'caja(s)' : 'pallet(s)';
      let bodyParts;
      if (weightExceeds && !volExceeds && !physExceeds) {
        bodyParts = { pre: 'El peso total supera el límite al agregar ', qty: `${productData.qty} ${typeLabel}`, mid: ' de ', name: productData.name, suf: '.' };
      } else if (placedQty === 0) {
        bodyParts = { pre: '', qty: `${productData.qty} ${typeLabel}`, mid: ' de ', name: productData.name, suf: ' no tienen espacio físico en el contenedor.' };
      } else if (placedQty === productData.qty && volExceeds) {
        bodyParts = { pre: 'El volumen total supera la capacidad al agregar ', qty: `${productData.qty} ${typeLabel}`, mid: ' de ', name: productData.name, suf: '.' };
      } else {
        bodyParts = { pre: 'Solo ', qty: `${placedQty} de ${productData.qty}`, mid: ' unidades de ', name: productData.name, suf: `. Las restantes (${productData.qty - placedQty}) no caben.` };
      }
      setCapModal({ bodyParts, stats, product: productData, fitsQty: placedQty });
      return;
    }
    addProduct(productData);
  }

  // ── Distribute overflow across containers ──
  function handleDistribute() {
    const { product, fitsQty } = capModal;
    setCapModal(null);

    const vol = (product.dims.L * product.dims.W * product.dims.H) / 1e6;
    const existingColor = loadedProducts.find(p => p.name === product.name && p.type === product.type)?.color;
    // Preservar packedItems/palletBase: un pallet importado del Pallet Builder
    // los necesita para empacarse y dibujarse como pallet armado (antes se anulaban
    // y el pallet se perdía / se trataba como caja genérica).
    const newProdBase = { ...product, vol, color: existingColor || COLORS[loadedProducts.length % COLORS.length], priorityZone: null, packedItems: product.packedItems || null, palletBase: product.palletBase || null };

    // Save current state and get all containers
    const synced = syncActiveContainer();
    let remaining = product.qty;
    let destIdx = activeContainerIdx; // a qué contenedor saltar al final (donde quedó la carga)

    // Helper: simulate packing on a container's existing products + N units of new product
    function testFit(existingProds, qty, ctype) {
      const ct = CONTAINER_TYPES[ctype] || CONTAINER_TYPES['20ft'];
      setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
      const testId = 'dist_test_' + Math.random();
      const testList = [...existingProds, { ...newProdBase, id: testId, qty }];
      invalidatePackingCache();
      const { placed } = runPacking(testList);
      const fits = placed[testId] || 0;
      invalidatePackingCache();
      return fits;
    }

    // Build new containers array: fill existing ones first, then create new
    const newContainers = synced.map((c, i) => {
      if (remaining <= 0) return c;
      if (i === activeContainerIdx) {
        // Add what fits to active container
        if (fitsQty <= 0) return c;
        const fits = Math.min(fitsQty, remaining);
        remaining -= fits;
        const existingProd = c.products.find(p => p.name === product.name && p.type === product.type);
        if (existingProd) {
          return { ...c, products: c.products.map(p => p === existingProd ? { ...p, qty: p.qty + fits } : p) };
        }
        return { ...c, products: [...c.products, { ...newProdBase, id: Date.now() + Math.random(), qty: fits }] };
      }
      // Try to fill space in other existing containers
      const ct = CONTAINER_TYPES[c.type] || CONTAINER_TYPES['20ft'];
      const usedVol = c.products.reduce((s, p) => s + p.vol * p.qty, 0);
      if (usedVol >= ct.vol * 0.98) return c; // full, skip
      const fits = testFit(c.products, remaining, c.type);
      if (fits <= 0) return c;
      const toAdd = Math.min(fits, remaining);
      remaining -= toAdd;
      destIdx = i;
      const existingProd = c.products.find(p => p.name === product.name && p.type === product.type);
      if (existingProd) {
        return { ...c, products: c.products.map(p => p === existingProd ? { ...p, qty: p.qty + toAdd } : p) };
      }
      return { ...c, products: [...c.products, { ...newProdBase, id: Date.now() + Math.random(), qty: toAdd }] };
    });

    // Create new containers for whatever's still remaining
    let created = 0;
    const activeType = synced[activeContainerIdx]?.type || currentContainerType;
    while (remaining > 0 && created < 20) {
      const ct = CONTAINER_TYPES[activeType];
      setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
      const testId = 'new_cont_test';
      invalidatePackingCache();
      const { placed } = runPacking([{ ...newProdBase, id: testId, qty: remaining }]);
      const perCont = placed[testId] || 0;
      if (perCont === 0) break;
      const toAdd = Math.min(remaining, perCont);
      newContainers.push({
        id: newContainers.length + 1,
        type: activeType,
        products: [{ ...newProdBase, id: Date.now() + Math.random(), qty: toAdd }],
        priorityZones: [null, null, null],
        instanceManualPos: {},
        instanceLockedOri: {},
      });
      remaining -= toAdd;
      destIdx = newContainers.length - 1; // saltar al contenedor nuevo donde quedó
      created++;
    }

    // Restore packing engine to active container dimensions
    const activeCt = CONTAINER_TYPES[activeType];
    setContainerDimensions(activeCt.L, activeCt.W, activeCt.H, activeCt.vol);

    // Cargar el embarque YA mostrando el contenedor destino (antes volvía al 0, lleno).
    loadShipmentData(
      { id: currentShipmentId, name: currentShipmentName, containers: newContainers },
      { activeContainerIdx: destIdx }
    );
    const label = product.type === 'pallet' ? 'pallets' : 'cajas';
    const distributed = product.qty - remaining;
    if (distributed > 0) {
      showToast(`✓ ${distributed} ${label} en ${newContainers.length} contenedor${newContainers.length > 1 ? 'es' : ''}`, 'success');
    }
    if (remaining > 0) {
      showToast(`No se pudieron ubicar ${remaining} ${label} (no entran en un contenedor)`, 'error');
    }
  }

  // ── Change type of active container + pull products from others to fill new space ──
  function handleChangeContainerType(newType) {
    const synced = syncActiveContainer();
    const ct = CONTAINER_TYPES[newType];
    if (!ct) return;

    const activeProds = synced[activeContainerIdx]?.products || [];

    // Always test with new dimensions first
    setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
    invalidatePackingCache();

    // Split active products into fitting / overflow for the new container size
    const { placed } = runPacking(activeProds);
    const fittingProds = [];
    const overflowProds = [];
    for (const p of activeProds) {
      const fits = Math.min(placed[String(p.id)] ?? 0, p.qty);
      if (fits >= p.qty) {
        fittingProds.push(p);
      } else if (fits > 0) {
        fittingProds.push({ ...p, qty: fits });
        overflowProds.push({ ...p, qty: p.qty - fits });
      } else {
        overflowProds.push(p);
      }
    }

    const otherIdxs = synced.map((_, i) => i).filter(i => i !== activeContainerIdx && synced[i].products.length > 0);

    // No overflow, no other containers — simple type change
    if (overflowProds.length === 0 && otherIdxs.length === 0) {
      setContainerType(newType);
      return;
    }

    const updatedContainers = synced.map(c => ({ ...c, products: [...c.products] }));
    let currentInActive = [...fittingProds];
    updatedContainers[activeContainerIdx] = { ...updatedContainers[activeContainerIdx], type: newType, products: currentInActive };

    // If overflow and no other containers, auto-create a new container for the overflow
    if (overflowProds.length > 0 && otherIdxs.length === 0) {
      updatedContainers.push({ id: updatedContainers.length + 1, type: newType, products: overflowProds });
      const overflowCount = overflowProds.reduce((s, p) => s + p.qty, 0);
      loadShipmentData({ id: currentShipmentId, name: currentShipmentName, containers: updatedContainers.map((c, i) => ({ ...c, id: i + 1 })) });
      showToast(`⚠️ ${overflowCount} unidades no caben en ${ct.label} — movidas a nuevo contenedor`, 'warning');
      return;
    }

    // Try to pull products from other containers into active
    for (const oi of otherIdxs) {
      const otherProds = updatedContainers[oi].products;
      if (!otherProds.length) continue;

      const testId = 'pull_test';
      for (const op of otherProds) {
        const testList = [...currentInActive, { ...op, id: testId }];
        invalidatePackingCache();
        const { placed: p2 } = runPacking(testList);
        const fits = Math.min(p2[testId] || 0, op.qty);
        if (fits <= 0) continue;

        currentInActive = [...currentInActive];
        const existingInActive = currentInActive.find(p => p.name === op.name && p.type === op.type);
        if (existingInActive) {
          currentInActive = currentInActive.map(p => p === existingInActive ? { ...p, qty: p.qty + fits } : p);
        } else {
          currentInActive = [...currentInActive, { ...op, id: Date.now() + Math.random(), qty: fits }];
        }

        const remaining = op.qty - fits;
        if (remaining <= 0) {
          updatedContainers[oi] = { ...updatedContainers[oi], products: updatedContainers[oi].products.filter(p => p !== op) };
        } else {
          updatedContainers[oi] = { ...updatedContainers[oi], products: updatedContainers[oi].products.map(p => p === op ? { ...p, qty: remaining } : p) };
        }
      }
      updatedContainers[activeContainerIdx] = { ...updatedContainers[activeContainerIdx], type: newType, products: currentInActive };
    }

    // If active had overflow, put it in a new container
    if (overflowProds.length > 0) {
      updatedContainers.push({ id: updatedContainers.length + 1, type: newType, products: overflowProds });
    }

    const finalContainers = updatedContainers.filter((c, i) => c.products.length > 0 || i === activeContainerIdx);

    setContainerDimensions(ct.L, ct.W, ct.H, ct.vol);
    loadShipmentData({ id: currentShipmentId, name: currentShipmentName, containers: finalContainers.map((c, i) => ({ ...c, id: i + 1 })) });
    showToast(`✓ Tipo cambiado a ${ct.label} — espacio optimizado`, 'success');
  }

  // ── Container tab drag-to-reorder ──
  function handleTabDrop(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const synced = syncActiveContainer();
    const reordered = [...synced];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const newActiveIdx = toIdx;
    loadShipmentData({ id: currentShipmentId, name: currentShipmentName, containers: reordered.map((c, i) => ({ ...c, id: i + 1 })) });
    // Switch to the moved container
    setTimeout(() => switchToContainer(newActiveIdx), 0);
  }

  // ── Rotation ──
  function rotateSelected(axis) {
    if (!ensureEditable('reubicar la carga')) return;
    if (!inspector) return;
    const { instanceId } = inspector;
    const productId = instanceId.split('_').slice(0, -1).join('_');
    const p = loadedProducts.find(p => String(p.id) == productId);
    if (!p) return;
    const prev = instanceLockedOri[instanceId] || null;
    let { dX, dZ, dY } = prev || { dX: p.dims.L, dZ: p.dims.W, dY: p.dims.H };
    if (p.type === 'pallet') {
      if (axis !== 'Y') { showToast('Los pallets solo rotan horizontalmente (eje Y)'); return; }
      [dX, dZ] = [dZ, dX];
    } else {
      if (axis === 'Y') [dX, dZ] = [dZ, dX];
      else if (axis === 'X') [dZ, dY] = [dY, dZ];
      else if (axis === 'Z') [dX, dY] = [dY, dX];
    }
    if (dX > CONT_L + 0.5 || dZ > CONT_W + 0.5 || dY > CONT_H + 0.5) {
      showToast(`"${p.name}" no cabe rotado (${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm)`, 'error'); return;
    }
    // Apply orientation and test if it still fits alongside other items
    setInstanceLockedOri(instanceId, { dX, dZ, dY });
    invalidatePackingCache();
    const { placed } = runPacking(loadedProducts);
    if ((placed[String(p.id)] || 0) < p.qty) {
      // Doesn't fit — revert
      setInstanceLockedOri(instanceId, prev);
      invalidatePackingCache();
      showToast(`"${p.name}" no cabe rotado — no hay espacio con la carga actual`, 'error');
      return;
    }
    const unitIdx = parseInt(instanceId.split('_').pop()) + 1;
    setInspector(prev2 => prev2 ? { ...prev2, dims: `${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm` } : prev2);
    showToast(`↻ "${p.name} #${unitIdx}" → ${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm`, 'success');
  }

  function clearRotation() {
    if (!ensureEditable('reubicar la carga')) return;
    if (!inspector) return;
    const { instanceId } = inspector;
    setInstanceLockedOri(instanceId, null);
    setInstanceManualPos(instanceId, null);
    showToast(`"${inspector.label} #${inspector.unitIdx}" orientación automática`);
  }

  function nudgeSelected(dx, dz) {
    if (!ensureEditable('mover la carga')) return;
    if (!inspector) return;
    const { instanceId } = inspector;
    const state = useContainerStore.getState();
    const { packed } = runPackingCached(state.loadedProducts);
    const item = packed.find(i => i.instanceId === instanceId);
    if (!item) return;
    const cur = instanceManualPos[instanceId] || { x: item.x, z: item.z };
    let nx = Math.max(0, Math.min(state.CONT_L - item.dX, cur.x + dx * nudgeStep));
    let nz = Math.max(0, Math.min(state.CONT_W - item.dZ, cur.z + dz * nudgeStep));
    nx = Math.round(nx / 5) * 5;
    nz = Math.round(nz / 5) * 5;
    setInstanceManualPos(instanceId, { x: nx, z: nz });
    showToast(`↔ ${item.name} #${parseInt(instanceId.split('_').pop())+1} → X${Math.round(nx)} Z${Math.round(nz)} cm`);
  }

  function removeSelectedProduct() {
    if (!ensureEditable('agregar o quitar mercadería')) return;
    if (!inspector) return;
    const { instanceId } = inspector;
    const productId = instanceId.split('_').slice(0, -1).join('_');
    const p = loadedProducts.find(p => String(p.id) == productId);
    if (!p) return;
    if (p.qty > 1) {
      updateProductQty(p.id, p.qty - 1);
      showToast(`🗑 "${p.name}" #${parseInt(instanceId.split('_').pop())+1} eliminado (quedan ${p.qty-1})`);
    } else {
      removeProduct(p.id);
      showToast(`🗑 "${p.name}" eliminado`);
    }
    setInspector(null);
  }

  function duplicateSelectedProduct() {
    if (!ensureEditable('agregar o quitar mercadería')) return;
    if (!inspector) return;
    const productId = inspector.instanceId.split('_').slice(0, -1).join('_');
    const p = loadedProducts.find(p => String(p.id) == productId);
    if (!p) return;
    updateProductQty(p.id, p.qty + 1);
    showToast(`⧉ "${p.name}" duplicado (${p.qty+1} unidades)`, 'success');
  }

  // ── Export CSV ──
  function handleExportCSV() {
    const all = syncActiveContainer();
    const rows = [['Contenedor','Tipo contenedor','Producto','Tipo','L (cm)','W (cm)','H (cm)','Cant.','Volumen (m³)','Peso/u (kg)','Peso total (kg)','Precio/u (USD)','Subtotal (USD)','Notas']];
    all.forEach((c, ci) => {
      const ctype = CONTAINER_TYPES[c.type]?.fullLabel || c.type;
      (c.products || []).forEach(p => {
        rows.push([ci+1, ctype, p.name, p.type==='pallet'?'Pallet':'Caja', p.dims.L, p.dims.W, p.dims.H, p.qty, (p.vol*p.qty).toFixed(3), p.weight||0, ((p.weight||0)*p.qty).toFixed(1), p.price||0, ((p.price||0)*p.qty).toFixed(2), p.notes||'']);
      });
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${currentShipmentName || 'embarque'}.csv`; a.click();
  }

  function parseShipmentPayload(raw) {
    if (Array.isArray(raw)) return { items: raw, notes: '', isFinalized: false, finalizedAt: null };
    return {
      items: raw?.items || [],
      notes: raw?.notes || '',
      isFinalized: Boolean(raw?.isFinalized),
      finalizedAt: raw?.finalizedAt || null,
    };
  }

  function buildShipmentPayload(items, extra = {}) {
    return {
      v: 2,
      notes: shipmentNotes,
      items,
      isFinalized: false,
      finalizedAt: null,
      ...extra,
    };
  }

  // ── Shipments ──
  async function handleSaveShipment() {
    if (currentShipmentId) {
      const { data } = await _sb.from('shipments').select('name').eq('id', currentShipmentId).single();
      setOverwriteId(currentShipmentId);
      setOverwriteName(data?.name || 'este embarque');
      setShowOverwrite(true);
    } else {
      setSaveName('');
      setShowSave(true);
    }
  }

  async function confirmSave() {
    if (!saveName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      let session;
      try { ({ data: { session } } = await _sb.auth.getSession()); }
      catch { showToast('Error de conexión', 'error'); return; }
      if (!session) { showToast('Necesitás estar logueado', 'error'); return; }
      const containers = syncActiveContainer();
      const { data: existing } = await _sb.from('shipments').select('id,name').eq('user_id', session.user.id).ilike('name', saveName.trim());
      if (existing?.length) {
        setOverwriteId(existing[0].id); setOverwriteName(saveName.trim());
        setShowSave(false); setShowOverwrite(true); return;
      }
      const payload = buildShipmentPayload(containers);
      const { data: inserted, error } = await _sb.from('shipments').insert({ user_id: session.user.id, name: saveName.trim(), containers: payload, status: currentShipmentStatus, is_public: false }).select('id').single();
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
      loadShipmentData({ id: inserted.id, name: saveName.trim(), containers }, { activeContainerIdx });
      setCurrentShipmentStatus(normalizeShipmentStatus(currentShipmentStatus));
      setCurrentShipmentPublic(false);
      setShowSave(false);
      showToast(`Embarque guardado: "${saveName.trim()}"`, 'success');
    } finally { setIsSaving(false); }
  }

  async function confirmOverwrite() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let session;
      try { ({ data: { session } } = await _sb.auth.getSession()); }
      catch { showToast('Error de conexión', 'error'); return; }
      const containers = syncActiveContainer();
      const { data: existingShipment } = await _sb.from('shipments').select('containers').eq('id', overwriteId).single();
      const meta = parseShipmentPayload(existingShipment?.containers);
      const payload = buildShipmentPayload(containers, { isFinalized: meta.isFinalized, finalizedAt: meta.finalizedAt });
      const { error } = await _sb.from('shipments').update({ name: overwriteName, containers: payload, status: currentShipmentStatus }).eq('id', overwriteId);
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
      loadShipmentData({ id: overwriteId, name: overwriteName, containers }, { activeContainerIdx });
      setCurrentShipmentPublic(Boolean(currentShipmentPublic));
      setShowOverwrite(false);
      showToast(`Embarque actualizado: "${overwriteName}"`, 'success');
    } finally { setIsSaving(false); }
  }

  async function handleLoadShipments() {
    setShipmentsLoading(true);
    let session;
    try { ({ data: { session } } = await _sb.auth.getSession()); }
    catch { setShipmentsLoading(false); return showToast('Error de conexión', 'error'); }
    const { data, error } = await _sb.from('shipments').select('id,name,created_at,containers,status,is_public').order('created_at', { ascending: false }).limit(20);
    setShipmentsLoading(false);
    if (error) return showToast('Error al cargar embarques: ' + error.message, 'error');
    setShipmentsList(data || []);
    setShowShipments(true);
  }

  async function loadShipment(id) {
    const { data, error } = await _sb.from('shipments').select('*').eq('id', id).single();
    if (error || !data) return showToast('Error al cargar embarque', 'error');
    // Support notes stored in containers JSONB wrapper {v:2, notes, items}
    const raw = data.containers;
    if (!Array.isArray(raw) && raw?.v === 2) {
      const parsed = parseShipmentPayload(raw);
      setShipmentNotes(parsed.notes || '');
      loadShipmentData({ ...data, containers: parsed.items });
    } else {
      setShipmentNotes('');
      loadShipmentData(data);
    }
    setCurrentShipmentStatus(normalizeShipmentStatus(data.status));
    setCurrentShipmentPublic(Boolean(data.is_public));
    setShowShipments(false);
    showToast(`✓ Embarque "${data.name}" cargado`, 'success');
  }

  async function updateShipmentStatus(id, status) {
    if (!id) {
      setCurrentShipmentStatus(normalizeShipmentStatus(status));
      return;
    }
    await _sb.from('shipments').update({ status }).eq('id', id);
    setShipmentsList(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    if (String(id) === String(currentShipmentId)) setCurrentShipmentStatus(normalizeShipmentStatus(status));
  }

  async function finalizeShipment(id) {
    let target = shipmentsList.find(s => String(s.id) === String(id));
    if (!target) {
      const { data, error } = await _sb.from('shipments').select('id,containers').eq('id', id).single();
      if (error || !data) return showToast('No pude encontrar ese embarque para finalizarlo', 'error');
      target = data;
    }
    if (!target) return;
    const parsed = parseShipmentPayload(target.containers);
    const payload = {
      ...buildShipmentPayload(parsed.items, {
        notes: parsed.notes,
        isFinalized: true,
        finalizedAt: new Date().toISOString(),
      }),
      notes: parsed.notes,
    };
    const { error } = await _sb.from('shipments').update({ containers: payload }).eq('id', id);
    if (error) return showToast('Error al finalizar embarque: ' + error.message, 'error');
    setShipmentsList(prev => prev.map(s => String(s.id) === String(id)
      ? { ...s, containers: payload }
      : s));
    showToast('Embarque movido a finalizados', 'success');
  }

  // ── Export CSV from stored shipment data (without loading) ──
  function handleExportShipmentCSV(shipment) {
    const rawC = shipment.containers;
    const conts = Array.isArray(rawC) ? rawC : (rawC?.items || []);
    const rows = [['Contenedor','Tipo contenedor','Producto','Tipo','L (cm)','W (cm)','H (cm)','Cant.','Volumen (m³)','Peso/u (kg)','Peso total (kg)','Precio/u (USD)','Subtotal (USD)','Notas']];
    conts.forEach((c, ci) => {
      const ctype = CONTAINER_TYPES[c.type]?.fullLabel || c.type;
      (c.products || []).forEach(p => {
        rows.push([ci+1, ctype, p.name, p.type==='pallet'?'Pallet':'Caja', p.dims?.L||0, p.dims?.W||0, p.dims?.H||0, p.qty, ((p.vol||0)*p.qty).toFixed(3), p.weight||0, ((p.weight||0)*p.qty).toFixed(1), p.price||0, ((p.price||0)*p.qty).toFixed(2), p.notes||'']);
      });
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${shipment.name || 'embarque'}.csv`; a.click();
  }

  function syncShipmentPublicState(id, is_public) {
    setShipmentsList(prev => prev.map(s => String(s.id) === String(id) ? { ...s, is_public } : s));
    if (String(id) === String(currentShipmentId)) setCurrentShipmentPublic(is_public);
  }

  async function shareShipmentLink(shipment) {
    const url = getShipmentShareUrl(shipment.id);
    const shareData = {
      title: shipment.name ? `Embarque ${shipment.name}` : 'Embarque ImportaPro',
      text: shipment.name ? `Te comparto el embarque "${shipment.name}".` : 'Te comparto este embarque.',
      url,
    };
    const canNativeShare =
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
      }
    }

    return (await copyShareUrl(url)) ? 'copied' : 'failed';
  }

  async function handleShareShipment(shipment) {
    if (!shipment?.id || sharingShipmentId) return;

    const wasPublic = !!shipment.is_public;
    const publishPromise = wasPublic
      ? Promise.resolve({ error: null })
      : _sb
          .from('shipments')
          .update({ is_public: true })
          .eq('id', shipment.id)
          .then(({ error }) => ({ error }), error => ({ error }));

    if (!wasPublic) syncShipmentPublicState(shipment.id, true);
    setSharingShipmentId(shipment.id);

    // iOS requires the share sheet to open inside the original tap gesture.
    const shareResult = await shareShipmentLink(shipment);

    try {
      const { error } = await publishPromise;
      if (error) {
        if (!wasPublic) syncShipmentPublicState(shipment.id, false);
        showToast('No pude activar el link público: ' + error.message, 'error');
        return;
      }

      if (shareResult === 'shared') {
        showToast('Link listo para compartir', 'success');
      } else if (shareResult === 'copied') {
        showToast('Link copiado al portapapeles', 'success');
      } else if (shareResult === 'failed') {
        showToast('No pude abrir compartir. Copiá el link manualmente.', 'error');
      }
    } finally {
      setSharingShipmentId(null);
    }
  }

  async function disableShipmentPublic(id) {
    const { error } = await _sb.from('shipments').update({ is_public: false }).eq('id', id);
    if (error) return showToast('No pude desactivar el link: ' + error.message, 'error');
    syncShipmentPublicState(id, false);
    showToast('Link desactivado', 'success');
  }

  async function deleteShipment() {
    if (!deleteShipId) return;
    const { error } = await _sb.from('shipments').delete().eq('id', deleteShipId);
    if (error) return showToast('Error al eliminar: ' + error.message, 'error');
    if (String(currentShipmentId) === String(deleteShipId)) resetShipmentId();
    setShowDeleteShip(false);
    setDeleteShipId(null);
    showToast('Embarque eliminado');
    handleLoadShipments();
  }

  // ── Escape key closes any open modal ──
  useEffect(() => {
    function onEscape(e) {
      if (e.key !== 'Escape') return;
      if (showCurrentStatusPicker) { setShowCurrentStatusPicker(false); return; }
      if (capModal)        { setCapModal(null); return; }
      if (showSave)        { setShowSave(false); return; }
      if (showOverwrite)   { setShowOverwrite(false); return; }
      if (showShipments)   { setShowShipments(false); return; }
      if (showDeleteShip)  { setShowDeleteShip(false); return; }
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCurrentStatusPicker, capModal, showSave, showOverwrite, showShipments, showDeleteShip]);

  // ── Handle pallet exported from PalletBuilder ──
  useEffect(() => {
    if (!pendingProduct) return;
    setPendingProduct(null);
    checkAndAdd(pendingProduct);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProduct]);

  // ── Undo / Redo keyboard shortcuts ──
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Weight heatmap drawing ──
  useEffect(() => {
    if (!showWeightMap || !weightCanvasRef.current || loadedProducts.length === 0) return;
    const canvas = weightCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const { placed } = runPackingCached(loadedProducts);
    const weightById = {};
    loadedProducts.forEach(p => { weightById[p.id] = p.weight || 0; });

    const COLS = 40, ROWS = Math.round(COLS * (CONT_W / CONT_L));
    const cellL = CONT_L / COLS, cellW = CONT_W / ROWS;
    const grid = new Float32Array(COLS * ROWS);

    for (const item of placed) {
      const wPerArea = (weightById[item.productId] || 0) / (item.dX * item.dZ || 1);
      const c0 = Math.max(0, Math.floor(item.x / cellL));
      const c1 = Math.min(COLS, Math.ceil((item.x + item.dX) / cellL));
      const r0 = Math.max(0, Math.floor(item.z / cellW));
      const r1 = Math.min(ROWS, Math.ceil((item.z + item.dZ) / cellW));
      for (let r = r0; r < r1; r++)
        for (let c = c0; c < c1; c++) {
          const overlapL = Math.min((c + 1) * cellL, item.x + item.dX) - Math.max(c * cellL, item.x);
          const overlapW = Math.min((r + 1) * cellW, item.z + item.dZ) - Math.max(r * cellW, item.z);
          grid[r * COLS + c] += wPerArea * Math.max(0, overlapL) * Math.max(0, overlapW);
        }
    }

    const maxW = Math.max(...grid, 0.001);
    const cw = canvas.width / COLS, ch = canvas.height / ROWS;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r * COLS + c] / maxW;
        const R = Math.round(255 * Math.min(1, t * 2));
        const G = Math.round(255 * Math.max(0, 1 - t * 1.5));
        ctx.fillStyle = t < 0.01 ? '#F0EBE3' : `rgb(${R},${G},40)`;
        ctx.fillRect(c * cw, r * ch, cw - 0.5, ch - 0.5);
      }
    }

    // Draw container outline
    ctx.strokeStyle = '#8D7966';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Legend: direction label
    ctx.fillStyle = '#8D7966';
    ctx.font = '10px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('← frente', 4, canvas.height - 6);
    ctx.fillText(`Max ${maxW.toFixed(1)} kg/m²`, canvas.width - 80, 14);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWeightMap, loadedProducts, CONT_L, CONT_W]);

  function renderShipmentCard(s, isFinalizedSection = false) {
    const date = new Date(s.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const parsed = parseShipmentPayload(s.containers);
    const conts = parsed.items;
    const sNotes = parsed.notes || '';
    const totalConts = conts.length || 1;
    const totalProds = conts.reduce((acc, c) => acc + (c.products?.length || 0), 0);
    const normalizedStatus = normalizeShipmentStatus(s.status);
    const st = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.preparacion;
    const isOpen = openStatusId === s.id;
    const finalizedLabel = parsed.finalizedAt
      ? new Date(parsed.finalizedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : null;

    return (
      <div key={s.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', borderLeft: `4px solid ${st.color}`, marginBottom: 10, overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'relative', opacity: isFinalizedSection ? 0.96 : 1 }}>
        <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#3d2e24', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{date}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C8B8A8', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{totalConts} cont{totalConts > 1 ? 's' : ''}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C8B8A8', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{totalProds} prod{totalProds !== 1 ? 's' : ''}</span>
              {finalizedLabel && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C8B8A8', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>Finalizado {finalizedLabel}</span>
                </>
              )}
            </div>
            {sNotes && <div style={{ marginTop: 5, fontSize: 11, color: '#8D7966', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {sNotes}</div>}
          </div>
          <button onClick={() => setOpenStatusId(isOpen ? null : s.id)} style={{ flexShrink: 0, cursor: isFinalizedSection ? 'default' : 'pointer', border: `1.5px solid ${st.color}55`, borderRadius: 20, padding: '4px 10px', background: st.bg, color: st.color, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 5 }} disabled={isFinalizedSection}>
            <span>{st.icon}</span>
            <span>{st.label}</span>
            {!isFinalizedSection && <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>}
          </button>
        </div>

        {isOpen && !isFinalizedSection && (
          <div style={{ position: 'absolute', top: 44, right: 14, zIndex: 50, background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160 }}>
            {STATUS_ORDER.map((key) => {
              const cfg = STATUS_CONFIG[key];
              return (
                <button key={key} onClick={() => { updateShipmentStatus(s.id, key); setOpenStatusId(null); }} style={{ background: normalizedStatus === key ? cfg.bg : 'transparent', border: `1.5px solid ${normalizedStatus === key ? cfg.color + '55' : 'transparent'}`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', color: cfg.color, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: '1px solid #F0EBE3', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, background: '#FAFAF8', flexWrap: 'wrap' }}>
          {!isFinalizedSection && (
            <button
              onClick={() => handleShareShipment(s)}
              disabled={sharingShipmentId === s.id}
              style={{ padding: '4px 10px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: sharingShipmentId === s.id ? 'wait' : 'pointer', border: `1px solid ${s.is_public ? '#3A8C52' : '#D8CFC6'}`, color: s.is_public ? '#3A8C52' : '#9a8778', background: s.is_public ? '#EDF7F1' : 'transparent', opacity: sharingShipmentId === s.id ? 0.7 : 1 }}
            >
              {sharingShipmentId === s.id ? '🔗 Abriendo...' : s.is_public ? '🔗 Compartir link' : '🔗 Compartir'}
            </button>
          )}
          {!isFinalizedSection && s.is_public && (
            <button onClick={() => disableShipmentPublic(s.id)} style={{ padding: '4px 10px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: 'pointer', border: '1px solid #E8D6CF', color: '#B85C5C', background: '#FFF8F6' }}>
              Desactivar link
            </button>
          )}
          <button onClick={() => handleExportShipmentCSV(s)} title="Exportar CSV" style={{ padding: '4px 10px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: 'pointer', border: '1px solid #D8CFC6', color: '#9a8778', background: 'transparent' }}>
            📊 CSV
          </button>
          <button
            onClick={async () => {
              if (String(currentShipmentId) !== String(s.id)) {
                showToast('Cargá el embarque primero para exportar PDF', 'error'); return;
              }
              const containers = syncActiveContainer();
              const views = canvasRef.current ? await canvasRef.current.captureViews() : [];
              await exportShipmentPDF({ containers, currentContainerType, views, shipmentName: currentShipmentName, shipmentId: currentShipmentId });
            }}
            title={String(currentShipmentId) === String(s.id) ? 'Exportar PDF' : 'Cargá el embarque para exportar PDF'}
            style={{ padding: '4px 10px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: 'pointer', border: `1px solid ${String(currentShipmentId) === String(s.id) ? '#D8CFC6' : '#EDE8E3'}`, color: String(currentShipmentId) === String(s.id) ? '#9a8778' : '#C8B8A8', background: 'transparent', opacity: String(currentShipmentId) === String(s.id) ? 1 : 0.5 }}>
            📄 PDF
          </button>
          {!isFinalizedSection && normalizedStatus === 'entregado' && (
            <button onClick={() => finalizeShipment(s.id)} style={{ padding: '4px 10px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(58,140,82,0.22)', color: '#3A8C52', background: '#EDF7F1' }}>
              ✓ Finalizar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => loadShipment(s.id)} style={{ padding: '4px 14px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, border: '1.5px solid #8D7966', color: '#fff', background: '#8D7966', cursor: 'pointer', fontWeight: 600 }}>Cargar →</button>
          {!isFinalizedSection && (
            <button onClick={() => { setDeleteShipId(s.id); setShowDeleteShip(true); }} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #E8E0D8', color: '#b85c5c', background: 'transparent', cursor: 'pointer', lineHeight: 1 }}>✕</button>
          )}
        </div>
      </div>
    );
  }

  const activeZoneCount = priorityZones.filter(z => z !== null).length;
  const currentStatusCfg = STATUS_CONFIG[currentShipmentStatus] || STATUS_CONFIG.preparacion;

  return (
    <div className="cl-section active" id="section-container" style={{ width: '100%', overflow: 'hidden' }}>

      {/* Stats strip */}
      <StatsStrip
        totalVol={totalVol}
        ct={ct}
        pctVol={pctVol}
        totalUnits={totalUnits}
        activeZoneCount={activeZoneCount}
        totalWeight={totalWeight}
        weightOver={weightOver}
        weightLimit={weightLimit}
        totalValue={totalValue}
      />

      {/* Topbar: "+ Añadir Cajas / Pallet" abre el form en un dropdown. La sidebar
          original queda oculta por CSS; la lista de productos vive en la tabla
          "Desglose de Carga" de más abajo (que ya permite editar cant./eliminar). */}
      <div className="cl-actionbar">
        <div className="cl-add-wrap">
          <button className="btn-primary" onClick={() => setShowAddMenu(v => !v)} disabled={!canEditShipment}
            style={{ opacity: canEditShipment ? 1 : 0.55, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>
            + Añadir Cajas / Pallet
          </button>
          {showAddMenu && (
            <>
              <div className="cl-add-overlay" onClick={() => setShowAddMenu(false)} />
              <div className="cl-add-menu">
                <div className="cl-add-menu-title">Agregar producto</div>
                <div className="form-group">
                  <label>Nombre del producto</label>
                  <input type="text" value={prodName} placeholder="Ej: Zapatillas Running" autoComplete="off" onChange={e => { setFormError(''); setProdName(e.target.value); }} />
                </div>
                <div className="form-group">
                  <label>Tipo de unidad</label>
                  <div className="type-tabs">
                    <button className={`type-tab${formType === 'box' ? ' active-box' : ''}`} onClick={() => setFormType('box')}>📦 Caja</button>
                    <button className={`type-tab${formType === 'pallet' ? ' active-pallet' : ''}`} onClick={() => setFormType('pallet')}>🟫 Pallet</button>
                  </div>
                </div>
                {formType === 'box' && (
                  <div className="form-group">
                    <label>Dimensiones de la caja (cm)</label>
                    <div className="row3">
                      <div><label style={{ fontSize: 10 }}>Largo</label><input type="number" value={boxL} placeholder="60" min="1" onChange={e => setBoxL(e.target.value)} /></div>
                      <div><label style={{ fontSize: 10 }}>Ancho</label><input type="number" value={boxW} placeholder="40" min="1" onChange={e => setBoxW(e.target.value)} /></div>
                      <div><label style={{ fontSize: 10 }}>Alto</label><input type="number" value={boxH} placeholder="30" min="1" onChange={e => setBoxH(e.target.value)} /></div>
                    </div>
                  </div>
                )}
                {formType === 'pallet' && (
                  <>
                    <div className="form-group">
                      <label>Tipo de pallet</label>
                      <select value={palletType} onChange={e => setPalletType(e.target.value)}>
                        <option value="euro">Euro Pallet — 120×80 cm</option>
                        <option value="eua">Pallet EUA — 120×100 cm</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Altura con carga (cm)</label>
                      <div className="slider-wrap">
                        <input type="range" min="30" max="220" value={palletHeight} onChange={e => setPalletHeight(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                        <span className="slider-val">{palletHeight} cm</span>
                      </div>
                    </div>
                  </>
                )}
                <div className="row2">
                  <div className="form-group">
                    <label>Cantidad</label>
                    <input type="number" value={qty} placeholder="10" min="1" onChange={e => setQty(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>USD / unidad</label>
                    <input type="number" value={price} placeholder="0.00" min="0" step="0.01" onChange={e => setPrice(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Peso por unidad (kg) <span style={{ color: 'var(--text-3)', fontSize: 9 }}>opcional</span></label>
                  <input type="number" value={weight} placeholder="0.00" min="0" step="0.1" onChange={e => setWeight(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Notas <span style={{ color: 'var(--text-3)', fontSize: 9 }}>opcional</span></label>
                  <input type="text" value={prodNotes} placeholder="Ej: frágil, este lado arriba..." onChange={e => setProdNotes(e.target.value)} />
                </div>
                {formError && (
                  <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8, padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 6, border: '1px solid var(--red)' }}>
                    ⚠ {formError}
                  </div>
                )}
                <button className="btn-primary" onClick={handleAddProduct} disabled={!canEditShipment}
                  style={{ width: '100%', opacity: canEditShipment ? 1 : 0.55, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>
                  + Agregar al contenedor
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stats-strip" style={{ display: 'none' }}>
        <div className="stat-item">
          <div className="stat-label">Volumen Usado</div>
          <div className="stat-value">{totalVol.toFixed(2)}</div>
          <div className="stat-sub">m³ de {ct.vol.toFixed(2)} disponibles</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Ocupación</div>
          <div className="stat-value">{pctVol.toFixed(1)}%</div>
          <div className="stat-sub">del contenedor {ct.label}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Unidades Totales</div>
          <div className="stat-value">{totalUnits}</div>
          <div className="stat-sub">cajas / pallets</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Peso Total</div>
          <div className="stat-value" style={{ fontSize: 24, color: weightOver ? 'var(--danger)' : '' }}>
            {totalWeight >= 1000 ? (totalWeight/1000).toFixed(2)+' t' : totalWeight.toFixed(0)}
          </div>
          <div className="stat-sub" style={{ color: weightOver ? 'var(--danger)' : '' }}>
            {weightOver ? `⚠ Supera límite ${(weightLimit/1000).toFixed(0)}.000 kg` : `kg · límite ~${(weightLimit/1000).toFixed(0)}.000 kg`}
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Valor Total USD</div>
          <div className="stat-value" style={{ fontSize: 24 }}>${fmt(totalValue)}</div>
          <div className="stat-sub">mercadería</div>
        </div>
      </div>

      <div className="layout">
        {/* ── Left sidebar: product form + list ── */}
        <aside className="sidebar">
          <div className="sidebar-title">
            Agregar Producto
          </div>

          <div className="form-group">
            <label>Nombre del producto</label>
            <input type="text" value={prodName} placeholder="Ej: Zapatillas Running" autoComplete="off" onChange={e => { setFormError(''); setProdName(e.target.value); }} />
          </div>

          <div className="form-group">
            <label>Tipo de unidad</label>
            <div className="type-tabs">
              <button className={`type-tab${formType === 'box' ? ' active-box' : ''}`} onClick={() => setFormType('box')}>📦 Caja</button>
              <button className={`type-tab${formType === 'pallet' ? ' active-pallet' : ''}`} onClick={() => setFormType('pallet')}>🟫 Pallet</button>
            </div>
          </div>

          {formType === 'box' && (
            <div className="form-group">
              <label>Dimensiones de la caja (cm)</label>
              <div className="row3">
                <div><label style={{ fontSize: 10 }}>Largo</label><input type="number" value={boxL} placeholder="60" min="1" onChange={e => setBoxL(e.target.value)} /></div>
                <div><label style={{ fontSize: 10 }}>Ancho</label><input type="number" value={boxW} placeholder="40" min="1" onChange={e => setBoxW(e.target.value)} /></div>
                <div><label style={{ fontSize: 10 }}>Alto</label><input type="number" value={boxH}  placeholder="30" min="1" onChange={e => setBoxH(e.target.value)} /></div>
              </div>
            </div>
          )}

          {formType === 'pallet' && (
            <>
              <div className="form-group">
                <label>Tipo de pallet</label>
                <select value={palletType} onChange={e => setPalletType(e.target.value)}>
                  <option value="euro">Euro Pallet — 120×80 cm</option>
                  <option value="eua">Pallet EUA — 120×100 cm</option>
                </select>
              </div>
              <div className="form-group">
                <label>Altura con carga (cm)</label>
                <div className="slider-wrap">
                  <input type="range" min="30" max="220" value={palletHeight}
                    onChange={e => setPalletHeight(parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--c1)' }} />
                  <span className="slider-val">{palletHeight} cm</span>
                </div>
              </div>
            </>
          )}

          <div className="row2">
            <div className="form-group">
              <label>Cantidad</label>
              <input type="number" value={qty} placeholder="10" min="1" onChange={e => setQty(e.target.value)} />
            </div>
            <div className="form-group">
              <label>USD / unidad</label>
              <input type="number" value={price} placeholder="0.00" min="0" step="0.01" onChange={e => setPrice(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Peso por unidad (kg) <span style={{ color: 'var(--c2)', fontSize: 9 }}>opcional</span></label>
            <input type="number" value={weight} placeholder="0.00" min="0" step="0.1" onChange={e => setWeight(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Notas <span style={{ color: 'var(--c2)', fontSize: 9 }}>opcional</span></label>
            <input type="text" value={prodNotes} placeholder="Ej: frágil, este lado arriba..." onChange={e => setProdNotes(e.target.value)} />
          </div>

          {formError && (
            <div style={{ color: 'var(--error, #c0392b)', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", marginBottom: 8, padding: '6px 10px', background: 'rgba(192,57,43,0.08)', borderRadius: 6, border: '1px solid rgba(192,57,43,0.2)' }}>
              ⚠ {formError}
            </div>
          )}
          <button
            className="btn-primary"
            onClick={handleAddProduct}
            disabled={!canEditShipment}
            style={{ opacity: canEditShipment ? 1 : 0.55, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}
          >
            + Agregar al Contenedor
          </button>

          <hr className="divider" />

          {loadedProducts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn-secondary" onClick={() => { if (!ensureEditable('agregar o quitar mercadería')) return; clearAllProducts(); }} disabled={!canEditShipment} style={{ fontSize: 11, flex: 1, opacity: canEditShipment ? 1 : 0.45, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>× Vaciar</button>
              <button className="btn-secondary" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" style={{ fontSize: 13, padding: '5px 10px', opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>↩</button>
              <button className="btn-secondary" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" style={{ fontSize: 13, padding: '5px 10px', opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>↪</button>
            </div>
          )}

          <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Productos cargados</div>

          <div id="productList">
            {loadedProducts.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">Sin productos aún.</div></div>
            ) : loadedProducts.map(p => {
              const zoneIdx = p.priorityZoneSlot != null ? p.priorityZoneSlot : -1;
              const weightLine = p.weight > 0 ? ` · ⚖ ${(p.weight * p.qty).toFixed(1)} kg` : '';
              return (
                <div key={p.id} className="queue-item">
                  <div className="queue-dot" style={{ background: p.color }} />
                  <div className="queue-info">
                    <div className="queue-name">
                      {p.name}
                      {zoneIdx >= 0 && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: ZONE_COLORS_HEX[zoneIdx], color: '#fff', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", marginLeft: 4 }}>Z{zoneIdx+1}</span>}
                      <span className="queue-price" style={{ float: 'right' }}>${fmt(p.price * p.qty)}</span>
                    </div>
                    <div className="queue-meta">
                      {p.dims.L}×{p.dims.W}×{p.dims.H} · {p.qty}{p.type === 'box' ? 'cj' : 'plt'} · {(p.vol*p.qty).toFixed(2)}m³ · {((p.vol*p.qty)/CONTAINER_VOL*100).toFixed(1)}%{weightLine}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                    <button onClick={() => { if (!ensureEditable('agregar o quitar mercadería')) return; p.qty > 1 ? updateProductQty(p.id, p.qty - 1) : removeProduct(p.id); }} title="Reducir cantidad" disabled={!canEditShipment}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', fontSize: 12, color: 'var(--muted)', cursor: canEditShipment ? 'pointer' : 'not-allowed', lineHeight: 1, opacity: canEditShipment ? 1 : 0.45 }}>−</button>
                    <span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, minWidth: 18, textAlign: 'center', color: 'var(--text)' }}>{p.qty}</span>
                    <button onClick={() => { if (!ensureEditable('agregar o quitar mercadería')) return; updateProductQty(p.id, p.qty + 1); }} title="Aumentar cantidad" disabled={!canEditShipment}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', fontSize: 12, color: 'var(--muted)', cursor: canEditShipment ? 'pointer' : 'not-allowed', lineHeight: 1, opacity: canEditShipment ? 1 : 0.45 }}>+</button>
                    <button className="btn-remove" onClick={() => { if (!ensureEditable('agregar o quitar mercadería')) return; removeProduct(p.id); }} title="Eliminar" disabled={!canEditShipment} style={{ opacity: canEditShipment ? 1 : 0.45, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="main">
          {over && <div className="warning-bar">⚠️ La carga supera la capacidad del contenedor. Reducí las cantidades o eliminá productos.</div>}
          {physicalWarnings.length > 0 && (
            <div className="warning-bar" style={{ background: '#FDF0ED', borderColor: 'rgba(192,97,74,0.18)', color: '#8A3F2F', display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>No entra de forma segura con las restricciones actuales</div>
              {physicalWarnings.slice(0, 3).map(warning => (
                <div key={warning.instanceId} style={{ fontSize: 12, lineHeight: 1.45 }}>
                  <strong>{warning.name}</strong>: {warning.detail}. Sugerencias: {warning.suggestions.join(' · ')}
                </div>
              ))}
              {physicalWarnings.length > 3 && (
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  +{physicalWarnings.length - 3} advertencia{physicalWarnings.length - 3 === 1 ? '' : 's'} más en esta carga.
                </div>
              )}
            </div>
          )}

          <div className="section">
            <div className="section-header">
              <div className="section-title">Visualización del Contenedor {ct.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: 'var(--muted)' }}>{ct.dims}</span>
                <span style={{ padding: '4px 8px', borderRadius: 999, background: '#EAF7F0', color: '#2F8F5B', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                  Verde {supportSummary.stable}
                </span>
                {(supportSummary.partial > 0 || supportSummary.auxiliary > 0) && (
                  <span style={{ padding: '4px 8px', borderRadius: 999, background: '#FBF3E6', color: '#8C6B3C', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                    Amarillo {supportSummary.partial + supportSummary.auxiliary}
                  </span>
                )}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: 'var(--muted)' }}>
                  <input type="checkbox" checked={allowAuxiliarySupport} onChange={e => setAllowAuxiliarySupport(e.target.checked)} />
                  Permitir soporte auxiliar
                </label>
                {loadedProducts.some(p => p.weight > 0) && (
                  <button
                    onClick={() => setShowWeightMap(v => !v)}
                    style={{ padding: '3px 9px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 5, cursor: 'pointer', border: `1px solid ${showWeightMap ? 'var(--c1)' : 'var(--border)'}`, background: showWeightMap ? 'var(--c1)15' : 'transparent', color: showWeightMap ? 'var(--c1)' : 'var(--muted)' }}>
                    🌡 Peso
                  </button>
                )}
              </div>
            </div>

            {/* Container tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {shipmentContainers.map((c, i) => {
                  const contVol = c.products.reduce((s, p) => s + p.vol * p.qty, 0);
                  const ctype = CONTAINER_TYPES[c.type] || ct;
                  const cpct  = (contVol / ctype.vol * 100).toFixed(0);
                  const isActive = i === activeContainerIdx;
                  const isDragging = dragTabIdx === i;
                  const isDragOver = dragOverTabIdx === i && dragTabIdx !== i;
                  return (
                    <button key={c.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragTabIdx(i); }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTabIdx(i); }}
                      onDrop={e => { e.preventDefault(); handleTabDrop(dragTabIdx, i); setDragTabIdx(null); setDragOverTabIdx(null); }}
                      onDragEnd={() => { setDragTabIdx(null); setDragOverTabIdx(null); }}
                      onClick={() => switchToContainer(i)}
                      style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: '0.5px', borderRadius: 6, cursor: isDragging ? 'grabbing' : 'grab', border: `1.5px solid ${isDragOver ? 'var(--c1)' : isActive ? 'var(--c1)' : 'var(--border)'}`, background: isActive ? 'var(--c1)' : isDragOver ? 'var(--c1)22' : 'transparent', color: isActive ? 'var(--c5)' : 'var(--muted)', fontWeight: isActive ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4, opacity: isDragging ? 0.4 : 1, transition: 'border-color 0.15s, background 0.15s, opacity 0.15s', outline: isDragOver ? '2px solid var(--c1)' : 'none', outlineOffset: 1 }}>
                      <span style={{ opacity: 0.5, fontSize: 10, letterSpacing: 0 }}>⠿</span>
                      🚢 Cont. {c.id} <span style={{ opacity: 0.7 }}>{cpct}%</span>
                      {shipmentContainers.length > 1 && (
                        <span onClick={e => { e.stopPropagation(); if (!ensureEditable('editar este embarque')) return; if (!removeContainer(i)) showToast('No podés eliminar el único contenedor', 'error'); }} style={{ marginLeft: 3, opacity: canEditShipment ? 0.6 : 0.3, fontSize: 12, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>×</span>
                      )}
                    </button>
                  );
                })}
                <button onClick={() => { if (!ensureEditable('editar este embarque')) return; addNewContainer(); }} disabled={!canEditShipment}
                  style={{ padding: '6px 12px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, cursor: canEditShipment ? 'pointer' : 'not-allowed', border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--muted)', opacity: canEditShipment ? 1 : 0.45 }}>
                  + Nuevo contenedor
                </button>
              </div>
              <button onClick={handleSaveShipment}
                style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--c1)', color: 'var(--c1)', background: 'transparent', whiteSpace: 'nowrap' }}>
                💾 Guardar embarque
              </button>
              <button onClick={handleLoadShipments}
                style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent', whiteSpace: 'nowrap' }}>
                📂 Mis embarques
              </button>
                {(currentShipmentId || loadedProducts.length > 0) && (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowCurrentStatusPicker(v => !v)}
                    title={currentStatusCfg.label}
                    style={{ padding: '6px 12px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: '0.4px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${currentStatusCfg.color}55`, background: currentStatusCfg.bg, color: currentStatusCfg.color, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <span>{currentStatusCfg.icon}</span>
                    <span>{currentStatusCfg.label}</span>
                    <span style={{ fontSize: 8, opacity: 0.6 }}>â–¾</span>
                  </button>
                  {showCurrentStatusPicker && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 400, background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', boxShadow: '0 4px 16px rgba(0,0,0,0.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 190 }}>
                      {STATUS_ORDER.map((key) => {
                        const cfg = STATUS_CONFIG[key];
                        return (
                          <button key={key}
                            onClick={() => { updateShipmentStatus(currentShipmentId, key); setShowCurrentStatusPicker(false); }}
                            style={{ background: currentShipmentStatus === key ? cfg.bg : 'transparent', border: `1.5px solid ${currentShipmentStatus === key ? cfg.color + '55' : 'transparent'}`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', color: cfg.color, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}
                {currentShipmentId && (
                  <button
                    onClick={() => handleShareShipment({ id: currentShipmentId, name: currentShipmentName, is_public: currentShipmentPublic })}
                    disabled={sharingShipmentId === currentShipmentId}
                    title={currentShipmentPublic ? 'Compartir link del embarque' : 'Activar y compartir link'}
                    style={{
                      padding: '6px 12px',
                      fontSize: 10,
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                      letterSpacing: '0.4px',
                      borderRadius: 8,
                      cursor: sharingShipmentId === currentShipmentId ? 'wait' : 'pointer',
                      border: `1px solid ${currentShipmentPublic ? '#3A8C52' : 'var(--border)'}`,
                      color: currentShipmentPublic ? '#3A8C52' : 'var(--muted)',
                      background: currentShipmentPublic ? '#EDF7F1' : 'transparent',
                      opacity: sharingShipmentId === currentShipmentId ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 11 }}>{currentShipmentPublic ? '🔗' : '⛓'}</span>
                    <span>{sharingShipmentId === currentShipmentId ? 'Abriendo...' : currentShipmentPublic ? 'Compartir link' : 'Activar link'}</span>
                  </button>
                )}
                {currentShipmentId && currentShipmentPublic && (
                  <button
                    onClick={() => disableShipmentPublic(currentShipmentId)}
                    title="Desactivar link público"
                    style={{
                      padding: '6px 10px',
                      fontSize: 10,
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                      letterSpacing: '0.4px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: '1px solid #E8D6CF',
                      color: '#B85C5C',
                      background: '#FFF8F6',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Desactivar link
                  </button>
                )}
                <button
                  onClick={async () => {
                    const containers = syncActiveContainer();
                  const views = canvasRef.current ? await canvasRef.current.captureViews() : [];
                  await exportShipmentPDF({ containers, currentContainerType, views, shipmentName: currentShipmentName, shipmentId: currentShipmentId });
                  }}
                  disabled={loadedProducts.length === 0}
                  title="Exportar PDF"
                  style={{ padding: '6px 11px', fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: '0.4px', borderRadius: 8, cursor: loadedProducts.length === 0 ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', color: loadedProducts.length === 0 ? 'var(--muted)' : 'var(--text)', background: 'transparent', opacity: loadedProducts.length === 0 ? 0.45 : 1, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11 }}>🧾</span>
                  <span>PDF</span>
                </button>
            </div>

            {/* Shipment notes inline + status button */}
            {(currentShipmentId || loadedProducts.length > 0) && (() => {
              const st = STATUS_CONFIG[currentShipmentStatus] || STATUS_CONFIG.preparacion;
              return (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8 }}>
                  <textarea
                    value={shipmentNotes}
                    onChange={e => setShipmentNotes(e.target.value)}
                    placeholder="📝 Notas del embarque..."
                    rows={1}
                    style={{ flex: 1, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 7, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 12, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, opacity: 0.85 }}
                  />
                  <div style={{ display: 'none' }}>
                    <button
                      onClick={() => setShowCurrentStatusPicker(v => !v)}
                      title={st.label}
                      style={{ padding: '5px 8px', fontSize: 14, borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${st.color}55`, background: st.bg, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{st.icon}</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
                    </button>
                    {showCurrentStatusPicker && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 400, background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', boxShadow: '0 4px 16px rgba(0,0,0,0.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 170 }}>
                        {STATUS_ORDER.map((key) => {
                          const cfg = STATUS_CONFIG[key];
                          return (
                            <button key={key}
                              onClick={() => { updateShipmentStatus(currentShipmentId, key); setShowCurrentStatusPicker(false); }}
                              style={{ background: currentShipmentStatus === key ? cfg.bg : 'transparent', border: `1.5px solid ${currentShipmentStatus === key ? cfg.color + '55' : 'transparent'}`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', color: cfg.color, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span>{cfg.icon}</span><span>{cfg.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {currentShipmentId && currentShipmentStatus === 'entregado' && (
                    <button
                      onClick={() => finalizeShipment(currentShipmentId)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(58,140,82,0.28)', background: 'rgba(58,140,82,0.08)', color: '#3A8C52', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ✓ Finalizar embarque
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Container type selector */}
            <div className="container-selector">
              <span className="container-selector-label">Contenedor</span>
              {[
                ['20ft',    '📦', "20' Dry",      '5.9×2.35×2.39m'],
                ['40ft',    '📦', "40' Dry",      '12.0×2.35×2.39m'],
                ['40hc',    '📦', "40' HC",       '12.0×2.35×2.69m'],
                ['semi145', '🚛', 'Semi 14.5m',   '14.5×2.44×2.70m'],
                ['semi155', '🚛', 'Semi 15.5m',   '15.5×2.44×2.70m'],
              ].map(([type, icon, label, dims]) => (
                <button key={type} className={`cont-type-btn${currentContainerType === type ? ' active' : ''}`}
                  onClick={() => { if (!ensureEditable('editar este embarque')) return; handleChangeContainerType(type); }}
                  disabled={!canEditShipment}
                  style={{ opacity: canEditShipment ? 1 : 0.5, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>
                  <span>{icon}</span>{label}<br/><small style={{ fontSize: 9, opacity: 0.7 }}>{dims}</small>
                </button>
              ))}
            </div>

            <button className="reorder-btn" onClick={() => { if (!ensureEditable('reordenar la carga')) return; reorderCargo(); }} disabled={!canEditShipment} style={{ opacity: canEditShipment ? 1 : 0.5, cursor: canEditShipment ? 'pointer' : 'not-allowed' }}>
              <span className="spin">⟳</span> Reordenar Carga Optimizada
            </button>

            {!canEditShipment && (
              <div style={{ marginTop: 10, marginBottom: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(122,92,138,0.2)', background: 'linear-gradient(135deg, rgba(243,238,248,0.95), rgba(248,244,238,0.96))', color: '#6C587C', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>🔒</span>
                <div>
                  <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, letterSpacing: 1.2 }}>MODO VISUAL</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45 }}>Este embarque solo se puede editar cuando vuelve a <b>En preparación</b>.</div>
                </div>
              </div>
            )}

            {/* Volume progress */}
            <div className="progress-row">
              <span className="progress-label">Volumen</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.min(pctVol, 100)}%`, background: over ? 'linear-gradient(90deg,var(--c3),var(--danger))' : 'linear-gradient(90deg,var(--c3),var(--c1))' }} />
              </div>
              <span className="progress-pct" style={{ color: over ? 'var(--danger)' : 'var(--c1)' }}>{pctVol.toFixed(1)}%</span>
            </div>

            {/* Weight progress */}
            {totalWeight > 0 && (
              <div className="progress-row">
                <span className="progress-label">Peso</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${Math.min(totalWeight / weightLimit * 100, 100)}%`, background: weightOver ? 'linear-gradient(90deg,#d8a8a8,var(--danger))' : 'linear-gradient(90deg,#b8c8d8,#6b8c9b)' }} />
                </div>
                <span className="progress-pct" style={{ color: weightOver ? 'var(--danger)' : 'var(--text2)', fontSize: 11 }}>
                  {totalWeight >= 1000 ? (totalWeight/1000).toFixed(2)+'t' : totalWeight.toFixed(0)+' kg'}
                </span>
              </div>
            )}

            {/* Semi panel */}
            {isSemi && (
              <div style={{ display: 'none', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Límite peso</span>
                    <input type="number" min="1000" max="60000" step="500" value={semiWeightLimit}
                      onChange={e => setSemiWeightLimit(e.target.value)}
                      style={{ width: 90, padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 5, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 12, background: 'var(--c5)', color: 'var(--text)', textAlign: 'right' }} />
                    <span style={{ color: 'var(--muted)' }}>kg</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3D canvas wrapper */}
            <div className="canvas-wrap" id="canvasWrap" style={{ position: 'relative', overflow: 'visible', borderRadius: 6 }}>
              <ThreeErrorBoundary>
                <ThreeCanvas
                  ref={canvasRef}
                  readOnly={!canEditShipment}
                  suppressTooltip={Boolean(inspector)}
                  onSelectInstance={info => {
                    setInspector(info);
                    if (info) setSelectedInstance(info.instanceId);
                    else setSelectedInstance(null);
                  }}
                  onSetZone={(slot, pos) => setPriorityZone(slot, pos)}
                  onClearZone={slot => setPriorityZone(slot, null)}
                />
              </ThreeErrorBoundary>

              {/* Inspector panel */}
              {inspector && (
                <div className="cl-inspector-panel" style={{ position: 'absolute', right: 14, top: 14, zIndex: 60, width: 'min(272px, calc(100% - 28px))', maxHeight: 'calc(100% - 28px)', background: 'linear-gradient(180deg, rgba(251,247,241,0.98), rgba(243,236,227,0.98))', border: '1px solid rgba(141,121,102,0.22)', borderRadius: 18, boxShadow: '0 20px 44px rgba(97,78,60,0.18)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", backdropFilter: 'blur(14px)', overflowX: 'hidden', overflowY: 'auto' }}>
                  <div style={{ padding: '14px 14px 12px', background: 'linear-gradient(135deg, var(--c1), #a48f7d)', color: 'var(--c5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(248,241,233,0.16)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>
                        {inspector.type === 'pallet' ? '🟫' : '📦'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inspector.label}</div>
                        <div style={{ fontSize: 9, color: 'rgba(248,241,233,0.78)', letterSpacing: 0.8 }}>UNIDAD #{inspector.unitIdx}</div>
                      </div>
                    </div>
                    <button onClick={() => { setInspector(null); setSelectedInstance(null); }} style={{ width: 28, height: 28, borderRadius: 9, border: '1px solid rgba(248,241,233,0.18)', background: 'rgba(248,241,233,0.12)', color: 'var(--c5)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>×</button>
                  </div>

                  <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>MEDIDAS</div>
                        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{inspector.dims}</div>
                      </div>
                      <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>PESO</div>
                        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{inspector.weight > 0 ? `${inspector.weight} kg` : '—'}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 12, background: getSupportVisual(inspector.supportStatus).bg, border: `1px solid ${getSupportVisual(inspector.supportStatus).color}22` }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, marginBottom: 4 }}>ESTABILIDAD</div>
                      <div style={{ fontSize: 11, color: getSupportVisual(inspector.supportStatus).color, fontWeight: 700 }}>
                        {getSupportVisual(inspector.supportStatus).label}
                        {typeof inspector.supportPercent === 'number' ? ` · ${Math.round(inspector.supportPercent * 100)}% apoyo` : ''}
                      </div>
                      {inspector.supportReason && (
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 5, lineHeight: 1.45 }}>
                          {inspector.supportReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 9 }}>ORIENTACIÓN Y POSICIÓN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      <button onClick={() => rotateSelected('Y')} disabled={!canEditShipment}
                        style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text)', cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45 }}>
                        Giro horizontal
                      </button>
                      <button onClick={() => rotateSelected('X')} disabled={!canEditShipment || inspector.type === 'pallet'}
                        style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text)', cursor: canEditShipment && inspector.type !== 'pallet' ? 'pointer' : 'not-allowed', opacity: canEditShipment && inspector.type !== 'pallet' ? 1 : 0.38 }}>
                        Frente / base
                      </button>
                      <button onClick={() => rotateSelected('Z')} disabled={!canEditShipment || inspector.type === 'pallet'}
                        style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text)', cursor: canEditShipment && inspector.type !== 'pallet' ? 'pointer' : 'not-allowed', opacity: canEditShipment && inspector.type !== 'pallet' ? 1 : 0.38 }}>
                        Cambio lateral
                      </button>
                      <button onClick={clearRotation} disabled={!canEditShipment}
                        style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'transparent', color: 'var(--text2)', cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45 }}>
                        Restaurar
                      </button>
                    </div>
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: canEditShipment ? 'rgba(141,121,102,0.08)' : 'rgba(122,92,138,0.08)', color: canEditShipment ? 'var(--muted)' : '#6C587C', fontSize: 10, lineHeight: 1.45 }}>
                      {canEditShipment ? 'Podés arrastrar directamente la unidad en la escena 3D para reubicarla.' : 'El embarque está fuera de preparación, así que esta unidad quedó en modo visual.'}
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={removeSelectedProduct} disabled={!canEditShipment} style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(184,92,92,0.26)', background: 'rgba(184,92,92,0.06)', color: 'var(--danger)', cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45 }}>Eliminar unidad</button>
                    <button onClick={duplicateSelectedProduct} disabled={!canEditShipment} style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text2)', cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45 }}>Duplicar unidad</button>
                  </div>
                </div>
              )}

              {/* Zone buttons */}
              <div className="cl-zone-controls" style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ZONA:</span>
                {[0, 1, 2].map(i => {
                  const isSet = priorityZones[i] !== null;
                  const isSel = selectedZoneSlot === i;
                  return (
                    <button key={i} onClick={() => { if (!canEditShipment) return; setSelectedZoneSlot(i); }}
                      style={{ padding: '3px 9px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 4, cursor: canEditShipment ? 'pointer' : 'not-allowed', border: `1.5px solid ${ZONE_COLORS_HEX[i]}`, color: isSet ? '#fff' : ZONE_COLORS_HEX[i], background: isSet ? ZONE_COLORS_HEX[i] : 'transparent', fontWeight: isSel ? 700 : 400, outline: isSel ? `2px solid ${ZONE_COLORS_HEX[i]}` : 'none', outlineOffset: 1, opacity: canEditShipment ? 1 : 0.5 }}>
                      {i+1}
                    </button>
                  );
                })}
                <button onClick={() => { if (!ensureEditable('reordenar la carga')) return; clearPriorityZones(); }}
                  style={{ padding: '3px 9px', fontSize: 9, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 4, cursor: canEditShipment ? 'pointer' : 'not-allowed', border: '1px solid var(--muted)', color: 'var(--muted)', background: 'transparent', letterSpacing: '0.5px', opacity: canEditShipment ? 1 : 0.45 }}>
                  ✕ Sin zonas
                </button>
              </div>

              {/* Active zones indicator */}
              {activeZoneCount > 0 && (
                <div className="cl-zone-indicator" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 9, color: 'var(--c1)', letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(248,241,233,0.9)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--c1)' }}>● ZONAS ACTIVAS</span>
                </div>
              )}

              {/* Hint bar */}
              <div id="hintBar" className="cl-hint-bar" style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 9, color: 'rgba(141,121,102,0.6)', letterSpacing: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                {canEditShipment ? '🖱 DRAG PARA MOVER · SCROLL ZOOM · CLIC = SELECCIONAR · DOBLE CLIC = FIJAR ZONA' : '👁 SCROLL ZOOM · CLIC = SELECCIONAR · VISTA SOLO LECTURA'}
              </div>
            </div>

            {/* Weight heatmap */}
            {showWeightMap && loadedProducts.some(p => p.weight > 0) && (
              <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>Distribución de peso — vista planta</div>
                <canvas ref={weightCanvasRef} width={600} height={Math.round(600 * (CONT_W / CONT_L))} style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }} />
                <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, background: '#F0EBE3', border: '1px solid var(--border)', borderRadius: 2 }} /> Sin peso
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, background: 'rgb(255,200,40)', borderRadius: 2 }} /> Bajo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, background: 'rgb(255,80,40)', borderRadius: 2 }} /> Alto
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="legend">
              {loadedProducts.map(p => (
                <div key={p.id} className="legend-item">
                  <div className="legend-dot" style={{ background: p.color }} />
                  <span>{p.name}</span>
                </div>
              ))}
              {loadedProducts.length > 0 && (
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: 'var(--c4)', border: '1px solid var(--border2)' }} />
                  <span>Libre</span>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown table */}
          <div className="section">
            <div className="section-header"><div className="section-title">Desglose de Carga</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Producto</th><th>Tipo</th><th>Dims (cm)</th><th>Cant.</th><th>Peso/u</th><th>Peso Total</th><th>Volumen</th><th>% Cont.</th><th>Precio/u</th><th>Subtotal</th><th>Acciones</th><th /></tr>
                </thead>
                <tbody>
                  {loadedProducts.length === 0 ? (
                    <tr><td colSpan="12"><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Agregá productos para ver el desglose</div></div></td></tr>
                  ) : (
                    <>
                      {loadedProducts.map(p => {
                        const vt = p.vol * p.qty;
                        const wt = (p.weight || 0) * p.qty;
                        const zoneIdx = p.priorityZoneSlot != null ? p.priorityZoneSlot : -1;
                        return (
                          <tr key={p.id}>
                            <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 8, verticalAlign: 'middle' }} />{p.name}</td>
                            <td>{p.type === 'box' ? 'Caja' : 'Pallet'}</td>
                            <td className="td-mono">{p.dims.L}x{p.dims.W}x{p.dims.H}</td>
                            <td className="td-mono">
                              <input type="number" min="1" max="500"
                                key={`${p.id}_${p.qty}`}
                                defaultValue={p.qty}
                                style={{ width: 54, padding: '2px 6px', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }}
                                onBlur={e => { const v = Math.max(1, Math.min(500, parseInt(e.target.value) || 1)); updateProductQty(p.id, v); }}
                                onKeyDown={e => { if (e.key === 'Enter') { const v = Math.max(1, Math.min(500, parseInt(e.target.value) || 1)); updateProductQty(p.id, v); e.target.blur(); } }}
                              />
                            </td>
                            <td className="td-mono">{p.weight > 0 ? p.weight.toFixed(2)+' kg' : '-'}</td>
                            <td className="td-mono" style={{ color: wt > 0 ? 'var(--text)' : 'var(--muted)' }}>{wt > 0 ? wt.toFixed(1)+' kg' : '-'}</td>
                            <td className="td-mono">{vt.toFixed(3)} m3</td>
                            <td className="td-pct" style={{ color: p.color }}>{(vt/CONTAINER_VOL*100).toFixed(1)}%</td>
                            <td className="td-price">${p.price.toFixed(2)}</td>
                            <td className="td-price">${fmt(p.price * p.qty)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <button onClick={() => { if (!ensureEditable('reordenar la carga')) return; reorderOneProduct(p.id); }} disabled={!canEditShipment} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(141,121,102,0.2)', background: 'rgba(141,121,102,0.06)', color: 'var(--c1)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45, whiteSpace: 'nowrap' }}>Reordenar</button>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {[0, 1, 2].map(i => {
                                    const isActive = zoneIdx === i;
                                    return (
                                      <button key={i} onClick={() => { if (!ensureEditable('asignar zona prioritaria')) return; setSelectedZoneSlot(i); moveProductToZone(p.id); }} disabled={!canEditShipment} title={`Mover a zona ${i + 1}`} style={{ width: 30, height: 28, borderRadius: 8, border: `1px solid ${ZONE_COLORS_HEX[i]}`, background: isActive ? ZONE_COLORS_HEX[i] : `${ZONE_COLORS_HEX[i]}18`, color: isActive ? '#fff' : ZONE_COLORS_HEX[i], fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, fontWeight: 700, cursor: canEditShipment ? 'pointer' : 'not-allowed', opacity: canEditShipment ? 1 : 0.45 }}>Z{i + 1}</button>
                                    );
                                  })}
                                  <button onClick={() => { if (!ensureEditable('quitar prioridad de zona')) return; if (zoneIdx >= 0) setPriorityZone(zoneIdx, null); }} disabled={!canEditShipment || zoneIdx < 0} title="Quitar zona prioritaria" style={{ width: 34, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, cursor: canEditShipment && zoneIdx >= 0 ? 'pointer' : 'not-allowed', opacity: canEditShipment && zoneIdx >= 0 ? 1 : 0.35 }}>Sin</button>
                                </div>
                              </div>
                            </td>
                            <td><button className="btn-remove" onClick={() => removeProduct(p.id)}>X</button></td>
                          </tr>
                        );
                      })}
                      <tr className="total-row">
                        <td colSpan="4">TOTAL</td>
                        <td>—</td>
                        <td>{totalWeight > 0 ? totalWeight.toFixed(1)+' kg' : '—'}</td>
                        <td>{totalVol.toFixed(3)} m³</td>
                        <td>{pctVol.toFixed(1)}%</td>
                        <td>—</td>
                        <td>${fmt(totalValue)}</td>
                        <td />
                        <td>—</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* ── Capacity modal ── */}
      {capModal && (
        <div className="cap-overlay open" style={{ zIndex: 300 }}>
          <div className="cap-modal">
            <div className="cap-icon">⚠️</div>
            <div className="cap-title">Capacidad Excedida</div>
            <div className="cap-body">
              {capModal.bodyParts
                ? <>{capModal.bodyParts.pre}<b>{capModal.bodyParts.qty}</b>{capModal.bodyParts.mid}<b>"{capModal.bodyParts.name}"</b>{capModal.bodyParts.suf}</>
                : capModal.body}
            </div>
            <div className="cap-stats">
              {capModal.stats.map(([label, val, isDanger, isSuccess], i) => (
                <div key={i} className="cap-stat-row">
                  <span>{label}</span>
                  <span style={{ color: isDanger ? 'var(--error)' : isSuccess ? 'var(--success)' : '' }}>{val}</span>
                </div>
              ))}
            </div>
            <div className="cap-footer">
              <button className="btn-secondary" onClick={() => setCapModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px', background: 'var(--c1)' }}
                onClick={handleDistribute}>
                + Nuevo contenedor →
              </button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px', background: 'var(--danger)' }}
                onClick={() => { addProduct(capModal.product); setCapModal(null); }}>
                Agregar igual →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save shipment modal ── */}
      {showSave && (
        <div className="cap-overlay open" style={{ zIndex: 310 }}>
          <div className="cap-modal" style={{ maxWidth: 420, width: '90vw' }}>
            <div className="cap-icon">💾</div>
            <div className="cap-title">Guardar embarque</div>
            <div style={{ marginBottom: 12 }}>
              <input type="text" value={saveName} placeholder="Ej: Embarque China Abril 2026"
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmSave()} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <textarea value={shipmentNotes} onChange={e => setShipmentNotes(e.target.value)}
                placeholder="Notas del embarque (opcional)..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div className="cap-footer">
              <button className="btn-secondary" onClick={() => setShowSave(false)}>Cancelar</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px', opacity: isSaving ? 0.6 : 1 }} onClick={confirmSave} disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar →'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overwrite shipment modal ── */}
      {showOverwrite && (
        <div className="cap-overlay open" style={{ zIndex: 310 }}>
          <div className="cap-modal" style={{ maxWidth: 420, width: '90vw' }}>
            <div className="cap-icon">💾</div>
            <div className="cap-title">¿Sobreescribir embarque?</div>
            <div className="cap-body">¿Sobreescribir <b>"{overwriteName}"</b> con el estado actual?</div>
            <div className="cap-footer">
              <button className="btn-secondary" onClick={() => setShowOverwrite(false)}>Cancelar</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px', opacity: isSaving ? 0.6 : 1 }} onClick={confirmOverwrite} disabled={isSaving}>{isSaving ? 'Guardando...' : 'Sobreescribir →'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shipments list modal ── */}
      {showShipments && (
        <div className="cap-overlay open" style={{ zIndex: 200 }}>
          <div className="cap-modal" style={{ maxWidth: 560, width: '90vw', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="cap-title" style={{ margin: 0 }}>📂 Mis embarques</div>
              <button onClick={() => setShowShipments(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <input
              value={shipmentsFilter} onChange={e => setShipmentsFilter(e.target.value)}
              placeholder="Buscar por nombre..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 13, background: 'var(--bg)', color: 'var(--text)', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {shipmentsLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 13 }}>Cargando...</div>
              ) : filteredShipments.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 13 }}>No encontré embarques con ese criterio.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 8 }}>EMBARQUES ACTIVOS</div>
                    {activeShipments.length === 0 ? (
                      <div style={{ background: '#FAFAF8', border: '1px dashed #D8CFC6', borderRadius: 10, padding: 16, color: '#9a8778', fontSize: 12 }}>No hay embarques activos en esta vista.</div>
                    ) : activeShipments.map((s) => renderShipmentCard(s))}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 8 }}>EMBARQUES FINALIZADOS</div>
                    {finalizedShipments.length === 0 ? (
                      <div style={{ background: '#FAFAF8', border: '1px dashed #D8CFC6', borderRadius: 10, padding: 16, color: '#9a8778', fontSize: 12 }}>Todavía no finalizaste embarques entregados.</div>
                    ) : finalizedShipments.map((s) => renderShipmentCard(s, true))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete shipment confirm modal ── */}
      {showDeleteShip && (
        <div className="cap-overlay open" style={{ zIndex: 320 }}>
          <div className="cap-modal" style={{ maxWidth: 380, width: '90vw' }}>
            <div className="cap-icon">🗑</div>
            <div className="cap-title">Eliminar embarque</div>
            <div className="cap-body">Esta acción no se puede deshacer. El embarque será eliminado permanentemente.</div>
            <div className="cap-footer">
              <button className="btn-secondary" onClick={() => setShowDeleteShip(false)}>Cancelar</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px', background: 'var(--danger)' }} onClick={deleteShipment}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

