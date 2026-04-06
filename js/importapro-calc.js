
// ══════════════════════════════════════════
// IMPORTAPRO JS
// ══════════════════════════════════════════



const NCM_FRECUENTES = [
  {code:'5703.20',desc:'Alfombras de nylon tufted',di:20,badge:'amber'},
  {code:'5703.90',desc:'Alfombras otras fibras tufted',di:20,badge:'amber'},
  {code:'6302.91',desc:'Ropa de cama algodón',di:18,badge:'amber'},
  {code:'3924.90',desc:'Artículos del hogar plástico',di:12,badge:'green'},
  {code:'8516.60',desc:'Hornos microondas',di:0,badge:'green'},
  {code:'6404.19',desc:'Calzado suela goma / cuero',di:35,badge:'red'},
  {code:'8471.30',desc:'Computadoras portátiles',di:0,badge:'green'},
  {code:'9503.00',desc:'Juguetes y juegos',di:20,badge:'amber'},
  {code:'6110.20',desc:'Sweaters y pulóveres algodón',di:35,badge:'red'},
  {code:'8518.30',desc:'Auriculares y headphones',di:20,badge:'amber'},
  {code:'4202.92',desc:'Mochilas y bolsos textil',di:35,badge:'red'},
  {code:'6911.10',desc:'Vajilla de porcelana',di:20,badge:'amber'},
];

let canales = [
  {nombre:'Mercado Libre',comision:13,cuotas:0,precio:32000},
  {nombre:'Tienda propia',comision:3,cuotas:0,precio:28000},
  {nombre:'Instagram / WhatsApp',comision:0,cuotas:0,precio:26000},
];
let savedProducts = JSON.parse(localStorage.getItem('importapro-products')||'[]');

document.addEventListener('DOMContentLoaded',()=>{
  // Adjuntar listeners primero para que nada que falle después los bloquee
  const calcIds=['p-nombre','p-fob','p-fob-cny','p-fob-ars','p-qty','p-cny','p-ars-tc','p-flete','p-seguro-pct','p-aduana','p-trader-pct','p-di','p-iva-imp','p-te','global-tc'];
  calcIds.forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, ()=>{
      if(id==='p-fob-cny'||id==='p-cny'||id==='p-fob-ars'||id==='p-ars-tc') syncCny();
      calc();
    });
  });
  ['sim-costo','sim-margen','sim-iva','sim-iibb','sim-iigg'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',simCalc);});
  ['dist-reinversion','dist-ganancia'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',()=>calcDist());});
  syncCny();
  calc();
  appReady = true;
  // Inicialización opcional (si algo falla aquí no rompe los listeners)
  if(typeof renderNcmFrecuentes==='function') renderNcmFrecuentes();
  populateSimProductSelect();
  const storedKey = typeof getApiKey==='function' ? getApiKey() : '';
  if(storedKey){
    const mainInp = document.getElementById('apikey-input');
    const mobInp  = document.getElementById('apikey-input-mobile');
    if(mainInp) mainInp.value = storedKey;
    if(mobInp)  mobInp.value  = storedKey;
  }
  if(typeof updateApiKeyStatus==='function') updateApiKeyStatus();
  const mobTc = document.getElementById('global-tc-mobile');
  if(mobTc) mobTc.value = document.getElementById('global-tc').value;
});

function setMobileNav(tab){
  document.querySelectorAll('.mnav-btn').forEach(b=>b.classList.toggle('active', b.dataset.mtab===tab));
}

function switchTab(tab){
  document.querySelectorAll('.tab').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const t=document.getElementById('tab-'+tab); if(t)t.classList.add('active');
  const b=document.querySelector(`.nav-item[data-tab="${tab}"]`); if(b)b.classList.add('active');
  setMobileNav(tab);
  window.scrollTo({top:0, behavior:'smooth'});
  if(tab==='products')renderProducts();
  if(tab==='simulator'){populateSimProductSelect();simCalc();}
}

let simSelectedProduct = null;

