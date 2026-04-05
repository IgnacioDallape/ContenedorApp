function guardarProducto(){
  const c=calcCostos();
  const nombre=v('p-nombre')||'Producto';
  const prod={
    id:Date.now(), nombre,
    fob:c.fob, qty:c.qty,
    costoARS:Math.round(c.costoARS), costoUSD:rd(c.costoUSD,2),
    di:c.di, traderPct:c.traderPct,
    canales:JSON.parse(JSON.stringify(canales)),
    date:new Date().toLocaleDateString('es-AR'),
    link1688: document.getElementById('p-link-1688')?.value?.trim()||'',
    linkML:   document.getElementById('p-link-ml')?.value?.trim()||'',
    photos:   [...photoData],
    currencyMode,
    tipoUnidad: document.getElementById('p-tipo-unidad')?.value || 'box',
    dims: {
      L: parseFloat(document.getElementById('p-dim-l')?.value) || 0,
      W: parseFloat(document.getElementById('p-dim-w')?.value) || 0,
      H: parseFloat(document.getElementById('p-dim-h')?.value) || 0,
    },
    pesoUnit: parseFloat(document.getElementById('p-peso-unit')?.value) || 0,
  };
  const idx=savedProducts.findIndex(p=>p.nombre===nombre);
  if(idx>=0)savedProducts[idx]=prod;else savedProducts.push(prod);
  localStorage.setItem('importapro-products',JSON.stringify(savedProducts));
  populateSimProductSelect();

  // Always sync to cl_catalog (with or without dimensions)
  const clCatalog = JSON.parse(localStorage.getItem('cl_catalog')||'[]');
  const catalogItem = {
    id: prod.id,
    name: prod.nombre,
    type: prod.tipoUnidad || 'box',
    dims: prod.dims,
    weight: prod.pesoUnit || 0,
    price: prod.costoUSD || 0,
    qty: 1,
    source: 'importapro',
    imgUrl: prod.photos && prod.photos[0] ? prod.photos[0] : null,
    link: prod.linkML || prod.link1688 || null,
  };
  const clIdx = clCatalog.findIndex(c=>c.name===prod.nombre);
  if(clIdx>=0) clCatalog[clIdx]=catalogItem; else clCatalog.push(catalogItem);
  localStorage.setItem('cl_catalog', JSON.stringify(clCatalog));
  if(typeof saveCatalog==='function') catalog=clCatalog;
  const hasDims = prod.dims.L && prod.dims.W && prod.dims.H;
  toast(`"${nombre}" guardado en Mis productos${hasDims ? ' ✓' : ' — agregá dimensiones para cargarlo al contenedor'}`);
  switchSection('products');
}

function getApiKey(){ return localStorage.getItem('importapro-apikey')||''; }

function saveApiKey(){
  const key = document.getElementById('apikey-input').value.trim();
  localStorage.setItem('importapro-apikey', key);
  updateApiKeyStatus();
}

function updateApiKeyStatus(){
  const key = getApiKey();
  const update = (elId, textOk, textWarn, textNo) => {
    const el = document.getElementById(elId);
    if(!el) return;
    if(key && key.startsWith('sk-ant-')){ el.textContent='✓ Configurada'; el.style.color='var(--green)'; }
    else if(key){ el.textContent='⚠ Formato inválido'; el.style.color='var(--amber)'; }
    else { el.textContent='Sin configurar'; el.style.color='var(--text-3)'; }
  };
  update('apikey-status');
  update('apikey-status-mobile');
}

