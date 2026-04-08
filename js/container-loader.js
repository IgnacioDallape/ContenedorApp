// ── CONTAINER TYPES ──
// Utilidad de formato numérico (fallback si catalog.js no cargó aún)
if (typeof fmt === 'undefined') {
  window.fmt = n => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CONTAINER_TYPES = {
  '20ft':   { L:589,  W:235, H:239, vol:(589*235*239)/1e6,   label:"20'",     fullLabel:"20' Dry",       dims:"5.89 × 2.35 × 2.39 m" },
  '40ft':   { L:1200, W:235, H:239, vol:(1200*235*239)/1e6,  label:"40'",     fullLabel:"40' Dry",       dims:"12.00 × 2.35 × 2.39 m" },
  '40hc':   { L:1200, W:235, H:269, vol:(1200*235*269)/1e6,  label:"40' HC",  fullLabel:"40' High Cube", dims:"12.00 × 2.35 × 2.69 m" },
  'semi145': { L:1450, W:244, H:270, vol:(1450*244*270)/1e6, label:"Semi 14.5m", fullLabel:"Semi 14.5 m",  dims:"14.50 × 2.44 × 2.70 m" },
  'semi155': { L:1550, W:244, H:270, vol:(1550*244*270)/1e6, label:"Semi 15.5m", fullLabel:"Semi 15.5 m",  dims:"15.50 × 2.44 × 2.70 m" },
};
let currentContainerType = '20ft';
let CONTAINER_VOL = CONTAINER_TYPES['20ft'].vol;
let CONT_L = 589, CONT_W = 235, CONT_H = 239;

function setContainerType(type) {
  if (shipmentContainers[activeContainerIdx]) shipmentContainers[activeContainerIdx].type = type;
  _setContainerTypeInternal(type);
  renderContainerTabs();
  renderLoader();
}

const PALLET_SIZES = { euro:{L:120,W:80}, eua:{L:120,W:100} };
const COLORS = ['#8D7966','#A8906b','#6b7d9b','#9b7966','#6b8c6b','#b8906b','#7d6b9b','#6b9b8b','#9b8b6b','#8b6b6b'];

// ── MULTI-CONTAINER / SHIPMENT SYSTEM ──
let _currentShipmentId = null; // ID del embarque cargado desde Supabase
let shipmentContainers = [
  { id: 1, type: '20ft', products: [], priorityZones: [null,null,null], instanceManualPos: {}, instanceLockedOri: {} }
];
let activeContainerIdx = 0;

function getActiveContainer() { return shipmentContainers[activeContainerIdx]; }

function addNewContainer() {
  const id = shipmentContainers.length + 1;
  shipmentContainers.push({
    id, type: currentContainerType,
    products: [], priorityZones: [null,null,null],
    instanceManualPos: {}, instanceLockedOri: {}
  });
  switchToContainer(shipmentContainers.length - 1);
}

function switchToContainer(idx) {
  // Guardar estado del contenedor activo antes de cambiar
  const cur = getActiveContainer();
  cur.products = [...loadedProducts];
  cur.priorityZones = [...window._priorityZones];
  cur.instanceManualPos = {...window._instanceManualPos};
  cur.instanceLockedOri = {...window._instanceLockedOri};
  cur.type = currentContainerType;

  activeContainerIdx = idx;
  const next = getActiveContainer();

  // Restaurar estado del contenedor destino
  loadedProducts = [...next.products];
  window._priorityZones = [...next.priorityZones];
  window._instanceManualPos = {...next.instanceManualPos};
  window._instanceLockedOri = {...next.instanceLockedOri};

  // Cambiar tipo de contenedor sin triggear save
  _setContainerTypeInternal(next.type);
  renderContainerTabs();
  renderLoader();
}


function removeContainer(idx) {
  if (shipmentContainers.length <= 1) return showToast('No podes eliminar el unico contenedor', 'error');
  shipmentContainers.splice(idx, 1);
  // Ajustar indice activo
  if (activeContainerIdx >= shipmentContainers.length) activeContainerIdx = shipmentContainers.length - 1;
  // Cargar estado del contenedor activo
  const cur = getActiveContainer();
  loadedProducts = [...cur.products];
  window._priorityZones = [...(cur.priorityZones || [null,null,null])];
  window._instanceManualPos = {...(cur.instanceManualPos || {})};
  window._instanceLockedOri = {...(cur.instanceLockedOri || {})};
  _setContainerTypeInternal(cur.type || '20ft');
  renderContainerTabs();
  renderLoader();
  showToast('Contenedor eliminado', '');
}
function renderContainerTabs() {
  const tabsEl = document.getElementById('containerTabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = shipmentContainers.map((c, i) => {
    const totalVol = c.products.reduce((s,p) => s + p.vol * p.qty, 0);
    const ct = CONTAINER_TYPES[c.type];
    const pct = ct ? (totalVol / ct.vol * 100).toFixed(0) : 0;
    const isActive = i === activeContainerIdx;
    const removeBtn = shipmentContainers.length > 1
      ? `<span onclick="event.stopPropagation();removeContainer(${i})" style="margin-left:5px;opacity:0.6;font-size:12px;cursor:pointer;line-height:1" title="Eliminar contenedor">&times;</span>`
      : '';
    return `<button onclick="switchToContainer(${i})" style="
      padding:6px 14px;font-size:11px;font-family:'DM Mono',monospace;letter-spacing:0.5px;
      border-radius:6px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:2px;
      border:1.5px solid ${isActive ? 'var(--c1)' : 'var(--border)'};
      background:${isActive ? 'var(--c1)' : 'transparent'};
      color:${isActive ? 'var(--c5)' : 'var(--muted)'};
      font-weight:${isActive ? '700' : '400'}
    ">&#x1F6A2; Cont. ${c.id} <span style="opacity:0.7">${pct}%</span>${removeBtn}</button>`;
  }).join('') +
  `<button onclick="addNewContainer()" style="
    padding:6px 12px;font-size:11px;font-family:'DM Mono',monospace;
    border-radius:6px;cursor:pointer;border:1.5px dashed var(--border);
    background:transparent;color:var(--muted);transition:all 0.15s
  " onmouseover="this.style.borderColor='var(--c1)';this.style.color='var(--c1)'"
    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">+ Nuevo contenedor</button>`;
}