function populateSimProductSelect(){
  const picker = document.getElementById('sim-prod-picker');
  const emptyEl = document.getElementById('sim-prod-empty');
  if(!picker) return;
  if(savedProducts.length === 0){
    picker.innerHTML = '<div class="prod-picker-empty">No hay productos guardados aún.</div>';
    return;
  }
  picker.innerHTML = savedProducts.map((p, i) => {
    const initial = p.nombre.charAt(0).toUpperCase();
    const isSelected = simSelectedProduct === i;
    return `<div class="prod-pill${isSelected?' selected':''}" onclick="simSelectPill(${i})">
      <div class="prod-pill-avatar">${initial}</div>
      <div>
        <div class="prod-pill-name">${p.nombre}</div>
        <div class="prod-pill-meta">${ars(p.costoARS)}/u · ${p.qty} u</div>
      </div>
    </div>`;
  }).join('');
}

function simSelectPill(idx){
  simSelectedProduct = (simSelectedProduct === idx) ? null : idx;
  populateSimProductSelect();
  if(simSelectedProduct !== null){
    const p = savedProducts[simSelectedProduct];
    document.getElementById('sim-costo').value = p.costoARS;
  }
  simCalc();
}

function simLoadProduct(){ /* legacy stub — replaced by simSelectPill */ }

let currencyMode = 'cny'; // 'cny' | 'usd' | 'ars'
let photoData = [null, null];

let appReady = false;

function setCurrencyMode(mode){
  currencyMode = mode;
  ['cny','usd','ars'].forEach(m => {
    const el = document.getElementById('ctog-'+m);
    if(el) el.classList.toggle('active', m===mode);
  });
  const cnyRow = document.getElementById('input-cny-row');
  const arsRow = document.getElementById('input-ars-row');
  const rateCny = document.getElementById('rate-cny-usd-row');
  const rateArs = document.getElementById('rate-ars-usd-row');
  const fobEl   = document.getElementById('p-fob');
  if(cnyRow)  cnyRow.style.display  = mode==='cny' ? '' : 'none';
  if(arsRow)  arsRow.style.display  = mode==='ars' ? '' : 'none';
  if(rateCny) rateCny.style.display = mode==='cny' ? '' : 'none';
  if(rateArs) rateArs.style.display = mode==='ars' ? '' : 'none';
  if(fobEl){ fobEl.readOnly = mode!=='usd'; fobEl.style.color = mode==='usd'?'var(--text)':'var(--text-3)'; }
  syncCny();
  if(appReady) calc();
}

function syncCny(){
  if(currencyMode==='cny'){
    const cny  = parseFloat(v('p-fob-cny'))||0;
    const rate = parseFloat(v('p-cny'))||0.138;
    document.getElementById('p-fob').value = +(cny*rate).toFixed(3);
  } else if(currencyMode==='ars'){
    const arsVal = parseFloat(v('p-fob-ars'))||0;
    const tc     = parseFloat(v('p-ars-tc'))||1450;
    document.getElementById('p-fob').value = +(arsVal/tc).toFixed(3);
  }
  // usd mode: user types directly into p-fob
}

function syncFobToCny(){
  if(currencyMode!=='usd') return;
  // nothing to back-sync in USD mode
}

function openLink(inputId){
  const url = document.getElementById(inputId)?.value?.trim();
  if(url) window.open(url, '_blank');
  else toast('Ingresá un link primero');
}

