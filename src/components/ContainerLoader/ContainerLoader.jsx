import { useState, useCallback, useEffect, useRef } from 'react';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { CONTAINER_TYPES, PALLET_SIZES, ZONE_COLORS_HEX, ZONE_LABELS, WEIGHT_LIMITS, COLORS } from '../../lib/constants.js';
import { fmt } from '../../lib/formatters.js';
import { runPacking, runPackingCached, invalidatePackingCache, setContainerDimensions } from '../../lib/packing.js';
import ThreeCanvas from './ThreeCanvas.jsx';
import ThreeErrorBoundary from './ThreeErrorBoundary.jsx';
import { _sb } from '../../lib/supabase.js';
import { exportShipmentPDF } from '../../lib/exportPDF.js';

const STATUS_CONFIG = {
  preparacion: { label: 'En preparación', color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  en_transito: { label: 'En tránsito',    color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  embarcado:   { label: 'Embarcado',      color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto:   { label: 'En puerto',      color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
  entregado:   { label: 'Entregado',      color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
};

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
  const [palletType,  setPalletType]  = useState('euro');
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
  const [showCurrentStatusPicker, setShowCurrentStatusPicker] = useState(false);
  const [dragTabIdx,    setDragTabIdx]    = useState(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState(null);
  const [showWeightMap, setShowWeightMap] = useState(false);
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
  const ct          = CONTAINER_TYPES[currentContainerType];
  const weightLimit = currentContainerType.startsWith('semi') ? semiWeightLimit : (WEIGHT_LIMITS[currentContainerType] || 28000);
  const weightOver  = totalWeight > weightLimit;
  const isSemi      = currentContainerType.startsWith('semi');

  // ── Add product (manual) ──
  function handleAddProduct() {
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
    const newProdBase = { ...product, vol, color: existingColor || COLORS[loadedProducts.length % COLORS.length], priorityZone: null, packedItems: null, palletBase: null };

    // Save current state and get all containers
    const synced = syncActiveContainer();
    let remaining = product.qty;

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
      created++;
    }

    // Restore packing engine to active container dimensions
    const activeCt = CONTAINER_TYPES[activeType];
    setContainerDimensions(activeCt.L, activeCt.W, activeCt.H, activeCt.vol);

    loadShipmentData({ id: currentShipmentId, name: currentShipmentName, containers: newContainers });
    const label = product.type === 'pallet' ? 'pallets' : 'cajas';
    showToast(`✓ ${product.qty} ${label} distribuidas en ${newContainers.length} contenedor${newContainers.length > 1 ? 'es' : ''}`, 'success');
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
    setInstanceLockedOri(instanceId, { dX, dZ, dY });
    const unitIdx = parseInt(instanceId.split('_').pop()) + 1;
    setInspector(prev2 => prev2 ? { ...prev2, dims: `${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm` } : prev2);
    showToast(`↻ "${p.name} #${unitIdx}" → ${Math.round(dX)}×${Math.round(dZ)}×${Math.round(dY)} cm`, 'success');
  }

  function clearRotation() {
    if (!inspector) return;
    const { instanceId } = inspector;
    setInstanceLockedOri(instanceId, null);
    setInstanceManualPos(instanceId, null);
    showToast(`"${inspector.label} #${inspector.unitIdx}" orientación automática`);
  }

  function nudgeSelected(dx, dz) {
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
      const payload = { v: 2, notes: shipmentNotes, items: containers };
      const { data: inserted, error } = await _sb.from('shipments').insert({ user_id: session.user.id, name: saveName.trim(), containers: payload, status: 'preparacion' }).select('id').single();
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
      setCurrentShipmentId(inserted.id);
      setCurrentShipmentName(saveName.trim());
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
      const payload = { v: 2, notes: shipmentNotes, items: containers };
      const { error } = await _sb.from('shipments').update({ name: overwriteName, containers: payload }).eq('id', overwriteId);
      if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
      setCurrentShipmentId(overwriteId);
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
      setShipmentNotes(raw.notes || '');
      loadShipmentData({ ...data, containers: raw.items });
    } else {
      setShipmentNotes('');
      loadShipmentData(data);
    }
    setCurrentShipmentStatus(data.status || 'preparacion');
    setShowShipments(false);
    showToast(`✓ Embarque "${data.name}" cargado`, 'success');
  }

  async function updateShipmentStatus(id, status) {
    await _sb.from('shipments').update({ status }).eq('id', id);
    setShipmentsList(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    if (String(id) === String(currentShipmentId)) setCurrentShipmentStatus(status);
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

  async function toggleShipmentPublic(id, currentPublic) {
    const is_public = !currentPublic;
    await _sb.from('shipments').update({ is_public }).eq('id', id);
    setShipmentsList(prev => prev.map(s => s.id === id ? { ...s, is_public } : s));
    if (is_public) {
      const url = `https://fleetloader.vercel.app/share/${id}`;
      navigator.clipboard.writeText(url).catch(() => {});
      showToast('Link copiado al portapapeles', 'success');
    } else {
      showToast('Link desactivado', 'success');
    }
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
    ctx.font = '10px DM Mono, monospace';
    ctx.fillText('← frente', 4, canvas.height - 6);
    ctx.fillText(`Max ${maxW.toFixed(1)} kg/m²`, canvas.width - 80, 14);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWeightMap, loadedProducts, CONT_L, CONT_W]);

  const activeZoneCount = priorityZones.filter(z => z !== null).length;

  return (
    <div className="cl-section active" id="section-container" style={{ width: '100%', overflow: 'hidden' }}>

      {/* Stats strip */}
      <div className="stats-strip">
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
            <div style={{ color: 'var(--error, #c0392b)', fontSize: 11, fontFamily: "'DM Mono', monospace", marginBottom: 8, padding: '6px 10px', background: 'rgba(192,57,43,0.08)', borderRadius: 6, border: '1px solid rgba(192,57,43,0.2)' }}>
              ⚠ {formError}
            </div>
          )}
          <button className="btn-primary" onClick={handleAddProduct}>+ Agregar al Contenedor</button>

          <hr className="divider" />

          {loadedProducts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn-secondary" onClick={clearAllProducts} style={{ fontSize: 11, flex: 1 }}>× Vaciar</button>
              <button className="btn-secondary" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" style={{ fontSize: 13, padding: '5px 10px', opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>↩</button>
              <button className="btn-secondary" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" style={{ fontSize: 13, padding: '5px 10px', opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>↪</button>
            </div>
          )}

          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Productos cargados</div>

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
                      {zoneIdx >= 0 && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: ZONE_COLORS_HEX[zoneIdx], color: '#fff', fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>Z{zoneIdx+1}</span>}
                      <span className="queue-price" style={{ float: 'right' }}>${fmt(p.price * p.qty)}</span>
                    </div>
                    <div className="queue-meta">
                      {p.dims.L}×{p.dims.W}×{p.dims.H} · {p.qty}{p.type === 'box' ? 'cj' : 'plt'} · {(p.vol*p.qty).toFixed(2)}m³ · {((p.vol*p.qty)/CONTAINER_VOL*100).toFixed(1)}%{weightLine}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                    <button onClick={() => reorderOneProduct(p.id)} title="Reordenar"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 5px', fontSize: 9, color: 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>⟳</button>
                    <button onClick={() => moveProductToZone(p.id)} title="Asignar zona"
                      style={{ background: activeZoneCount > 0 ? ZONE_COLORS_HEX[selectedZoneSlot] + '22' : 'none', border: `1px solid ${activeZoneCount > 0 ? ZONE_COLORS_HEX[selectedZoneSlot] : 'var(--border)'}`, borderRadius: 3, padding: '2px 5px', fontSize: 9, color: activeZoneCount > 0 ? ZONE_COLORS_HEX[selectedZoneSlot] : 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                      {activeZoneCount > 0 ? `Z${selectedZoneSlot+1}` : 'Z'}
                    </button>
                    {/* Inline qty adjustment */}
                    <button onClick={() => p.qty > 1 ? updateProductQty(p.id, p.qty - 1) : removeProduct(p.id)} title="Reducir cantidad"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, minWidth: 18, textAlign: 'center', color: 'var(--text)' }}>{p.qty}</span>
                    <button onClick={() => updateProductQty(p.id, p.qty + 1)} title="Aumentar cantidad"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>+</button>
                    <button className="btn-remove" onClick={() => removeProduct(p.id)} title="Eliminar">×</button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="main">
          {over && <div className="warning-bar">⚠️ La carga supera la capacidad del contenedor. Reducí las cantidades o eliminá productos.</div>}

          <div className="section">
            <div className="section-header">
              <div className="section-title">Visualización del Contenedor {ct.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)' }}>{ct.dims}</span>
                {loadedProducts.some(p => p.weight > 0) && (
                  <button
                    onClick={() => setShowWeightMap(v => !v)}
                    style={{ padding: '3px 9px', fontSize: 11, fontFamily: "'DM Mono', monospace", borderRadius: 5, cursor: 'pointer', border: `1px solid ${showWeightMap ? 'var(--c1)' : 'var(--border)'}`, background: showWeightMap ? 'var(--c1)15' : 'transparent', color: showWeightMap ? 'var(--c1)' : 'var(--muted)' }}>
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
                      style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: isDragging ? 'grabbing' : 'grab', border: `1.5px solid ${isDragOver ? 'var(--c1)' : isActive ? 'var(--c1)' : 'var(--border)'}`, background: isActive ? 'var(--c1)' : isDragOver ? 'var(--c1)22' : 'transparent', color: isActive ? 'var(--c5)' : 'var(--muted)', fontWeight: isActive ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4, opacity: isDragging ? 0.4 : 1, transition: 'border-color 0.15s, background 0.15s, opacity 0.15s', outline: isDragOver ? '2px solid var(--c1)' : 'none', outlineOffset: 1 }}>
                      <span style={{ opacity: 0.5, fontSize: 10, letterSpacing: 0 }}>⠿</span>
                      🚢 Cont. {c.id} <span style={{ opacity: 0.7 }}>{cpct}%</span>
                      {shipmentContainers.length > 1 && (
                        <span onClick={e => { e.stopPropagation(); if (!removeContainer(i)) showToast('No podés eliminar el único contenedor', 'error'); }} style={{ marginLeft: 3, opacity: 0.6, fontSize: 12, cursor: 'pointer' }}>×</span>
                      )}
                    </button>
                  );
                })}
                <button onClick={addNewContainer}
                  style={{ padding: '6px 12px', fontSize: 11, fontFamily: "'DM Mono', monospace", borderRadius: 6, cursor: 'pointer', border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--muted)' }}>
                  + Nuevo contenedor
                </button>
              </div>
              <button onClick={handleSaveShipment}
                style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--c1)', color: 'var(--c1)', background: 'transparent', whiteSpace: 'nowrap' }}>
                💾 Guardar embarque
              </button>
              <button onClick={handleLoadShipments}
                style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent', whiteSpace: 'nowrap' }}>
                📂 Mis embarques
              </button>
              <button
                onClick={async () => {
                  const containers = syncActiveContainer();
                  const views = canvasRef.current ? await canvasRef.current.captureViews() : [];
                  await exportShipmentPDF({ containers, currentContainerType, views, shipmentName: currentShipmentName, shipmentId: currentShipmentId });
                }}
                disabled={loadedProducts.length === 0}
                title="Exportar PDF"
                style={{ padding: '5px 10px', fontSize: 13, borderRadius: 6, cursor: loadedProducts.length === 0 ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', color: loadedProducts.length === 0 ? 'var(--muted)' : 'var(--text)', background: 'transparent', opacity: loadedProducts.length === 0 ? 0.45 : 1, lineHeight: 1 }}>
                📄
              </button>
            </div>

            {/* Shipment notes inline + status button */}
            {currentShipmentId && (() => {
              const st = STATUS_CONFIG[currentShipmentStatus] || STATUS_CONFIG.preparacion;
              return (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8 }}>
                  <textarea
                    value={shipmentNotes}
                    onChange={e => setShipmentNotes(e.target.value)}
                    placeholder="📝 Notas del embarque..."
                    rows={1}
                    style={{ flex: 1, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 7, fontFamily: "'Jost', sans-serif", fontSize: 12, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, opacity: 0.85 }}
                  />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      onClick={() => setShowCurrentStatusPicker(v => !v)}
                      title={st.label}
                      style={{ padding: '5px 8px', fontSize: 14, borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${st.color}55`, background: st.bg, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{st.icon}</span>
                      <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
                    </button>
                    {showCurrentStatusPicker && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 400, background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', boxShadow: '0 4px 16px rgba(0,0,0,0.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 170 }}>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button key={key}
                            onClick={() => { updateShipmentStatus(currentShipmentId, key); setShowCurrentStatusPicker(false); }}
                            style={{ background: currentShipmentStatus === key ? cfg.bg : 'transparent', border: `1.5px solid ${currentShipmentStatus === key ? cfg.color + '55' : 'transparent'}`, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', color: cfg.color, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span>{cfg.icon}</span><span>{cfg.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                  onClick={() => handleChangeContainerType(type)}>
                  <span>{icon}</span>{label}<br/><small style={{ fontSize: 9, opacity: 0.7 }}>{dims}</small>
                </button>
              ))}
            </div>

            <button className="reorder-btn" onClick={reorderCargo}>
              <span className="spin">⟳</span> Reordenar Carga Optimizada
            </button>

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
              <div style={{ display: 'none', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Límite peso</span>
                    <input type="number" min="1000" max="60000" step="500" value={semiWeightLimit}
                      onChange={e => setSemiWeightLimit(e.target.value)}
                      style={{ width: 90, padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 5, fontFamily: "'DM Mono', monospace", fontSize: 12, background: 'var(--c5)', color: 'var(--text)', textAlign: 'right' }} />
                    <span style={{ color: 'var(--muted)' }}>kg</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3D canvas wrapper */}
            <div className="canvas-wrap" id="canvasWrap" style={{ position: 'relative', overflow: 'hidden', borderRadius: 6 }}>
              <ThreeErrorBoundary>
                <ThreeCanvas
                  ref={canvasRef}
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
                <div style={{ display: 'block', position: 'absolute', right: 10, top: 44, zIndex: 60, width: 210, background: 'rgba(248,241,233,0.97)', border: '1.5px solid var(--c1)', borderRadius: 10, boxShadow: '0 10px 36px rgba(141,121,102,0.32)', fontFamily: "'DM Mono', monospace", backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--c1)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{inspector.type === 'pallet' ? '🟫' : '📦'}</span>
                      <span style={{ fontSize: 10, color: 'var(--c5)', letterSpacing: '0.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inspector.label} #{inspector.unitIdx}</span>
                    </div>
                    <button onClick={() => { setInspector(null); setSelectedInstance(null); }} style={{ background: 'rgba(248,241,233,0.2)', border: 'none', color: 'var(--c5)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', borderRadius: 4 }}>×</button>
                  </div>
                  <div style={{ padding: '8px 12px 0', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    {inspector.dims}{inspector.weight > 0 ? ` · ⚖ ${inspector.weight} kg` : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '8px 12px' }}>
                    <button onClick={() => { setInteractModeLocal('move'); setInteractMode('move'); }}
                      style={{ padding: '5px 8px', fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 4, cursor: 'pointer', border: `1.5px solid ${interactMode === 'move' ? 'var(--c1)' : 'var(--border2)'}`, background: interactMode === 'move' ? 'var(--c1)' : 'transparent', color: interactMode === 'move' ? 'var(--c5)' : 'var(--text2)', fontWeight: interactMode === 'move' ? 700 : 400 }}>✥ MOVER</button>
                    <button onClick={() => { setInteractModeLocal('rotate'); setInteractMode('rotate'); }}
                      style={{ padding: '5px 8px', fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 4, cursor: 'pointer', border: `1.5px solid ${interactMode === 'rotate' ? 'var(--c1)' : 'var(--border2)'}`, background: interactMode === 'rotate' ? 'var(--c1)' : 'transparent', color: interactMode === 'rotate' ? 'var(--c5)' : 'var(--text2)', fontWeight: interactMode === 'rotate' ? 700 : 400 }}>↻ ROTAR</button>
                  </div>

                  {interactMode === 'move' ? (
                    <div style={{ padding: '0 12px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8, fontFamily: "'DM Mono', monospace", background: 'var(--surface2)', padding: '5px 8px', borderRadius: 4, border: '1px solid var(--border)', textAlign: 'center' }}>
                        X: — · Z: —
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, width: 108, margin: '0 auto 8px' }}>
                        <div /><button onClick={() => nudgeSelected(0,-1)} className="nudge-btn">▲</button><div />
                        <button onClick={() => nudgeSelected(-1,0)} className="nudge-btn">◀</button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>✥</div>
                        <button onClick={() => nudgeSelected(1,0)} className="nudge-btn">▶</button>
                        <div /><button onClick={() => nudgeSelected(0,1)} className="nudge-btn">▼</button><div />
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: 'var(--muted)' }}>PASO</span>
                        <select value={nudgeStep} onChange={e => setNudgeStep(parseInt(e.target.value))}
                          style={{ flex: 1, padding: '3px 6px', fontSize: 10, fontFamily: "'DM Mono', monospace", background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}>
                          <option value="5">5 cm</option><option value="10">10 cm</option><option value="20">20 cm</option><option value="50">50 cm</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(141,121,102,0.6)', textAlign: 'center', letterSpacing: '0.3px' }}>🖱 arrastrá para mover</div>
                    </div>
                  ) : (
                    <div style={{ padding: '0 12px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button onClick={() => rotateSelected('Y')} className="rot-action-btn">↻ Horizontal (Y)</button>
                        <button onClick={() => rotateSelected('X')} style={{ opacity: inspector.type === 'pallet' ? 0.35 : 1, pointerEvents: inspector.type === 'pallet' ? 'none' : '' }} className="rot-action-btn">↻ Frente/atrás (X)</button>
                        <button onClick={() => rotateSelected('Z')} style={{ opacity: inspector.type === 'pallet' ? 0.35 : 1, pointerEvents: inspector.type === 'pallet' ? 'none' : '' }} className="rot-action-btn">↻ Lado a lado (Z)</button>
                        <button onClick={clearRotation} style={{ padding: '5px 10px', fontSize: 9, fontFamily: "'DM Mono', monospace", border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', marginTop: 2 }}>✕ Restablecer</button>
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', gap: 6 }}>
                    <button onClick={removeSelectedProduct} style={{ flex: 1, padding: 6, fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', border: '1px solid rgba(184,92,92,0.4)', borderRadius: 4, background: 'rgba(184,92,92,0.06)', color: 'var(--danger)', cursor: 'pointer' }}>🗑 Eliminar</button>
                    <button onClick={duplicateSelectedProduct} style={{ flex: 1, padding: 6, fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}>⧉ Duplicar</button>
                  </div>
                </div>
              )}

              {/* Zone buttons */}
              <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ZONA:</span>
                {[0, 1, 2].map(i => {
                  const isSet = priorityZones[i] !== null;
                  const isSel = selectedZoneSlot === i;
                  return (
                    <button key={i} onClick={() => setSelectedZoneSlot(i)}
                      style={{ padding: '3px 9px', fontSize: 11, fontFamily: "'DM Mono', monospace", borderRadius: 4, cursor: 'pointer', border: `1.5px solid ${ZONE_COLORS_HEX[i]}`, color: isSet ? '#fff' : ZONE_COLORS_HEX[i], background: isSet ? ZONE_COLORS_HEX[i] : 'transparent', fontWeight: isSel ? 700 : 400, outline: isSel ? `2px solid ${ZONE_COLORS_HEX[i]}` : 'none', outlineOffset: 1 }}>
                      {i+1}
                    </button>
                  );
                })}
                <button onClick={() => clearPriorityZones()}
                  style={{ padding: '3px 9px', fontSize: 9, fontFamily: "'DM Mono', monospace", borderRadius: 4, cursor: 'pointer', border: '1px solid var(--muted)', color: 'var(--muted)', background: 'transparent', letterSpacing: '0.5px' }}>
                  ✕ Sin zonas
                </button>
              </div>

              {/* Active zones indicator */}
              {activeZoneCount > 0 && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--c1)', letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(248,241,233,0.9)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--c1)' }}>● ZONAS ACTIVAS</span>
                </div>
              )}

              {/* Hint bar */}
              <div id="hintBar" style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(141,121,102,0.6)', letterSpacing: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                🖱 ROTAR · SCROLL ZOOM · CLIC = SELECCIONAR · DOBLE CLIC = FIJAR ZONA
              </div>
            </div>

            {/* Weight heatmap */}
            {showWeightMap && loadedProducts.some(p => p.weight > 0) && (
              <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>Distribución de peso — vista planta</div>
                <canvas ref={weightCanvasRef} width={600} height={Math.round(600 * (CONT_W / CONT_L))} style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }} />
                <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, background: '#F0EBE3', border: '1px solid var(--border)', borderRadius: 2 }} /> Sin peso
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, background: 'rgb(255,200,40)', borderRadius: 2 }} /> Bajo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
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
                  <tr><th>Producto</th><th>Tipo</th><th>Dims (cm)</th><th>Cant.</th><th>Peso/u</th><th>Peso Total</th><th>Volumen</th><th>% Cont.</th><th>Precio/u</th><th>Subtotal</th><th /></tr>
                </thead>
                <tbody>
                  {loadedProducts.length === 0 ? (
                    <tr><td colSpan="11"><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Agregá productos para ver el desglose</div></div></td></tr>
                  ) : (
                    <>
                      {loadedProducts.map(p => {
                        const vt = p.vol * p.qty;
                        const wt = (p.weight || 0) * p.qty;
                        return (
                          <tr key={p.id}>
                            <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 8, verticalAlign: 'middle' }} />{p.name}</td>
                            <td>{p.type === 'box' ? '📦 Caja' : '🟫 Pallet'}</td>
                            <td className="td-mono">{p.dims.L}×{p.dims.W}×{p.dims.H}</td>
                            <td className="td-mono">
                              <input type="number" min="1" max="500"
                                key={`${p.id}_${p.qty}`}
                                defaultValue={p.qty}
                                style={{ width: 54, padding: '2px 6px', fontFamily: "'DM Mono', monospace", fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }}
                                onBlur={e => { const v = Math.max(1, Math.min(500, parseInt(e.target.value) || 1)); updateProductQty(p.id, v); }}
                                onKeyDown={e => { if (e.key === 'Enter') { const v = Math.max(1, Math.min(500, parseInt(e.target.value) || 1)); updateProductQty(p.id, v); e.target.blur(); } }}
                              />
                            </td>
                            <td className="td-mono">{p.weight > 0 ? p.weight.toFixed(2)+' kg' : '—'}</td>
                            <td className="td-mono" style={{ color: wt > 0 ? 'var(--text)' : 'var(--muted)' }}>{wt > 0 ? wt.toFixed(1)+' kg' : '—'}</td>
                            <td className="td-mono">{vt.toFixed(3)} m³</td>
                            <td className="td-pct" style={{ color: p.color }}>{(vt/CONTAINER_VOL*100).toFixed(1)}%</td>
                            <td className="td-price">${p.price.toFixed(2)}</td>
                            <td className="td-price">${fmt(p.price * p.qty)}</td>
                            <td><button className="btn-remove" onClick={() => removeProduct(p.id)}>×</button></td>
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
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: "'Jost', sans-serif", fontSize: 13, background: 'var(--bg)', color: 'var(--text)', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {shipmentsLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 13 }}>Cargando...</div>
              ) : shipmentsList.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 13 }}>No tenés embarques guardados aún.</div>
              ) : shipmentsList.filter(s => !shipmentsFilter || s.name.toLowerCase().includes(shipmentsFilter.toLowerCase())).map(s => {
                const date = new Date(s.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                // Support v2 containers format {v:2, notes, items}
                const rawC = s.containers;
                const conts = Array.isArray(rawC) ? rawC : (rawC?.items || []);
                const sNotes = Array.isArray(rawC) ? '' : (rawC?.notes || '');
                const totalConts = conts.length || 1;
                const totalProds = conts.reduce((acc, c) => acc + (c.products?.length || 0), 0);
                const st = STATUS_CONFIG[s.status] || STATUS_CONFIG.preparacion;
                const isOpen = openStatusId === s.id;
                return (
                  <div key={s.id} style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid #E8E0D8',
                    borderLeft: `4px solid ${st.color}`,
                    marginBottom: 10,
                    overflow: 'visible',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    position: 'relative',
                  }}>
                    {/* Top row */}
                    <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#3d2e24', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'DM Mono', monospace" }}>{date}</span>
                          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C8B8A8', flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'DM Mono', monospace" }}>{totalConts} cont{totalConts > 1 ? 's' : ''}</span>
                          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C8B8A8', flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: '#9a8778', fontFamily: "'DM Mono', monospace" }}>{totalProds} prod{totalProds !== 1 ? 's' : ''}</span>
                        </div>
                        {sNotes && <div style={{ marginTop: 5, fontSize: 11, color: '#8D7966', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {sNotes}</div>}
                      </div>
                      {/* Status badge — clickable */}
                      <button onClick={() => setOpenStatusId(isOpen ? null : s.id)} style={{
                        flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${st.color}55`,
                        borderRadius: 20, padding: '4px 10px', background: st.bg,
                        color: st.color, fontFamily: "'DM Mono', monospace", fontSize: 10,
                        fontWeight: 700, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <span>{st.icon}</span>
                        <span>{st.label}</span>
                        <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
                      </button>
                    </div>

                    {/* Status picker dropdown */}
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: 44, right: 14, zIndex: 50,
                        background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160,
                      }}>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button key={key} onClick={() => { updateShipmentStatus(s.id, key); setOpenStatusId(null); }} style={{
                            background: (s.status || 'preparacion') === key ? cfg.bg : 'transparent',
                            border: `1.5px solid ${(s.status || 'preparacion') === key ? cfg.color + '55' : 'transparent'}`,
                            borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                            color: cfg.color, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 7,
                          }}>
                            <span>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Bottom actions */}
                    <div style={{ borderTop: '1px solid #F0EBE3', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, background: '#FAFAF8', flexWrap: 'wrap' }}>
                      <button onClick={() => toggleShipmentPublic(s.id, s.is_public)} style={{
                        padding: '4px 10px', fontSize: 10, fontFamily: "'DM Mono', monospace", borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${s.is_public ? '#3A8C52' : '#D8CFC6'}`,
                        color: s.is_public ? '#3A8C52' : '#9a8778',
                        background: s.is_public ? '#EDF7F1' : 'transparent',
                      }}>
                        {s.is_public ? '🔗 Link activo' : '🔗 Compartir'}
                      </button>
                      <button onClick={() => handleExportShipmentCSV(s)} title="Exportar CSV" style={{
                        padding: '4px 10px', fontSize: 10, fontFamily: "'DM Mono', monospace", borderRadius: 6, cursor: 'pointer',
                        border: '1px solid #D8CFC6', color: '#9a8778', background: 'transparent',
                      }}>
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
                        style={{
                          padding: '4px 10px', fontSize: 10, fontFamily: "'DM Mono', monospace", borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${String(currentShipmentId) === String(s.id) ? '#D8CFC6' : '#EDE8E3'}`,
                          color: String(currentShipmentId) === String(s.id) ? '#9a8778' : '#C8B8A8',
                          background: 'transparent',
                          opacity: String(currentShipmentId) === String(s.id) ? 1 : 0.5,
                        }}>
                        📄 PDF
                      </button>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => loadShipment(s.id)} style={{
                        padding: '4px 14px', fontSize: 10, fontFamily: "'DM Mono', monospace", borderRadius: 6,
                        border: '1.5px solid #8D7966', color: '#fff', background: '#8D7966', cursor: 'pointer', fontWeight: 600,
                      }}>Cargar →</button>
                      <button onClick={() => { setDeleteShipId(s.id); setShowDeleteShip(true); }} style={{
                        padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #E8E0D8',
                        color: '#b85c5c', background: 'transparent', cursor: 'pointer', lineHeight: 1,
                      }}>✕</button>
                    </div>
                  </div>
                );
              })}
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