// ── GUARDAR EMBARQUE EN SUPABASE ──
function saveShipment() {
  // Si hay un embarque activo cargado, ofrecer sobreescribir directamente
  if (_currentShipmentId) {
    document.getElementById('overwriteShipmentId').value = _currentShipmentId;
    // Buscar el nombre del embarque actual
    _sb.from('shipments').select('name').eq('id', _currentShipmentId).single().then(({ data }) => {
      document.getElementById('overwriteShipmentName').textContent = data ? data.name : 'este embarque';
      document.getElementById('overwriteShipmentModal').classList.add('open');
    });
    return;
  }
  document.getElementById('saveShipmentName').value = '';
  document.getElementById('saveShipmentModal').classList.add('open');
  setTimeout(() => document.getElementById('saveShipmentName').focus(), 80);
}

async function confirmSaveShipment() {
  let session;
  try { ({ data: { session } } = await _sb.auth.getSession()); }
  catch(e) { return showToast('Error de conexión — verificá tu internet', 'error'); }
  if (!session) return showToast('Necesitas estar logueado', 'error');
  const name = document.getElementById('saveShipmentName').value.trim();
  if (!name) { document.getElementById('saveShipmentName').focus(); return; }

  // Verificar si ya existe un embarque con ese nombre (case-insensitive)
  const { data: existingList } = await _sb
    .from('shipments')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', name);
  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  if (existing) {
    // Guardar ID para sobreescribir y mostrar modal de confirmacion
    document.getElementById('overwriteShipmentId').value = existing.id;
    document.getElementById('overwriteShipmentName').textContent = name;
    document.getElementById('saveShipmentModal').classList.remove('open');
    document.getElementById('overwriteShipmentModal').classList.add('open');
    return;
  }

  await doSaveShipment(session, name, null);
}

async function confirmOverwriteShipment() {
  let session;
  try { ({ data: { session } } = await _sb.auth.getSession()); }
  catch(e) { return showToast('Error de conexión — verificá tu internet', 'error'); }
  const id = document.getElementById('overwriteShipmentId').value;
  const name = document.getElementById('overwriteShipmentName').textContent;
  document.getElementById('overwriteShipmentModal').classList.remove('open');
  await doSaveShipment(session, name, id);
}

async function doSaveShipment(session, name, overwriteId) {
  // Sincronizar estado actual del contenedor activo antes de guardar
  const cur = getActiveContainer();
  cur.products = [...loadedProducts];
  cur.type = currentContainerType;
  cur.priorityZones = [...window._priorityZones];
  cur.instanceManualPos = {...window._instanceManualPos};
  cur.instanceLockedOri = {...window._instanceLockedOri};

  const snapshot = JSON.parse(JSON.stringify(shipmentContainers));

  const btn = document.getElementById('btnSaveShipment');
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }

  let error;
  try {
    if (overwriteId) {
      ({ error } = await _sb
        .from('shipments')
        .update({ name, containers: snapshot })
        .eq('id', overwriteId));
    } else {
      ({ error } = await _sb
        .from('shipments')
        .insert({ user_id: session.user.id, name, containers: snapshot }));
    }
  } catch(e) {
    if (btn) { btn.textContent = 'Guardar embarque'; btn.disabled = false; }
    return showToast('Error de conexión — verificá tu internet', 'error');
  }

  if (btn) { btn.textContent = 'Guardar embarque'; btn.disabled = false; }
  if (error) { console.error(error); return showToast('Error al guardar: ' + error.message, 'error'); }
  if (!overwriteId) _currentShipmentId = null;
  showToast((overwriteId ? 'Embarque actualizado: ' : 'Embarque guardado: ') + '"' + name + '"', 'success');
}


