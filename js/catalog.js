// ── CATALOG ──
function saveCatalog() { localStorage.setItem('cl_catalog',JSON.stringify(catalog)); }

function renderCatalog() {
  const grid = document.getElementById('catalogGrid');
  if (!catalog.length) {
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🗂️</div><div class="empty-text">Tu catálogo está vacío.<br>Guardá productos con imagen y link para agregarlos rápidamente al contenedor.</div></div>`;
    updateAtcBar(); return;
  }
  grid.innerHTML = catalog.map(p=>{
    const sel = selectedCatalogItems[p.id]!==undefined;
    const qty = selectedCatalogItems[p.id]||1;
    const imgHtml = p.imgUrl
      ? `<img class="cat-img" src="${p.imgUrl}" alt="${p.name}" onerror="this.outerHTML='<div class=cat-img-placeholder>📦</div>'">`
      : `<div class="cat-img-placeholder">📦</div>`;
    return `<div class="cat-card ${sel?'selected':''}" id="card_${p.id}">
      <div class="cat-card-check">✓</div>
      ${imgHtml}
      <div class="cat-body">
        <div class="cat-name">${p.name}${p.source==='importapro'?` <span style="font-size:9px;background:#1a4f8a;color:#fff;padding:1px 6px;border-radius:10px;font-family:'DM Mono',monospace;letter-spacing:0.5px;vertical-align:middle">ImportaPro</span>`:''}</div>
        <div class="cat-meta">${p.type==='box'?`📦 ${p.dims.L}×${p.dims.W}×${p.dims.H} cm`:`🟫 ${p.dims.L}×${p.dims.W}×${p.dims.H} cm`}${p.weight>0?` · ⚖ ${p.weight} kg`:''}</div>
        ${p.link?`<a class="cat-link" href="${p.link}" target="_blank" onclick="event.stopPropagation()">🔗 ${shortenUrl(p.link)}</a>`:''}
        <div class="cat-price">$${p.price.toFixed(2)} / ${p.type==='box'?'caja':'pallet'}</div>
      </div>
      <div class="cat-footer">
        <label style="font-size:10px;margin:0;white-space:nowrap;color:var(--muted)">Cant.</label>
        <input type="number" min="1" value="${qty}" style="width:52px;padding:5px 7px;font-size:13px"
          onchange="setCatalogQty(${p.id},this.value)" onclick="event.stopPropagation()">
        <div class="cat-actions">
          <button class="btn-icon ${sel?'sel-active':''}" onclick="toggleCatalogItem(${p.id});event.stopPropagation()">
            ${sel?'✓':'+ Sel.'}
          </button>
          <button class="btn-icon" onclick="editCatalogItem(${p.id});event.stopPropagation()" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="deleteCatalogItem(${p.id});event.stopPropagation()" title="Eliminar">🗑</button>
        </div>
        <div class="cat-footer-row2" onclick="event.stopPropagation()">
          <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;white-space:nowrap">ZONA:</span>
          <div class="zone-select-wrap">
            ${['auto','0','1','2'].map((v,i) => {
              const cur = selectedCatalogZones[p.id] === undefined ? 'auto' : selectedCatalogZones[p.id];
              const isActive = cur === v;
              const colors = ['var(--muted)','#c1704a','#4a7dc1','#4ac16b'];
              const labels = ['Auto','Zona 1','Zona 2','Zona 3'];
              const col = colors[i];
              return `<button onclick="setCatalogZone(${p.id},'${v}');renderCatalog();event.stopPropagation()"
                style="padding:2px 8px;font-size:9px;font-family:'DM Mono',monospace;letter-spacing:0.5px;border-radius:20px;cursor:pointer;transition:all 0.15s;
                border:1px solid ${col};color:${isActive?'#fff':col};background:${isActive?col:'transparent'};font-weight:${isActive?'700':'400'}"
              >${labels[i]}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  updateAtcBar();
}

function toggleCatalogItem(id) {
  const numId = typeof id === 'string' ? (isNaN(id) ? id : Number(id)) : id;
  if (selectedCatalogItems[numId] !== undefined) {
    delete selectedCatalogItems[numId];
  } else {
    const input = document.querySelector(`#card_${numId} input[type="number"]`);
    selectedCatalogItems[numId] = input ? parseInt(input.value)||1 : 1;
  }
  renderCatalog();
}

function setCatalogQty(id, val) {
  const numId = typeof id === 'string' ? (isNaN(id) ? id : Number(id)) : id;
  if (selectedCatalogItems[numId] !== undefined)
    selectedCatalogItems[numId] = Math.max(1, parseInt(val)||1);
}

function setCatalogZone(id, val) {
  const numId = typeof id === 'string' ? (isNaN(id) ? id : Number(id)) : id;
  // Preserve current qty before re-render
  const input = document.querySelector(`#card_${numId} input[type="number"]`);
  if (input && selectedCatalogItems[numId] !== undefined)
    selectedCatalogItems[numId] = parseInt(input.value)||1;
  selectedCatalogZones[numId] = val;
}

function clearCatalogSelection() {
  selectedCatalogItems={}; selectedCatalogZones={};
  renderCatalog();
  if(typeof renderMisProductos==='function') renderMisProductos();
}

function updateAtcBar() {
  const n = Object.keys(selectedCatalogItems).length;
  document.getElementById('atcCount').textContent = n;
  document.getElementById('atcBar').classList.toggle('visible', n>0);
}

function addSelectedToContainer() {
  const ids = Object.keys(selectedCatalogItems);
  if (!ids.length) return;
  const activeZones = window._priorityZones.filter(z => z !== null);

  // Navigate to loader after last product is added
  const navigateToLoader = () => {
    document.getElementById('atcBar').classList.remove('visible');
    switchSection('container');
    window.scrollTo(0, 0);
  };

  ids.forEach((id, idx) => {
    const p = catalog.find(c => String(c.id) === String(id));
    if (!p) return;
    const zoneVal = selectedCatalogZones[id] || selectedCatalogZones[Number(id)];
    let zone = null;
    if (zoneVal && zoneVal !== 'auto') {
      zone = window._priorityZones[parseInt(zoneVal)] || null;
    } else if (activeZones.length === 1) {
      zone = activeZones[0];
    }
    const qty = selectedCatalogItems[id] || selectedCatalogItems[Number(id)] || 1;
    // Set callback on last product so we navigate after it's added
    if (idx === ids.length - 1) _afterAddCallback = navigateToLoader;
    checkCapacityAndAdd({...p, qty, weight: p.weight||0, priorityZone: zone});
  });

  selectedCatalogItems = {};
  selectedCatalogZones = {};
}

function deleteCatalogItem(id) {
  const p = catalog.find(c => c.id === id);
  const nombre = p ? p.name : null;
  catalog = catalog.filter(c => c.id !== id);
  delete selectedCatalogItems[id];
  saveCatalog(); renderCatalog();
  if(typeof renderMisProductos==='function') renderMisProductos();
  // Sync: también elimina de importapro-products
  if(nombre){
    savedProducts = savedProducts.filter(p => p.nombre !== nombre);
    localStorage.setItem('importapro-products', JSON.stringify(savedProducts));
    if(typeof populateSimProductSelect==='function') populateSimProductSelect();
  }
  showToast('Producto eliminado','');
}

function editCatalogItem(id) {
  const p = catalog.find(c=>c.id===id); if(!p) return;
  editingId=id;
  document.getElementById('editId').value=id;
  document.getElementById('mName').value=p.name;
  document.getElementById('mImgUrl').value=p.imgUrl||'';
  document.getElementById('mLink').value=p.link||'';
  document.getElementById('mPrice').value=p.price;
  document.getElementById('mWeight').value=p.weight||'';
  setModalType(p.type);
  if(p.type==='box'){document.getElementById('mBoxL').value=p.dims.L;document.getElementById('mBoxW').value=p.dims.W;document.getElementById('mBoxH').value=p.dims.H;}
  else {document.getElementById('mPalletH').value=p.dims.H;document.getElementById('mPalletHVal').textContent=p.dims.H+' cm';}
  previewImg();
  document.getElementById('modalTitle').textContent='Editar Producto';
  openModal();
}

function shortenUrl(url) { try{return new URL(url).hostname;}catch{return url.slice(0,28);} }

// ── MODAL ──
function openModal() { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId=null;
  ['editId','mName','mImgUrl','mLink','mPrice','mWeight','mBoxL','mBoxW','mBoxH'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('imgPreview').innerHTML='<span>🖼️</span>';
  document.getElementById('modalTitle').textContent='Nuevo Producto';
  setModalType('box');
}
function handleModalClick(e){if(e.target===document.getElementById('modalOverlay'))closeModal();}
function setModalType(t) {
  modalType=t;
  document.getElementById('mBoxSection').style.display=t==='box'?'':'none';
  document.getElementById('mPalletSection').style.display=t==='pallet'?'':'none';
  document.getElementById('mTabBox').className='type-tab '+(t==='box'?'active-box':'');
  document.getElementById('mTabPallet').className='type-tab '+(t==='pallet'?'active-pallet':'');
}
function previewImg() {
  const url=document.getElementById('mImgUrl').value;
  document.getElementById('imgPreview').innerHTML=url?`<img src="${url}" onerror="this.parentElement.innerHTML='<span>❌</span>'">` :'<span>🖼️</span>';
}
function saveProduct() {
  const name=document.getElementById('mName').value.trim();
  if(!name) return showToast('Ingresá el nombre','error');
  const price=parseFloat(document.getElementById('mPrice').value)||0;
  let dims;
  if(modalType==='box'){
    const L=parseFloat(document.getElementById('mBoxL').value);
    const W=parseFloat(document.getElementById('mBoxW').value);
    const H=parseFloat(document.getElementById('mBoxH').value);
    if(!L||!W||!H) return showToast('Ingresá las dimensiones','error');
    // Validar que no supere el contenedor más grande (40' HC: 1200×235×269 cm)
    const fits = (
      (L<=1200 && W<=235 && H<=269) ||
      (L<=1200 && H<=235 && W<=269) ||
      (W<=1200 && L<=235 && H<=269) ||
      (W<=1200 && H<=235 && L<=269) ||
      (H<=1200 && L<=235 && W<=269) ||
      (H<=1200 && W<=235 && L<=269)
    );
    if (!fits) {
      const big = Math.max(L,W,H);
      const small = Math.min(L,W,H);
      let msg = '';
      if (small > 235) msg = `La dimensión menor (${small} cm) supera el ancho del contenedor (235 cm). Imposible cargar.`;
      else if (big > 1200) msg = `La dimensión mayor (${big} cm) supera el largo del 40' (1200 cm). Imposible cargar.`;
      else msg = `Las dimensiones no permiten ninguna orientación válida dentro del contenedor 40' HC.`;
      return showToast(msg, 'error');
    }
    dims={L,W,H};
  } else {
    const sz=PALLET_SIZES[document.getElementById('mPalletType').value];
    dims={L:sz.L,W:sz.W,H:parseFloat(document.getElementById('mPalletH').value)};
  }
  const prod={id:editingId||Date.now(),name,type:modalType,dims,price,
    weight:parseFloat(document.getElementById('mWeight').value)||0,
    imgUrl:document.getElementById('mImgUrl').value.trim()||null,
    link:document.getElementById('mLink').value.trim()||null};
  if(editingId){const i=catalog.findIndex(c=>c.id===editingId);if(i>=0)catalog[i]=prod;}
  else catalog.push(prod);
  saveCatalog(); closeModal(); renderCatalog();
  if(typeof renderMisProductos==='function') renderMisProductos();
  showToast(editingId?'Producto actualizado':'Producto guardado','success');
}

function fmt(n){return n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});}
let toastTimer;
function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+type;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
}

// ── MIS PRODUCTOS (catálogo unificado) ──
function renderMisProductos() {
  catalog = JSON.parse(localStorage.getItem('cl_catalog') || '[]');
  const grid = document.getElementById('mis-productos-grid');
  if (!grid) return;

  if (!catalog.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">◧</div>
      <div class="empty-text">Todavía no tenés productos.<br>Guardá uno desde la calculadora o creá uno nuevo.</div>
    </div>`;
    updateAtcBar(); return;
  }

  const btnBase = 'width:100%;padding:9px 12px;border-radius:var(--radius);font-family:var(--font);font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:opacity 0.15s';

  grid.innerHTML = catalog.map(p => {
    const sel = selectedCatalogItems[p.id] !== undefined;
    const qty = selectedCatalogItems[p.id] || 1;
    const imgHtml = p.imgUrl
      ? `<img class="cat-img" src="${p.imgUrl}" alt="${p.name}" onerror="this.outerHTML='<div class=cat-img-placeholder>📦</div>'">`
      : `<div class="cat-img-placeholder">📦</div>`;
    const hasDims = p.dims && p.dims.L && p.dims.W && p.dims.H;
    const dimStr = hasDims
      ? (p.type === 'box' ? `📦 ${p.dims.L}×${p.dims.W}×${p.dims.H} cm` : `🟫 ${p.dims.L}×${p.dims.W}×${p.dims.H} cm`)
      : `<span style="color:var(--text-3);font-size:11px">Sin dimensiones</span>`;
    const ipBadge = p.source === 'importapro'
      ? `<span style="font-size:9px;background:#1a4f8a;color:#fff;padding:1px 6px;border-radius:10px;font-family:'DM Mono',monospace;letter-spacing:0.5px;vertical-align:middle;margin-left:4px">IP</span>`
      : '';

    return `<div class="cat-card ${sel ? 'selected' : ''}" id="mp_${p.id}">
      <div class="cat-card-check">✓</div>
      ${imgHtml}
      <div class="cat-body">
        <div class="cat-name">${p.name}${ipBadge}</div>
        <div class="cat-meta">${dimStr}${p.weight > 0 ? ` · ⚖ ${p.weight} kg` : ''}</div>
        ${p.link ? `<a class="cat-link" href="${p.link}" target="_blank" onclick="event.stopPropagation()">🔗 ${shortenUrl(p.link)}</a>` : ''}
        <div class="cat-price">U$S ${(p.price || 0).toFixed(2)} / ${p.type === 'box' ? 'caja' : 'pallet'}</div>
      </div>
      <div class="cat-footer" style="flex-direction:column;gap:8px">
        ${hasDims ? `
          <div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
            <label style="font-size:11px;color:var(--muted);white-space:nowrap;font-weight:500">Cantidad:</label>
            <input type="number" min="1" value="${qty}"
              style="flex:1;padding:6px 8px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius);font-family:var(--font)"
              onchange="setMpQty(${p.id},this.value)" onclick="event.stopPropagation()">
          </div>
          <button onclick="toggleMpItem(${p.id});event.stopPropagation()"
            style="${btnBase};background:${sel ? 'var(--green)' : 'var(--accent)'};color:#fff;border:none">
            ${sel ? '✓ Seleccionado' : '+ Seleccionar para agregar'}
          </button>
        ` : `<div style="font-size:11px;color:var(--text-3);text-align:center;padding:6px 0;background:var(--bg-3);border-radius:var(--radius)">Sin dimensiones — no se puede cargar al contenedor</div>`}
        <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
          <button onclick="editCatalogItem(${p.id});event.stopPropagation()"
            style="${btnBase};flex:1;background:transparent;color:var(--text-2);border:1px solid var(--border)">
            ✏️ Editar
          </button>
          <button onclick="deleteMisProducto(${p.id});event.stopPropagation()"
            style="${btnBase};flex:1;background:rgba(192,57,43,0.06);color:var(--red);border:1px solid rgba(192,57,43,0.25)">
            🗑 Eliminar
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
  updateAtcBar();
}

function deleteMisProducto(id) {
  const p = catalog.find(c => c.id === id);
  const nombre = p ? p.name : null;
  catalog = catalog.filter(c => c.id !== id);
  delete selectedCatalogItems[id];
  saveCatalog();
  // Sync: también elimina de importapro-products
  if (nombre) {
    savedProducts = savedProducts.filter(p => p.nombre !== nombre);
    localStorage.setItem('importapro-products', JSON.stringify(savedProducts));
    if (typeof populateSimProductSelect === 'function') populateSimProductSelect();
  }
  renderMisProductos();
  showToast('Producto eliminado', '');
}

function toggleMpItem(id) {
  const numId = typeof id === 'string' ? (isNaN(id) ? id : Number(id)) : id;
  if (selectedCatalogItems[numId] !== undefined) {
    delete selectedCatalogItems[numId];
  } else {
    const input = document.querySelector(`#mp_${numId} input[type="number"]`);
    selectedCatalogItems[numId] = input ? parseInt(input.value)||1 : 1;
  }
  renderMisProductos();
}

function setMpQty(id, val) {
  const numId = typeof id === 'string' ? (isNaN(id) ? id : Number(id)) : id;
  if (selectedCatalogItems[numId] !== undefined)
    selectedCatalogItems[numId] = Math.max(1, parseInt(val)||1);
}