function toggleApiKeyVisibility(){
  const inp = document.getElementById('apikey-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function toggleApiKeyVisibilityMobile(){
  const inp = document.getElementById('apikey-input-mobile');
  if(inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

function syncApiKey(source){
  const val = source==='mobile'
    ? document.getElementById('apikey-input-mobile')?.value?.trim()
    : document.getElementById('apikey-input')?.value?.trim();
  localStorage.setItem('importapro-apikey', val||'');
  // sync both inputs
  const main = document.getElementById('apikey-input');
  const mob  = document.getElementById('apikey-input-mobile');
  if(main && source!=='main')   main.value = val||'';
  if(mob  && source!=='mobile') mob.value  = val||'';
  updateApiKeyStatus();
}

function saveApiKey(){
  syncApiKey('main');
}

function getCanalData(p, keyword) {
  const ch = p.canales.find(c => c.nombre.toLowerCase().includes(keyword));
  if (!ch || !ch.precio) return null;
  const com = ch.precio * (ch.comision||0) / 100;
  const gan = ch.precio - com - (ch.cuotas||0) - p.costoARS;
  const margen = p.costoARS > 0 ? Math.round(gan / p.costoARS * 100) : 0;
  return { precio: ch.precio, gan, margen };
}

function renderProducts(){
  const list=document.getElementById('products-list');
  const noEl=document.getElementById('no-products');
  const cmp=document.getElementById('compare-section');
  if(savedProducts.length===0){list.innerHTML='';noEl.style.display='flex';cmp.style.display='none';return;}
  noEl.style.display='none';
  list.innerHTML=savedProducts.map((p,i)=>{
    const ml   = getCanalData(p,'mercado');
    const tp   = getCanalData(p,'tienda');
    const best = p.canales.reduce((a,b)=>(b.precio>a.precio?b:a),{precio:0});
    const bestMargen = best.precio>0?Math.round((best.precio-p.costoARS)/p.costoARS*100):0;
    const topBadge = bestMargen>=50?'green':bestMargen>=20?'amber':'red';

    const chanRow = (label, data, color) => data
      ? `<div style="padding:12px 14px;background:linear-gradient(135deg,rgba(26,79,138,0.08) 0%,rgba(26,79,138,0.04) 100%);border:1px solid rgba(26,79,138,0.08);border-radius:8px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;transition:all 0.2s">
          <div>
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:5px;opacity:0.8">${label}</div>
            <div style="font-size:15px;font-weight:700;color:var(--text)">${ars(data.precio)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="badge badge-${data.margen>=50?'green':data.margen>=20?'amber':'red'}">${data.margen}%</span>
            <div style="font-size:12.5px;font-weight:700;color:${color}">${ars(data.gan)}</div>
          </div>
        </div>`
      : `<div style="padding:11px 14px;background:rgba(26,79,138,0.04);border:1px solid rgba(26,79,138,0.08);border-radius:8px;font-size:12px;color:var(--text-3);font-weight:500">${label} — sin precio</div>`;

    return `<div class="product-card" onclick="loadProduct(${i})">
      <div style="text-align:center;margin-bottom:18px;position:relative">
        <div class="product-name" style="font-size:22px;margin-bottom:8px">${p.nombre}</div>
        <div style="font-size:16px;font-weight:700;color:var(--accent);margin-bottom:6px">${ars(p.costoARS)}</div>
        <div class="product-date" style="font-size:12px;color:var(--text-3);font-weight:500">${p.date} · ${p.qty} unidades</div>
        <span class="badge badge-${topBadge}" style="position:absolute;top:0;right:0">${bestMargen}%</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
        ${chanRow('Mercado Libre', ml, 'var(--green)')}
        ${chanRow('Tienda propia', tp, 'var(--accent)')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px;border-top:1px solid rgba(26,79,138,0.06);min-width:0">
        <div class="product-metric" style="min-width:0;overflow:hidden;text-align:center"><div class="pm-label">FOB 1688</div><div class="pm-value" style="font-size:16px">U$S ${p.fob}</div></div>
        <div class="product-metric" style="min-width:0;overflow:hidden;text-align:center"><div class="pm-label">DI aplicado</div><div class="pm-value" style="font-size:16px">${p.di}%</div></div>
      </div>
      <div class="product-actions" onclick="event.stopPropagation()">
        ${p.link1688?`<a href="${p.link1688}" target="_blank" class="btn-outline" style="text-decoration:none">1688 ↗</a>`:''}
        ${p.linkML?`<a href="${p.linkML}" target="_blank" class="btn-outline" style="text-decoration:none">ML ↗</a>`:''}
        <button class="btn-outline" onclick="loadProduct(${i})">Editar</button>
        ${(p.dims&&p.dims.L&&p.dims.W&&p.dims.H)
          ? `<span class="badge badge-green" style="margin-left:auto">📦 En catálogo</span>`
          : `<span style="font-size:11px;color:var(--text-3);padding:6px 0;font-weight:500">Sin dimensiones</span>`}
        <button class="del-btn" onclick="deleteProduct(${i})">× Eliminar</button>
      </div>
      ${(p.photos&&(p.photos[0]||p.photos[1]))?`<div style="display:flex;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(26,79,138,0.06)">
        ${p.photos[0]?`<img src="${p.photos[0]}" style="width:90px;height:75px;object-fit:cover;border-radius:8px;border:1px solid rgba(26,79,138,0.1);transition:all 0.2s;cursor:pointer" title="Foto 1688">`:''}
        ${p.photos[1]?`<img src="${p.photos[1]}" style="width:90px;height:75px;object-fit:cover;border-radius:8px;border:1px solid rgba(26,79,138,0.1);transition:all 0.2s;cursor:pointer" title="Foto ML">`:''}
      </div>`:''}
    </div>`;
  }).join('');
  if(savedProducts.length>=2){cmp.style.display='block';renderCompare();}else cmp.style.display='none';
}

function loadProduct(i){
  const p=savedProducts[i];
  document.getElementById('p-nombre').value=p.nombre;
  document.getElementById('p-fob').value=p.fob;
  document.getElementById('p-qty').value=p.qty;
  document.getElementById('p-di').value=p.di;
  if(p.traderPct!==undefined)document.getElementById('p-trader-pct').value=p.traderPct;
  if(p.link1688!==undefined) document.getElementById('p-link-1688').value=p.link1688;
  if(p.linkML!==undefined)   document.getElementById('p-link-ml').value=p.linkML;
  // Restore logistic dims
  if(p.tipoUnidad) setTipoUnidad(p.tipoUnidad);
  if(p.dims) {
    document.getElementById('p-dim-l').value = p.dims.L || '';
    document.getElementById('p-dim-w').value = p.dims.W || '';
    document.getElementById('p-dim-h').value = p.dims.H || '';
  }
  if(p.pesoUnit !== undefined) document.getElementById('p-peso-unit').value = p.pesoUnit || '';
  // Restore photos
  photoData=[null,null];
  [0,1].forEach(idx=>{
    const src=p.photos&&p.photos[idx];
    if(src){
      photoData[idx]=src;
      document.getElementById(`photo-img-${idx}`).src=src;
      document.getElementById(`photo-img-${idx}`).style.display='block';
      document.getElementById(`photo-ph-${idx}`).style.display='none';
      document.getElementById(`photo-del-${idx}`).style.display='flex';
    } else { clearPhoto(idx); }
  });
  setCurrencyMode(p.currencyMode||'cny');
  canales=JSON.parse(JSON.stringify(p.canales));
  switchSection('calc'); calc();
}

// ── TIPO DE UNIDAD (logística) ──
const PALLET_SIZES_IP = { euro:{L:120,W:80}, eua:{L:120,W:100} };

function setTipoUnidad(tipo) {
  document.getElementById('p-tipo-unidad').value = tipo;
  const btnBox = document.getElementById('btn-tipo-box');
  const btnPallet = document.getElementById('btn-tipo-pallet');
  const palletOpts = document.getElementById('pallet-options');
  const dimsSection = document.getElementById('dims-section');
  if (tipo === 'pallet') {
    btnPallet.style.background = 'var(--accent)';
    btnPallet.style.color = '#fff';
    btnPallet.style.borderColor = 'var(--accent)';
    btnBox.style.background = 'transparent';
    btnBox.style.color = 'var(--text-2)';
    btnBox.style.borderColor = 'var(--border-2)';
    palletOpts.style.display = 'block';
    syncPalletDims();
  } else {
    btnBox.style.background = 'var(--accent)';
    btnBox.style.color = '#fff';
    btnBox.style.borderColor = 'var(--accent)';
    btnPallet.style.background = 'transparent';
    btnPallet.style.color = 'var(--text-2)';
    btnPallet.style.borderColor = 'var(--border-2)';
    palletOpts.style.display = 'none';
    // Re-enable dims for manual entry
    ['p-dim-l','p-dim-w'].forEach(id => document.getElementById(id).readOnly = false);
  }
}

function onPalletTypeChange() {
  syncPalletDims();
}

function syncPalletDims() {
  const type = document.getElementById('p-pallet-type').value;
  const h = parseInt(document.getElementById('p-pallet-height').value) || 120;
  if (type !== 'custom') {
    const sz = PALLET_SIZES_IP[type];
    document.getElementById('p-dim-l').value = sz.L;
    document.getElementById('p-dim-w').value = sz.W;
    document.getElementById('p-dim-l').readOnly = true;
    document.getElementById('p-dim-w').readOnly = true;
  } else {
    document.getElementById('p-dim-l').readOnly = false;
    document.getElementById('p-dim-w').readOnly = false;
  }
  document.getElementById('p-dim-h').value = h;
  document.getElementById('p-dim-h').readOnly = type !== 'custom';
}

function enviarAlContenedor(i) {
  const p = savedProducts[i];
  if (!p.dims || !p.dims.L || !p.dims.W || !p.dims.H) {
    toast('Completá las dimensiones del producto antes de cargarlo al contenedor.'); return;
  }
  // Use Container Loader's catalog key
  const catalogKey = 'cl_catalog';
  let catalog = JSON.parse(localStorage.getItem(catalogKey) || '[]');
  const item = {
    id: p.id || Date.now(),
    name: p.nombre,
    type: p.tipoUnidad || 'box',
    dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
    weight: p.pesoUnit || 0,
    price: p.costoUSD || 0,
    qty: 1,
    source: 'importapro',
    imgUrl: p.photos && p.photos[0] ? p.photos[0] : null,
  };
  const existing = catalog.findIndex(c => c.name === p.nombre);
  if (existing >= 0) catalog[existing] = item;
  else catalog.push(item);
  localStorage.setItem(catalogKey, JSON.stringify(catalog));
  toast(`"${p.nombre}" agregado al catálogo del Container Loader ✓`);
}

function deleteProduct(i){
  const nombre = savedProducts[i]?.nombre;
  if(simSelectedProduct===i) simSelectedProduct=null;
  else if(simSelectedProduct>i) simSelectedProduct--;
  savedProducts.splice(i,1);
  localStorage.setItem('importapro-products',JSON.stringify(savedProducts));
  // Sync: también elimina de cl_catalog
  if(nombre){
    const clCatalog=JSON.parse(localStorage.getItem('cl_catalog')||'[]').filter(c=>c.name!==nombre);
    localStorage.setItem('cl_catalog',JSON.stringify(clCatalog));
    if(typeof catalog!=='undefined') catalog=clCatalog;
    if(typeof renderMisProductos==='function') renderMisProductos();
  }
  populateSimProductSelect();
  renderProducts();
}

function renderCompare(){
  const rows=savedProducts.map(p=>{
    const best=p.canales.reduce((a,b)=>(b.precio>a.precio?b:a),{precio:0,nombre:''});
    const margen=best.precio>0?Math.round((best.precio-p.costoARS)/p.costoARS*100):0;
    const badge=margen>=50?'green':margen>=20?'amber':'red';
    return `<tr><td><strong>${p.nombre}</strong><br><span style="font-size:11px;color:var(--text-3)">${p.qty} u · DI ${p.di}%</span></td><td>${ars(p.costoARS)}</td><td>${ars(p.costoARS*p.qty)}</td><td>${ars(best.precio)}<br><span style="font-size:11px;color:var(--text-3)">${best.nombre}</span></td><td><span class="badge badge-${badge}">${margen}%</span></td></tr>`;
  }).join('');
  document.getElementById('compare-table').innerHTML=`<thead><tr><th>Producto</th><th>Costo/u</th><th>Costo total</th><th>Mejor precio</th><th>Margen</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderNcmFrecuentes(){
  document.getElementById('ncm-frecuentes').innerHTML=NCM_FRECUENTES.map(n=>
    `<div class="ncm-row"><span class="ncm-desc">${n.code} — ${n.desc}</span><span class="badge badge-${n.badge}">DI ${n.di}%</span></div>`
  ).join('');
}

// NCM knowledge base — cubre los productos más comunes de importación China → Argentina