async function loadShipmentsList() {
  let session;
  try { ({ data: { session } } = await _sb.auth.getSession()); }
  catch(e) { return showToast('Error de conexión — verificá tu internet', 'error'); }
  if (!session) return showToast('Necesitás estar logueado', 'error');
  let data, error;
  try {
    ({ data, error } = await _sb
      .from('shipments')
      .select('id, name, created_at, containers')
      .order('created_at', { ascending: false })
      .limit(20));
  } catch(e) { return showToast('Error de conexión al cargar embarques', 'error'); }
  if (error) return showToast('Error al cargar embarques: ' + error.message, 'error');

  const listEl = document.getElementById('shipmentsList');
  if (!listEl) return;

  if (!data || data.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px;font-size:13px">No tenés embarques guardados aún.</div>';
    return;
  }

  listEl.innerHTML = data.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
    const totalConts = s.containers ? s.containers.length : 1;
    const totalProds = s.containers ? s.containers.reduce((acc, c) => acc + (c.products ? c.products.length : 0), 0) : 0;
    return `<div style="padding:14px 16px;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
      <div>
        <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:3px">${s.name}</div>
        <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${date} · ${totalConts} contenedor${totalConts>1?'es':''} · ${totalProds} producto${totalProds!==1?'s':''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="loadShipment('${s.id}')" style="padding:7px 14px;font-size:11px;font-family:'DM Mono',monospace;border-radius:6px;border:1.5px solid var(--c1);color:var(--c1);background:transparent;cursor:pointer">Cargar →</button>
        <button onclick="deleteShipment('${s.id}')" style="padding:7px 14px;font-size:11px;font-family:'DM Mono',monospace;border-radius:6px;border:1px solid rgba(184,92,92,0.35);color:var(--danger);background:transparent;cursor:pointer;letter-spacing:0.3px;transition:all 0.15s" onmouseover="this.style.background='rgba(184,92,92,0.08)'" onmouseout="this.style.background='transparent'">Eliminar</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('shipmentsOverlay').classList.add('open');
}

async function loadShipment(id) {
  let data, error;
  try { ({ data, error } = await _sb.from('shipments').select('*').eq('id', id).single()); }
  catch(e) { return showToast('Error de conexión — verificá tu internet', 'error'); }
  if (error || !data) return showToast('Error al cargar embarque: ' + (error?.message || 'no encontrado'), 'error');

  _currentShipmentId = data.id;
  shipmentContainers = data.containers;
  activeContainerIdx = 0;
  const first = shipmentContainers[0];

  loadedProducts = [...first.products];
  window._priorityZones = [...(first.priorityZones || [null,null,null])];
  window._instanceManualPos = {...(first.instanceManualPos || {})};
  window._instanceLockedOri = {...(first.instanceLockedOri || {})};
  _setContainerTypeInternal(first.type || '20ft');

  closeShipmentsOverlay();
  renderContainerTabs();
  renderLoader();
  showToast('✓ Embarque "' + data.name + '" cargado', 'success');
}

async function deleteShipment(id) {
  document.getElementById('deleteShipmentId').value = id;
  document.getElementById('deleteShipmentModal').classList.add('open');
}

async function confirmDeleteShipment() {
  const id = document.getElementById('deleteShipmentId').value;
  document.getElementById('deleteShipmentModal').classList.remove('open');
  let error;
  try { ({ error } = await _sb.from('shipments').delete().eq('id', id)); }
  catch(e) { return showToast('Error de conexión — verificá tu internet', 'error'); }
  if (error) return showToast('Error al eliminar: ' + error.message, 'error');
  // Si eliminamos el embarque actualmente cargado, resetear el ID
  if (_currentShipmentId && String(_currentShipmentId) === String(id)) {
    _currentShipmentId = null;
  }
  showToast('Embarque eliminado', '');
  loadShipmentsList();
}

function closeShipmentsOverlay() {
  document.getElementById('shipmentsOverlay').classList.remove('open');
}

// Versión interna de setContainerType que no dispara switchToContainer
function _setContainerTypeInternal(type) {
  currentContainerType = type;
  const ct = CONTAINER_TYPES[type];
  if (!ct) return;
  CONTAINER_VOL = ct.vol;
  CONT_L = ct.L; CONT_W = ct.W; CONT_H = ct.H;
  _GRID_COLS = Math.ceil((CONT_L + 5) / GRID_RES);
  _GRID_ROWS = Math.ceil((CONT_W + 5) / GRID_RES);
  const btns = { '20ft':'btnCont20', '40ft':'btnCont40', '40hc':'btnCont40hc', 'semi145':'btnContSemi145', 'semi155':'btnContSemi155' };
  Object.entries(btns).forEach(([t, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', t === type);
  });
  const hcl = document.getElementById('headerContLabel');
  if (hcl) hcl.textContent = ct.fullLabel + ' · ' + ct.vol.toFixed(1) + ' m³';
  const t3d = document.getElementById('sectionTitle3D');
  if (t3d) t3d.textContent = 'Visualización del Contenedor ' + ct.label;
  const dimLabel = document.getElementById('contDimsLabel');
  if (dimLabel) dimLabel.textContent = ct.dims;
  if (_three) {
    _three.camera.position.set(ct.L * 0.8, ct.H * 2.2, ct.W * 2.5);
    _three.camera.lookAt(ct.L / 2, ct.H * 0.4, ct.W / 2);
    _three.controls.target.set(ct.L / 2, ct.H * 0.4, ct.W / 2);
    _three.controls.minDistance = 150;
    _three.controls.maxDistance = (type === '20ft' ? 1100 : type.startsWith('semi') ? 2400 : 1800) * 1.5;
    _three.controls.update();
  }
}

let loadedProducts = [];
let catalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
let selectedCatalogItems = {}; // { id: { qty, zone } }
let selectedCatalogZones = {}; // { id: 0|1|2|null }
let currentType = 'box';
let modalType = 'box';
let editingId = null;

function showPage(p) {
  if (p === 'loader') switchSection('container');
  else if (p === 'catalog') switchSection('catalog');
}

function setType(t) {
  currentType = t;
  document.getElementById('boxSection').style.display = t==='box'?'':'none';
  document.getElementById('palletSection').style.display = t==='pallet'?'':'none';
  document.getElementById('tabBox').className = 'type-tab '+(t==='box'?'active-box':'');
  document.getElementById('tabPallet').className = 'type-tab '+(t==='pallet'?'active-pallet':'');
}

// Zone globals
const ZONE_COLORS = [0xc1704a, 0x4a7dc1, 0x4ac16b];
const ZONE_COLORS_HEX = ['#c1704a', '#4a7dc1', '#4ac16b'];
const ZONE_LABELS = ['Zona 1', 'Zona 2', 'Zona 3'];
window._priorityZones = [null, null, null];
window._activeZoneSlot = 0;
let _selectedZoneSlot = 0;
window._instanceManualPos = {};
window._instanceLockedOri = {};

function reorderCargo() {
  if (!loadedProducts.length) return showToast('No hay productos para reordenar','');
  const btn = document.getElementById('reorderBtn');
  btn.classList.add('working');
  btn.textContent = '⟳ Reordenando...';
  setTimeout(() => {
    // Clear all priority zones, manual positions, and instance overrides
    loadedProducts.forEach(p => { p.priorityZone = null; p.manualPos = null; p.lockedOri = null; });
    window._instanceManualPos = {};
    window._instanceLockedOri = {};
    // Clear global zones
    window._priorityZones = [null, null, null];
    clearPriorityMarker();
    updateZoneUI();
    // Sort: pallets by footprint desc, boxes by volume desc
    loadedProducts.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'pallet' ? -1 : 1;
      const volA = a.dims.L * a.dims.W * a.dims.H;
      const volB = b.dims.L * b.dims.W * b.dims.H;
      return volB - volA;
    });
    renderLoader();
    btn.classList.remove('working');
    btn.innerHTML = '<span class="spin">⟳</span> Reordenar Carga Optimizada';
    showToast('✓ Carga reordenada sin zonas prioritarias','success');
  }, 80);
}

// ── CAPACITY CHECK before adding ──
let _pendingProduct = null;
let _afterAddCallback = null;

function checkCapacityAndAdd(productData) {
  const vol = (productData.dims.L * productData.dims.W * productData.dims.H) / 1e6;
  const newProd = {
    id: 'preview', name: productData.name, type: productData.type,
    dims: productData.dims, qty: productData.qty, price: productData.price,
    weight: productData.weight || 0,
    vol, color: COLORS[loadedProducts.length % COLORS.length], imgUrl: productData.imgUrl || null,
    priorityZone: productData.priorityZone || null
  };

  const currentVol = loadedProducts.reduce((s,p) => s + p.vol * p.qty, 0);
  const addedVol = vol * productData.qty;
  const totalVol = currentVol + addedVol;
  const remainingVol = CONTAINER_VOL - currentVol;
  const volExceeds = totalVol > CONTAINER_VOL;

  // Weight check
  const WEIGHT_LIMITS = { '20ft': 28000, '40ft': 26500, '40hc': 26500, 'semi145': 28000, 'semi155': 28000 };
  const weightLimit = WEIGHT_LIMITS[currentContainerType] || 28000;
  const currentWeight = loadedProducts.reduce((s,p) => s + (p.weight||0) * p.qty, 0);
  const addedWeight = (productData.weight||0) * productData.qty;
  const totalWeight = currentWeight + addedWeight;
  const weightExceeds = totalWeight > weightLimit;

  // Test packing: put new product in the list, let BFD sort determine order naturally
  // The sort inside runPacking will place it optimally relative to existing products
  const testList = [...loadedProducts, newProd];
  // Timeout guard: si hay demasiadas unidades, limitar el test
  const totalUnitsTest = testList.reduce((s,p) => s + p.qty, 0);
  if (totalUnitsTest > 800) return showToast('Demasiadas unidades en el contenedor. Dividí la carga en más contenedores.', 'error');
  const { placed } = runPacking(testList);
  const placedQty = placed['preview'] || 0;
  const physicallyExceeds = placedQty < productData.qty;

  if (volExceeds || physicallyExceeds || weightExceeds) {
    _pendingProduct = productData;
    const overVol = Math.max(0, totalVol - CONTAINER_VOL);
    const overWeight = Math.max(0, totalWeight - weightLimit);
    const fitPct = (remainingVol / CONTAINER_VOL * 100).toFixed(1);

    if (weightExceeds && !volExceeds && !physicallyExceeds) {
      document.getElementById('capBody').innerHTML =
        `El peso total supera el límite al agregar <b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b>.`;
    } else if (placedQty === 0) {
      document.getElementById('capBody').innerHTML =
        `<b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b> no tienen espacio físico en el contenedor con la configuración actual.`;
    } else if (placedQty === productData.qty && volExceeds) {
      document.getElementById('capBody').innerHTML =
        `El volumen total supera la capacidad al agregar <b>${productData.qty} ${productData.type === 'box' ? 'caja(s)' : 'pallet(s)'} de "${productData.name}"</b>.`;
    } else {
      document.getElementById('capBody').innerHTML =
        `Solo <b>${placedQty} de ${productData.qty}</b> unidades de "<b>${productData.name}</b>" tienen espacio físico disponible en el contenedor. Las restantes <b>(${productData.qty - placedQty})</b> no caben.`;
    }

    document.getElementById('capStats').innerHTML = `
      <div class="cap-stat-row"><span>Volumen disponible</span><span>${remainingVol.toFixed(3)} m³ (${fitPct}%)</span></div>
      <div class="cap-stat-row"><span>Volumen del producto</span><span>${addedVol.toFixed(3)} m³</span></div>
      ${volExceeds ? `<div class="cap-stat-row"><span>Exceso volumétrico</span><span style="color:var(--error)">+${overVol.toFixed(3)} m³</span></div>` : ''}
      ${physicallyExceeds ? `<div class="cap-stat-row"><span>Unidades que sí caben</span><span style="color:var(--success)">${placedQty} de ${productData.qty}</span></div>` : ''}
      ${weightExceeds ? `<div class="cap-stat-row"><span>Peso actual</span><span>${(currentWeight/1000).toFixed(2)} t</span></div>` : ''}
      ${weightExceeds ? `<div class="cap-stat-row"><span>Peso a agregar</span><span>${(addedWeight/1000).toFixed(2)} t</span></div>` : ''}
      ${weightExceeds ? `<div class="cap-stat-row"><span>Límite del contenedor</span><span>${(weightLimit/1000).toFixed(1)} t</span></div>` : ''}
      ${weightExceeds ? `<div class="cap-stat-row"><span>Exceso de peso</span><span style="color:var(--error)">+${(overWeight/1000).toFixed(2)} t</span></div>` : ''}
    `;
    document.getElementById('capOverlay').classList.add('open');
    return;
  }

  doAddProduct(productData);
}

function closeCapAlert() {
  document.getElementById('capOverlay').classList.remove('open');
  _pendingProduct = null;
  _afterAddCallback = null;
}

function forceAddProduct() {
  if (!_pendingProduct) return closeCapAlert();
  if (_pendingProduct.type === 'pallet') {
    // Verificar que con el nuevo pallet, TODOS los existentes siguen teniendo lugar
    const newProd = {
      id: 'preview', name: _pendingProduct.name, type: 'pallet',
      dims: _pendingProduct.dims, qty: 1,
      vol: (_pendingProduct.dims.L * _pendingProduct.dims.W * _pendingProduct.dims.H) / 1e6,
      weight: _pendingProduct.weight || 0, color: '#999',
      priorityZone: null, packedItems: _pendingProduct.packedItems || null,
      palletBase: _pendingProduct.palletBase || null
    };
    const testList = [...loadedProducts, newProd];
    const { placed } = runPacking(testList);
    // Verificar que el nuevo entra Y que todos los existentes también
    const newEntra = (placed['preview'] || 0) >= 1;
    const todosEntran = loadedProducts.every(p => (placed[p.id] || 0) >= p.qty);
    if (!newEntra || !todosEntran) {
      showToast('No hay espacio para todos los pallets — usá un nuevo contenedor', 'error');
      closeCapAlert();
      return;
    }
  }
  doAddProduct(_pendingProduct);
  closeCapAlert();
}

function sendToNewContainer() {
  if (!_pendingProduct) return;
  const prod = _pendingProduct;
  closeCapAlert();
  addNewContainer();
  doAddProduct(prod);
  showToast('✓ Producto enviado al Contenedor ' + shipmentContainers[activeContainerIdx].id, 'success');
}

function doAddProduct(p) {
  loadedProducts.push({
    id: Date.now()+Math.random(), name:p.name, type:p.type,
    dims:p.dims, qty:p.qty, price:p.price,
    weight: p.weight || 0,
    vol:(p.dims.L*p.dims.W*p.dims.H)/1e6,
    color:COLORS[loadedProducts.length%COLORS.length],
    imgUrl:p.imgUrl||null,
    priorityZone: p.priorityZone || null,
    priorityZoneSlot: p.priorityZoneSlot != null ? p.priorityZoneSlot : null,
    packedItems: p.packedItems || null,
    palletBase: p.palletBase || null,
  });
  // Auto-sort for optimal BFD packing: pallets first, then by volume desc
  // This ensures the visual result is always as good as manual reorder
  loadedProducts.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'pallet' ? -1 : 1;
    const pa = a.priorityZone ? 0 : 1, pb = b.priorityZone ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (b.dims.L*b.dims.W*b.dims.H) - (a.dims.L*a.dims.W*a.dims.H);
  });
  invalidatePackingCache();
  renderLoader();
  if (_afterAddCallback) { _afterAddCallback(); _afterAddCallback = null; }
}

function addProductManual() {
  const name = document.getElementById('prodName').value.trim();
  const qty = parseInt(document.getElementById('qty').value);
  const price = parseFloat(document.getElementById('unitPrice').value)||0;
  if (!name) return showToast('Ingresá el nombre del producto','error');
  if (!qty||qty<1) return showToast('Ingresá una cantidad válida','error');
  if (qty > 500) return showToast('Máximo 500 unidades por producto','error');
  let dims;
  if (currentType==='box') {
    const L=parseFloat(document.getElementById('boxL').value);
    const W=parseFloat(document.getElementById('boxW').value);
    const H=parseFloat(document.getElementById('boxH').value);
    if (!L||!W||!H) return showToast('Ingresá las dimensiones','error');
    // Validar que no supere el contenedor más grande (40' HC: 1200×235×269 cm)
    const maxL=1200, maxW=235, maxH=269;
    const minD=Math.min(L,W,H), maxD=Math.max(L,W,H);
    // Check all 3 rotations fit within container
    const fits = (
      (L<=maxL && W<=maxW && H<=maxH) ||
      (L<=maxL && H<=maxW && W<=maxH) ||
      (W<=maxL && L<=maxW && H<=maxH) ||
      (W<=maxL && H<=maxW && L<=maxH) ||
      (H<=maxL && L<=maxW && W<=maxH) ||
      (H<=maxL && W<=maxW && L<=maxH)
    );
    if (!fits) {
      const exceed = [];
      if (Math.min(L,W,H) > maxW) exceed.push(`el mínimo (${Math.min(L,W,H)} cm) supera el ancho máximo del contenedor (${maxW} cm)`);
      else if (Math.max(L,W,H) > maxL) exceed.push(`la dimensión mayor (${Math.max(L,W,H)} cm) supera el largo del 40' (${maxL} cm)`);
      return showToast(`Caja demasiado grande: ${exceed.join(', ')}`, 'error');
    }
    dims={L,W,H};
  } else {
    const sz=PALLET_SIZES[document.getElementById('palletType').value];
    dims={L:sz.L,W:sz.W,H:parseFloat(document.getElementById('palletHeight').value)};
  }
  const activeZones = window._priorityZones.filter(z => z !== null);
  const zone = activeZones.length === 1 ? activeZones[0] : null;
  const weight = parseFloat(document.getElementById('unitWeight').value)||0;
  checkCapacityAndAdd({name, type:currentType, dims, qty, price, weight, priorityZone: zone});
  // Clear form
  document.getElementById('prodName').value='';
  document.getElementById('qty').value='';
  document.getElementById('unitPrice').value='';
  document.getElementById('unitWeight').value='';
  ['boxL','boxW','boxH'].forEach(id=>document.getElementById(id).value='');
}