function loadPhoto(idx, input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    photoData[idx] = e.target.result;
    document.getElementById(`photo-img-${idx}`).src = e.target.result;
    document.getElementById(`photo-img-${idx}`).style.display = 'block';
    document.getElementById(`photo-ph-${idx}`).style.display = 'none';
    document.getElementById(`photo-del-${idx}`).style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function clearPhoto(idx){
  photoData[idx] = null;
  document.getElementById(`photo-img-${idx}`).style.display = 'none';
  document.getElementById(`photo-ph-${idx}`).style.display = 'flex';
  document.getElementById(`photo-del-${idx}`).style.display = 'none';
  document.getElementById(`photo-input-${idx}`).value = '';
}

function getInputs(){return{fob:parseFloat(v('p-fob'))||0,qty:parseInt(v('p-qty'))||1,flete:parseFloat(v('p-flete'))||0,seguroPct:parseFloat(v('p-seguro-pct'))||0,aduana:parseFloat(v('p-aduana'))||0,traderPct:parseFloat(v('p-trader-pct'))||0,di:parseFloat(v('p-di'))||0,ivaImp:parseFloat(v('p-iva-imp'))||21,te:parseFloat(v('p-te'))||0,tc:parseFloat(v('global-tc'))||1050,cny:parseFloat(v('p-cny'))||0.138};}

function calcCostos(d=getInputs()){
  const fleteUnit=d.flete/d.qty;
  const seguroUnit=d.fob*d.seguroPct/100;
  const traderUnit=d.fob*d.traderPct/100;
  const cif=d.fob+fleteUnit+seguroUnit;
  const diUnit=cif*d.di/100;
  const ivaUnit=(cif+diUnit)*d.ivaImp/100;
  const teUnit=cif*d.te/100;
  const aduanaUnit=d.aduana/d.qty;
  const costoUSD=cif+diUnit+ivaUnit+teUnit+aduanaUnit+traderUnit;
  const costoARS=costoUSD*d.tc;
  return{...d,fleteUnit,seguroUnit,traderUnit,cif,diUnit,ivaUnit,teUnit,aduanaUnit,costoUSD,costoARS};
}

function calc(){
  const c=calcCostos();
  document.getElementById('p-trader-usd').value=rd(c.traderUnit*c.qty,2);
  renderResult(c);
  renderCanales(c.costoARS);
  calcDist(c);
  const simEl=document.getElementById('sim-costo');
  if(simEl)simEl.value=Math.round(c.costoARS);
}

function renderResult(c){
  document.getElementById('res-costo-ars').textContent=ars(c.costoARS);
  document.getElementById('res-costo-usd').textContent=`U$S ${rd(c.costoUSD,2)} · ${c.qty} u = ${ars(c.costoARS*c.qty)} total`;
  const rows=[
    ['Valor FOB (1688)',`U$S ${rd(c.fob,3)}`],
    ['Flete prorrateado',`U$S ${rd(c.fleteUnit,2)}`],
    [`Seguro (${c.seguroPct}%)`,`U$S ${rd(c.seguroUnit,3)}`],
    ['Valor CIF',`U$S ${rd(c.cif,2)}`],
    [`Comisión trader (${c.traderPct}%)`,ars(c.traderUnit*c.tc)],
    [`D.I. (${c.di}%)`,ars(c.diUnit*c.tc)],
    [`IVA imp. (${c.ivaImp}%)`,ars(c.ivaUnit*c.tc)],
    [`Tasa estadística (${c.te}%)`,ars(c.teUnit*c.tc)],
    ['Aduana + transp. interno',ars(c.aduanaUnit*c.tc)],
  ];
  document.getElementById('breakdown').innerHTML=
    rows.map(([l,val])=>`<div class="bd-row"><span class="bd-label">${l}</span><span class="bd-val">${val}</span></div>`).join('')+
    `<div class="bd-row bd-total"><span class="bd-label">Costo unitario total</span><span class="bd-val">${ars(c.costoARS)}</span></div>`;
  const tot=c.costoUSD||1;
  document.getElementById('pct-bars').innerHTML=[
    {label:'Producto (FOB)',pct:c.fob/tot*100,color:'#1a4f8a'},
    {label:'Logística y flete',pct:(c.fleteUnit+c.seguroUnit+c.aduanaUnit)/tot*100,color:'#4a8ac4'},
    {label:`Trader (${c.traderPct}%)`,pct:c.traderUnit/tot*100,color:'#7ba3d4'},
    {label:'Impuestos (DI+IVA+TE)',pct:(c.diUnit+c.ivaUnit+c.teUnit)/tot*100,color:'#c0392b'},
  ].map(b=>`<div class="pct-row">
    <div class="pct-meta"><span class="pct-meta-label">${b.label}</span><span class="pct-meta-val">${rd(b.pct,1)}%</span></div>
    <div class="pct-track"><div class="pct-fill" style="width:${Math.min(b.pct,100)}%;background:${b.color}"></div></div>
  </div>`).join('');
}

let calcTimer = null;
function debouncedCalc(){ clearTimeout(calcTimer); calcTimer = setTimeout(calcOnlyResults, 300); }

function calcOnlyResults(){
  const c = calcCostos();
  document.getElementById('p-trader-usd').value = rd(c.traderUnit * c.qty, 2);
  renderResult(c);
  // Only update the badge/ganancia cells, not the whole table
  canales.forEach((canal, i) => {
    const precio   = canal.precio || 0;
    const comision = precio * (canal.comision || 0) / 100;
    const neto     = precio - comision - (canal.cuotas || 0);
    const ganancia = neto - c.costoARS;
    const margen   = c.costoARS > 0 ? Math.round(ganancia / c.costoARS * 100) : 0;
    const badge    = margen >= 50 ? 'green' : margen >= 20 ? 'amber' : 'red';
    const badgeEl  = document.getElementById(`ch-badge-${i}`);
    const ganEl    = document.getElementById(`ch-gan-${i}`);
    if (badgeEl) badgeEl.innerHTML = `<span class="badge badge-${badge}">${margen}%</span>`;
    if (ganEl)   { ganEl.textContent = ars(ganancia); ganEl.style.color = ganancia >= 0 ? 'var(--green)' : 'var(--red)'; }
  });
  calcDist(c);
  const simEl = document.getElementById('sim-costo');
  if (simEl) simEl.value = Math.round(c.costoARS);
}

function renderCanales(costo){
  const inp=`style="width:100%;padding:7px 9px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font);font-size:13px"`;
  document.getElementById('canales-list').innerHTML=canales.map((canal,i)=>{
    const precio=canal.precio||0;
    const comision=precio*(canal.comision||0)/100;
    const neto=precio-comision-(canal.cuotas||0);
    const ganancia=neto-costo;
    const margen=costo>0?Math.round(ganancia/costo*100):0;
    const badge=margen>=50?'green':margen>=20?'amber':'red';
    return `<div class="ch-row">
      <input class="ch-name-input" value="${canal.nombre}" oninput="canales[${i}].nombre=this.value">
      <input type="number" value="${precio}" id="ch-precio-${i}" ${inp}
        onchange="canales[${i}].precio=+this.value;renderCanales(calcCostos().costoARS);calcOnlyResults()"
        oninput="canales[${i}].precio=+this.value;debouncedCalc()">
      <input type="number" value="${canal.comision}" step="0.5" id="ch-com-${i}" ${inp}
        onchange="canales[${i}].comision=+this.value;renderCanales(calcCostos().costoARS);calcOnlyResults()"
        oninput="canales[${i}].comision=+this.value;debouncedCalc()">
      <input type="number" value="${canal.cuotas||0}" id="ch-cuotas-${i}" ${inp}
        onchange="canales[${i}].cuotas=+this.value;renderCanales(calcCostos().costoARS);calcOnlyResults()"
        oninput="canales[${i}].cuotas=+this.value;debouncedCalc()">
      <span id="ch-badge-${i}"><span class="badge badge-${badge}">${margen}%</span></span>
      <span id="ch-gan-${i}" style="font-weight:600;font-size:13.5px;color:${ganancia>=0?'var(--green)':'var(--red)'}">${ars(ganancia)}</span>
      <button class="del-btn" onclick="removeCanal(${i})">×</button>
    </div>`;
  }).join('');
}

function addCanal(){canales.push({nombre:'Nuevo canal',comision:0,cuotas:0,precio:0});calc();}
function removeCanal(i){canales.splice(i,1);calc();}

function calcDist(c){
  if(!c||c.costoARS===undefined)c=calcCostos();
  const reinvPct=Math.min(100,Math.max(0,parseFloat(v('dist-reinversion'))||40));
  const ganPct=Math.min(100,Math.max(0,parseFloat(v('dist-ganancia'))||40));
  const libre=Math.max(0,100-reinvPct-ganPct);

  // Find ML and Tienda propia channels
  const mlCh  = canales.find(ch=>ch.nombre.toLowerCase().includes('mercado')) || canales[0];
  const tpCh  = canales.find(ch=>ch.nombre.toLowerCase().includes('tienda'))  || canales[1];

  function chanGan(ch){
    if(!ch||!ch.precio)return 0;
    const com=ch.precio*(ch.comision||0)/100;
    const neto=ch.precio-com-(ch.cuotas||0);
    return Math.max(0,neto-c.costoARS);
  }

  const ganML = chanGan(mlCh);
  const ganTP = chanGan(tpCh);

  function distBlock(ganNeta, label, accentColor){
    const reinvARS=ganNeta*reinvPct/100;
    const ganARS=ganNeta*ganPct/100;
    const libreARS=ganNeta*libre/100;
    return `<div style="background:var(--bg-3);border-radius:var(--radius-lg);padding:14px 16px;border:1px solid var(--border)">
      <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${accentColor};margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">${label}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px">
        <div style="grid-column:1/-1"><div class="dm-label">Ganancia neta</div><div style="font-size:20px;font-weight:700;color:var(--text)">${ars(ganNeta)}</div></div>
        <div style="background:var(--accent-dim);border-radius:var(--radius);padding:8px 10px"><div class="dm-label" style="color:var(--accent)">Reinversión ${reinvPct}%</div><div style="font-size:14px;font-weight:700;color:var(--accent)">${ars(reinvARS)}</div></div>
        <div style="background:var(--green-dim);border-radius:var(--radius);padding:8px 10px"><div class="dm-label" style="color:var(--green)">Retiro ${ganPct}%</div><div style="font-size:14px;font-weight:700;color:var(--green)">${ars(ganARS)}</div></div>
        <div style="background:var(--amber-dim);border-radius:var(--radius);padding:8px 10px;grid-column:1/-1"><div class="dm-label" style="color:var(--amber)">Disponible ${rd(libre,1)}%</div><div style="font-size:14px;font-weight:700;color:var(--amber)">${ars(libreARS)} <span style="font-size:11px;font-weight:400">por ${c.qty} u: ${ars(libreARS*c.qty)}</span></div></div>
      </div>
      <div style="display:flex;height:8px;border-radius:5px;overflow:hidden;gap:2px;margin-top:4px">
        <div style="flex:${reinvPct||0.5};background:var(--accent);border-radius:3px;transition:flex 0.4s"></div>
        <div style="flex:${ganPct||0.5};background:var(--green);border-radius:3px;transition:flex 0.4s"></div>
        <div style="flex:${Math.max(libre,0.5)};background:var(--amber);border-radius:3px;transition:flex 0.4s"></div>
      </div>
    </div>`;
  }

  document.getElementById('dist-metrics').innerHTML=
    distBlock(ganML, mlCh ? mlCh.nombre : 'Mercado Libre', 'var(--accent)') +
    '<div style="height:10px"></div>' +
    distBlock(ganTP, tpCh ? tpCh.nombre : 'Tienda propia', 'var(--green)');

  document.getElementById('dist-total-line').textContent='';

  // Shared legend below
  document.getElementById('dist-bar').innerHTML='';
  document.getElementById('dist-bar-legend').innerHTML=[
    ['var(--accent)',`Reinversión ${reinvPct}%`],
    ['var(--green)',`Retiro personal ${ganPct}%`],
    ['var(--amber)',`Disponible ${rd(libre,1)}%`],
  ].map(([col,lbl])=>`<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-2)"><div style="width:10px;height:10px;border-radius:2px;background:${col};flex-shrink:0"></div>${lbl}</div>`).join('');
}

function v(id){return document.getElementById(id)?.value??'';}
function ars(n){return '$'+Math.round(n).toLocaleString('es-AR');}
function rd(n,dec=2){return parseFloat(n.toFixed(dec));}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800);}