function removeProduct(id) {
  // Usar == para evitar mismatch number/string en el id
  loadedProducts = loadedProducts.filter(p => p.id != id);
  // Clean up per-instance state — limpiar todas las instancias de este producto
  Object.keys(window._instanceManualPos || {}).forEach(k => {
    if (k.startsWith(String(id) + '_')) delete window._instanceManualPos[k];
  });
  Object.keys(window._instanceLockedOri || {}).forEach(k => {
    if (k.startsWith(String(id) + '_')) delete window._instanceLockedOri[k];
  });
  invalidatePackingCache();
  renderLoader();
}

// Reorder one product — clear zone and re-render
function reorderProduct(id) {
  const p = loadedProducts.find(p => p.id == id);
  if (!p) return;
  p.priorityZone = null;
  p.priorityZoneSlot = null;
  renderLoader();
  showToast(`✓ "${p.name}" reordenado de manera óptima`, 'success');
}

// Move product to the currently selected priority zone — store SLOT not coords
function moveProductToZone(id) {
  const p = loadedProducts.find(p => p.id == id);
  if (!p) return;
  const slot = _selectedZoneSlot;
  if (!window._priorityZones[slot]) {
    showToast(`Primero fijá la Zona ${slot+1} haciendo doble clic en el contenedor`, 'error');
    return;
  }
  p.priorityZoneSlot = slot; // store index — auto-resolves when zone moves
  p.priorityZone = window._priorityZones[slot];
  renderLoader();
  showToast(`✓ "${p.name}" → Zona ${slot+1}`, 'success');
}

// Refresh all product zone coordinates before packing (in case zones were moved)
function refreshProductZones() {
  loadedProducts.forEach(p => {
    if (p.priorityZoneSlot != null) {
      p.priorityZone = window._priorityZones[p.priorityZoneSlot] || null;
    }
  });
}

function renderLoader() {
  // Limpiar registro de pallets sin lugar antes de cada render
  window._palletsWithNoSpace = [];
  // Refresh zone coordinates in case zones were moved in 3D
  refreshProductZones();
  const totalVol = loadedProducts.reduce((s,p)=>s+p.vol*p.qty,0);
  const totalUnits = loadedProducts.reduce((s,p)=>s+p.qty,0);
  const totalValue = loadedProducts.reduce((s,p)=>s+p.price*p.qty,0);
  const totalWeight = loadedProducts.reduce((s,p)=>s+(p.weight||0)*p.qty,0);
  const pct = totalVol/CONTAINER_VOL*100;
  const over = totalVol>CONTAINER_VOL;
  const WEIGHT_LIMITS = { '20ft': 28000, '40ft': 26500, '40hc': 26500, 'semi145': 28000, 'semi155': 28000 };
  const weightLimit = WEIGHT_LIMITS[currentContainerType] || 28000;
  const weightOver = totalWeight > weightLimit;

  document.getElementById('statVol').textContent = totalVol.toFixed(2);
  document.getElementById('statPct').textContent = pct.toFixed(1)+'%';
  document.getElementById('statUnits').textContent = totalUnits;
  document.getElementById('statValue').textContent = '$'+fmt(totalValue);
  const ct = CONTAINER_TYPES[currentContainerType];
  document.getElementById('statVolSub').textContent = 'm³ de ' + ct.vol.toFixed(2) + ' disponibles';
  document.getElementById('statPctSub').textContent = 'del contenedor ' + ct.label;

  // Weight stat
  const weightEl = document.getElementById('statWeight');
  const weightSubEl = document.getElementById('statWeightSub');
  if (totalWeight >= 1000) {
    weightEl.textContent = (totalWeight/1000).toFixed(2) + ' t';
  } else {
    weightEl.textContent = totalWeight.toFixed(0);
  }
  weightEl.style.color = weightOver ? 'var(--danger)' : 'var(--c5)';
  weightSubEl.textContent = weightOver ? `⚠ Supera límite ${(weightLimit/1000).toFixed(0)}.000 kg` : (totalWeight > 0 ? `kg · ${(totalWeight/1000).toFixed(2)} t` : `kg · límite ~${(weightLimit/1000).toFixed(0)}.000 kg`);
  weightSubEl.style.color = weightOver ? 'var(--danger)' : '';

  // Weight progress bar
  const weightBarRow = document.getElementById('weightBarRow');
  const fillWeight = document.getElementById('fillWeight');
  const pctWeightEl = document.getElementById('pctWeight');
  if (totalWeight > 0) {
    weightBarRow.style.display = '';
    const weightPct = Math.min(totalWeight / weightLimit * 100, 100);
    fillWeight.style.width = weightPct + '%';
    fillWeight.style.background = weightOver
      ? 'linear-gradient(90deg,#d8a8a8,var(--danger))'
      : 'linear-gradient(90deg,#b8c8d8,#6b8c9b)';
    pctWeightEl.textContent = totalWeight >= 1000 ? (totalWeight/1000).toFixed(2)+'t' : totalWeight.toFixed(0)+' kg';
    pctWeightEl.style.color = weightOver ? 'var(--danger)' : 'var(--text2)';
  } else {
    weightBarRow.style.display = 'none';
  }

  const fill = document.getElementById('fillVol');
  fill.style.width = Math.min(pct,100)+'%';
  fill.style.background = over ? 'linear-gradient(90deg,var(--c3),var(--danger))' : 'linear-gradient(90deg,var(--c3),var(--c1))';
  document.getElementById('pctVol').textContent = pct.toFixed(1)+'%';
  document.getElementById('pctVol').style.color = over?'var(--danger)':'var(--c1)';
  document.getElementById('warningBar').style.display = over?'':'none';

  const list = document.getElementById('productList');
  list.innerHTML = loadedProducts.length===0
    ? `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">Sin productos aún.</div></div>`
    : loadedProducts.map(p=>{
      const zoneIdx = p.priorityZoneSlot != null ? p.priorityZoneSlot : -1;
      const zoneTag = zoneIdx >= 0 ? `<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:${ZONE_COLORS_HEX[zoneIdx]};color:#fff;font-family:'DM Mono',monospace;letter-spacing:0.5px">Z${zoneIdx+1}</span>` : '';
      const activeZones = window._priorityZones.filter(z=>z!==null).length;
      const zoneBtnColor = _selectedZoneSlot !== undefined ? ZONE_COLORS_HEX[_selectedZoneSlot] : 'var(--muted)';
      const weightLine = p.weight > 0 ? ` · ⚖ ${(p.weight*p.qty).toFixed(1)} kg` : '';
      return `
        <div class="queue-item">
          <div class="queue-dot" style="background:${p.color}"></div>
          <div class="queue-info">
            <div class="queue-name">${p.name} ${zoneTag} <span class="queue-price" style="float:right">$${fmt(p.price*p.qty)}</span></div>
            <div class="queue-meta">${p.dims.L}×${p.dims.W}×${p.dims.H} · ${p.qty}${p.type==='box'?'cj':'plt'} · ${(p.vol*p.qty).toFixed(2)}m³ · ${((p.vol*p.qty)/CONTAINER_VOL*100).toFixed(1)}%${weightLine}</div>
          </div>
          <div style="display:flex;gap:3px;flex-shrink:0;align-items:center">
            <button onclick="reorderProduct(${p.id})" title="Reordenar" style="background:none;border:1px solid var(--border);border-radius:3px;padding:2px 5px;font-size:9px;color:var(--muted);cursor:pointer;font-family:'DM Mono',monospace" onmouseover="this.style.borderColor='var(--c1)';this.style.color='var(--c1)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">⟳</button>
            <button onclick="moveProductToZone(${p.id})" title="Zona" style="background:${activeZones>0?zoneBtnColor+'22':'none'};border:1px solid ${activeZones>0?zoneBtnColor:'var(--border)'};border-radius:3px;padding:2px 5px;font-size:9px;color:${activeZones>0?zoneBtnColor:'var(--muted)'};cursor:pointer;font-family:'DM Mono',monospace">${activeZones>0?`Z${_selectedZoneSlot+1}`:'Z'}</button>
            <button class="btn-remove" onclick="removeProduct(${p.id})" title="Eliminar">×</button>
          </div>
        </div>`;
    }).join('');

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = loadedProducts.length===0
    ? `<tr><td colspan="11"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Agregá productos para ver el desglose</div></div></td></tr>`
    : loadedProducts.map(p=>{
        const vt=p.vol*p.qty;
        const wt=(p.weight||0)*p.qty;
        return `<tr>
          <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:8px;vertical-align:middle"></span>${p.name}</td>
          <td>${p.type==='box'?'📦 Caja':'🟫 Pallet'}</td>
          <td class="td-mono">${p.dims.L}×${p.dims.W}×${p.dims.H}</td>
          <td class="td-mono">${p.qty}</td>
          <td class="td-mono">${p.weight>0?p.weight.toFixed(2)+' kg':'—'}</td>
          <td class="td-mono" style="${wt>0?'color:var(--text)':'color:var(--muted)'}">${wt>0?wt.toFixed(1)+' kg':'—'}</td>
          <td class="td-mono">${vt.toFixed(3)} m³</td>
          <td class="td-pct" style="color:${p.color}">${(vt/CONTAINER_VOL*100).toFixed(1)}%</td>
          <td class="td-price">$${p.price.toFixed(2)}</td>
          <td class="td-price">$${fmt(p.price*p.qty)}</td>
          <td><button class="btn-remove" onclick="removeProduct(${p.id})">×</button></td>
        </tr>`;
      }).join('')
    + `<tr class="total-row"><td colspan="4">TOTAL</td><td>—</td><td>${totalWeight>0?totalWeight.toFixed(1)+' kg':'—'}</td><td>${totalVol.toFixed(3)} m³</td><td>${pct.toFixed(1)}%</td><td>—</td><td>$${fmt(totalValue)}</td><td></td></tr>`;

  document.getElementById('legend').innerHTML = loadedProducts.map(p=>
    `<div class="legend-item"><div class="legend-dot" style="background:${p.color}"></div><span>${p.name}</span></div>`
  ).join('') + (loadedProducts.length?`<div class="legend-item"><div class="legend-dot" style="background:var(--c4);border:1px solid var(--border2)"></div><span>Libre</span></div>`:'');

  invalidatePackingCache();
  drawContainer();
  // Detectar pallets que no entraron y avisar al usuario
  setTimeout(() => {
    const noSpace = window._palletsWithNoSpace || [];
    if (noSpace.length) {
      // Encontrar los productos afectados por nombre para el toast
      const names = [...new Set(noSpace.map(id => {
        const p = loadedProducts.find(p => p.id == id);
        return p ? p.name : null;
      }).filter(Boolean))];
      if (names.length) {
        showToast(`⚠ "${names[0]}" no tiene espacio físico — envialo a un nuevo contenedor`, 'error');
      }
      window._palletsWithNoSpace = [];
    }
  }, 150);
  // Redraw zone markers so they appear on top of current stack
  setTimeout(() => drawAllPriorityMarkers(), 80);
  // Update container tabs with latest fill %
  renderContainerTabs();
}
// ══════════════════════════════════════════════