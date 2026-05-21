import { useMemo, useRef, useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import useContainerStore from '../../stores/containerStore.js';
import { ars, rd } from '../../lib/formatters.js';
import { PALLET_SIZES } from '../../lib/constants.js';
import { exportCotizacionPDF } from '../../lib/exportPDF.js';

export function calcCostos(inp) {
  const fob             = parseFloat(inp.fob)           || 0;
  const qty             = parseInt(inp.qty)              || 1;
  const fleteMode       = inp.fleteMode || 'manual';
  const manualFlete     = parseFloat(inp.flete)          || 0;
  const seguroPct       = parseFloat(inp.seguroPct)      || 0;
  const despachante     = parseFloat(inp.despachante)    || parseFloat(inp.aduana) || 0; // backward compat
  const fleteInterno    = parseFloat(inp.fleteInterno)   || 0;
  const traderPct       = parseFloat(inp.traderPct)      || 0;
  const di              = parseFloat(inp.di)             || 0;
  const ivaImp          = parseFloat(inp.ivaImp)         || 21;
  const te              = parseFloat(inp.te)             || 0;
  const tc              = parseFloat(inp.globalTC)       || 1359;
  const fleteUnit       = fleteMode === 'fob36' ? fob * 0.36 : manualFlete / qty;
  const flete           = fleteUnit * qty;
  const seguroUnit      = fob * seguroPct / 100;
  const traderUnit      = fob * traderPct / 100;
  const cif             = fob + fleteUnit + seguroUnit;
  const diUnit          = cif * di / 100;
  const ivaUnit         = (cif + diUnit) * ivaImp / 100;
  const teUnit          = cif * te / 100;
  const despachanteUnit = despachante / qty;
  const fleteInternoUnit = fleteInterno / qty;
  const aduanaUnit      = despachanteUnit + fleteInternoUnit;
  const costoUSD        = cif + diUnit + ivaUnit + teUnit + aduanaUnit + traderUnit;
  const costoARS        = costoUSD * tc;
  return { fob, qty, flete, fleteMode, seguroPct, despachante, fleteInterno, traderPct, di, ivaImp, te, tc,
           fleteUnit, seguroUnit, traderUnit, cif, diUnit, ivaUnit, teUnit,
           despachanteUnit, fleteInternoUnit, aduanaUnit, costoUSD, costoARS };
}

export default function Calculator() {
  const { inputs, setInputs, canales, saveProduct, loadedProductName, tcUpdatedAt } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();
  const { addToCatalog } = useContainerStore();

  const [distReinv, setDistReinv] = useState(40);
  const [distGan,   setDistGan]   = useState(40);

  const c = useMemo(() => calcCostos(inputs), [inputs]);
  const logisticsUnitLabel = inputs.tipoUnidad === 'pallet' ? 'pallet logístico' : 'caja logística';
  const logisticsUnitShortLabel = inputs.tipoUnidad === 'pallet' ? 'pallet' : 'caja';
  const purchaseContextCopy = inputs.tipoUnidad === 'pallet'
    ? 'Acá cargás el valor de 1 unidad del producto. El pallet completo se define abajo.'
    : 'Acá cargás el valor de 1 unidad del producto. Si una caja trae varias unidades, ese embalaje se define abajo.';
  const logisticsContextCopy = inputs.tipoUnidad === 'pallet'
    ? 'Acá definís el pallet logístico completo: peso total y medidas del pallet.'
    : 'Acá definís la caja logística: peso y medidas de la caja, no de la unidad individual.';

  // Sync FOB when currency mode changes
  function syncFob(patch) {
    const merged = { ...inputs, ...patch };
    let fob = parseFloat(merged.fob) || 0;
    if (merged.currencyMode === 'cny') {
      fob = +(parseFloat(merged.fobCny || 0) * parseFloat(merged.cny || 0.138)).toFixed(3);
    } else if (merged.currencyMode === 'ars') {
      fob = +(parseFloat(merged.fobArs || 0) / parseFloat(merged.arsTC || 1450)).toFixed(3);
    }
    setInputs({ ...patch, fob });
  }

  function handlePalletTypeChange(type) {
    if (type === 'custom') { setInputs({ palletType: type }); return; }
    const sz = PALLET_SIZES[type];
    setInputs({ palletType: type, dimL: sz.L, dimW: sz.W });
  }

  function syncPalletDims() {
    if (inputs.palletType !== 'custom') {
      const sz = PALLET_SIZES[inputs.palletType] || PALLET_SIZES.euro;
      setInputs({ dimL: sz.L, dimW: sz.W });
    }
  }

  async function handleSaveProduct() {
    if (!inputs.nombre) { showToast('Ingresá el nombre del producto', 'error'); return; }
    if (!(parseFloat(inputs.pesoUnit) > 0)) { showToast(`Ingresá el peso por ${logisticsUnitShortLabel} (debe ser mayor a 0)`, 'error'); return; }
    const prod = {
      id:        Date.now(),
      nombre:    inputs.nombre,
      fob:       c.fob,
      qty:       c.qty,
      costoARS:  Math.round(c.costoARS),
      costoUSD:  rd(c.costoUSD, 2),
      di:        c.di,
      ivaImp:    c.ivaImp,
      te:        c.te,
      traderPct: c.traderPct,
      flete:     parseFloat(inputs.flete)        || 0,
      fleteMode: inputs.fleteMode || 'manual',
      seguroPct: parseFloat(inputs.seguroPct)    || 0,
      despachante:   parseFloat(inputs.despachante)   || 0,
      fleteInterno:  parseFloat(inputs.fleteInterno)  || 0,
      canales:   JSON.parse(JSON.stringify(canales)),
      date:      new Date().toLocaleDateString('es-AR'),
      link1688:  inputs.link1688 || '',
      linkML:    inputs.linkML || '',
      photos:    [...(inputs.photos || [null, null])],
      currencyMode: inputs.currencyMode,
      tipoUnidad:   inputs.tipoUnidad || 'box',
      dims: {
        L: parseFloat(inputs.dimL) || 0,
        W: parseFloat(inputs.dimW) || 0,
        H: parseFloat(inputs.dimH) || 0,
      },
      pesoUnit: parseFloat(inputs.pesoUnit) || 0,
    };
    const updated = saveProduct(prod);

    // Sync to catalog
    const hasDims = prod.dims.L && prod.dims.W && prod.dims.H;
    if (hasDims) {
      addToCatalog({
        id:     prod.id,
        name:   prod.nombre,
        type:   prod.tipoUnidad || 'box',
        dims:   prod.dims,
        weight: prod.pesoUnit || 0,
        price:  prod.costoUSD || 0,
        qty:    1,
        source: 'importapro',
        imgUrl: prod.photos?.[0] || null,
        link:   prod.linkML || prod.link1688 || null,
      });
    }
    showToast(`"${prod.nombre}" guardado${hasDims ? ' ✓' : ' — agregá dimensiones para cargarlo al contenedor'}`);
    setActiveSection('products');
  }

  function loadPhotoFile(idx, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const photos = [...(inputs.photos || [null, null])];
      photos[idx] = e.target.result;
      setInputs({ photos });
    };
    reader.readAsDataURL(file);
  }

  function setPhotoData(idx, dataUrl) {
    const photos = [...(inputs.photos || [null, null])];
    photos[idx] = dataUrl;
    setInputs({ photos });
  }

  function handlePhotoPaste(idx, event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type?.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = e => {
      setPhotoData(idx, e.target.result);
      showToast('Captura pegada en la foto', 'success');
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto(idx) {
    const photos = [...(inputs.photos || [null, null])];
    photos[idx] = null;
    setInputs({ photos });
  }

  const distLibre = Math.max(0, 100 - distReinv - distGan);
  function chanGan(ch) {
    if (!ch || !ch.precio) return 0;
    const com = ch.precio * (ch.comision || 0) / 100;
    const neto = ch.precio - com - (ch.cuotas || 0);
    return neto - c.costoARS;
  }

  const tot = c.costoUSD || 1;
  const breakdown = [
    ['Valor FOB (1688)',             `U$S ${rd(c.fob, 3)}`],
    [c.fleteMode === 'fob36' ? 'Flete (36% FOB)' : 'Flete prorrateado', `U$S ${rd(c.fleteUnit, 2)}`],
    [`Seguro (${c.seguroPct}%)`,     `U$S ${rd(c.seguroUnit, 3)}`],
    ['Valor CIF',                    `U$S ${rd(c.cif, 2)}`],
    [`Comisión trader (${c.traderPct}%)`, `U$S ${rd(c.traderUnit, 3)}`],
    [`D.I. (${c.di}%)`,             `U$S ${rd(c.diUnit, 2)}`],
    [`IVA imp. (${c.ivaImp}%)`,     `U$S ${rd(c.ivaUnit, 2)}`],
    [`Tasa estadística (${c.te}%)`, `U$S ${rd(c.teUnit, 3)}`],
    ['Despachante / aduana',         `U$S ${rd(c.despachanteUnit, 2)}`],
    ['Flete interno / puerto',       `U$S ${rd(c.fleteInternoUnit, 2)}`],
  ];
  const pctBars = [
    { label:'FOB',                    pct: c.fob/tot*100,                                              color:'#1a4f8a' },
    { label:'Flete int.',             pct: (c.fleteUnit+c.seguroUnit)/tot*100,                         color:'#4a8ac4' },
    { label:'Despachante',            pct: c.despachanteUnit/tot*100,                                  color:'#6b9b8b' },
    { label:'Flete interno',          pct: c.fleteInternoUnit/tot*100,                                 color:'#5b8b7b' },
    { label:`Trader`,                 pct: c.traderUnit/tot*100,                                       color:'#7ba3d4' },
    { label:'Impuestos',              pct: (c.diUnit+c.ivaUnit+c.teUnit)/tot*100,                      color:'#c0392b' },
  ];

  return (
    <div className="ip-section active" id="section-calc">
      <section id="tab-calc" className="tab" style={{ display:'block' }}>
        {loadedProductName && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:8, padding:'9px 14px', marginBottom:16 }}>
            <span style={{ fontSize:18 }}>📦</span>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Producto cargado</span>
              <span style={{ fontSize:13, color:'var(--text)', fontWeight:600, marginLeft:8 }}>{loadedProductName}</span>
            </div>
            <span style={{ fontSize:11, color:'var(--text-3)' }}>Editando · los cambios no se guardan automáticamente</span>
          </div>
        )}
        <div className="page-header">
          <h1>{inputs.nombre ? inputs.nombre : 'Calculadora de costos'}</h1>
          <p className="page-sub">Costo real de importar desde 1688 a Argentina, incluyendo impuestos, logística y trader</p>
        </div>

        <div>
          <div className="col">
            {/* Alerta TC desactualizado */}
            {(() => {
              const stale = !tcUpdatedAt || (Date.now() - tcUpdatedAt > 3 * 24 * 60 * 60 * 1000);
              if (!stale) return null;
              return (
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'#7c5c3220', border:'1px solid #7c5c3240', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:11 }}>
                  <span>⏰</span>
                  <span style={{ color:'var(--text-2)' }}>TC: <strong>${inputs.globalTC?.toLocaleString('es-AR')}</strong> — {tcUpdatedAt ? 'hace más de 3 días' : 'nunca actualizado'}</span>
                  <span style={{ color:'var(--text-3)', marginLeft:4 }}>· Actualizalo en</span>
                  <button onClick={() => useAppStore.getState().setActiveSection('settings')}
                    style={{ background:'none', border:'none', color:'var(--accent)', fontWeight:700, cursor:'pointer', fontSize:11, padding:0 }}>Configuración →</button>
                </div>
              );
            })()}
            {/* ── Datos del producto ── */}
            <div className="card">
              <div className="card-header"><span className="card-title">Datos del producto</span></div>
              <div className="form-grid-2" style={{ marginBottom: 14 }}>
                <div className="field full">
                  <label>Nombre del producto</label>
                  <input type="text" id="p-nombre" value={inputs.nombre}
                    onChange={e => setInputs({ nombre: e.target.value })} />
                </div>
              </div>
              <CalcSection id="calc-fob" color="#4a7dc1" label="Precio de compra" style={{ marginBottom: 4 }}>
                <div className="form-grid-2">
                  <div className="field full">
                    <label>Moneda del precio de compra</label>
                    <div className="currency-toggle">
                      {['cny','usd','ars'].map(m => (
                        <button key={m} className={`ctog-btn${inputs.currencyMode===m?' active':''}`}
                          onClick={() => syncFob({ currencyMode: m })}>
                          {m==='cny'?'Yuan (CNY)':m==='usd'?'Dólar (USD)':'Pesos (ARS)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field full">
                    <div className="hint" style={{ marginTop: -2, fontSize: 12.5, lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text-2)' }}>Importante:</strong> {purchaseContextCopy}
                    </div>
                  </div>
                  {inputs.currencyMode === 'cny' && (
                    <div className="field">
                      <label>Precio 1688 por producto <span className="unit">CNY / unidad de producto</span></label>
                      <input type="number" id="p-fob-cny" value={inputs.fobCny} step="0.1" min="0"
                        onChange={e => syncFob({ fobCny: parseFloat(e.target.value)||0 })} />
                    </div>
                  )}
                  {inputs.currencyMode === 'ars' && (
                    <div className="field">
                      <label>Precio de compra por producto <span className="unit">ARS / unidad de producto</span></label>
                      <input type="number" id="p-fob-ars" value={inputs.fobArs} step="100" min="0"
                        onChange={e => syncFob({ fobArs: parseFloat(e.target.value)||0 })} />
                    </div>
                  )}
                  <div className="field">
                    <label>Equivalente por producto <span className="unit">USD / unidad de producto</span></label>
                    <input type="number" id="p-fob" value={inputs.fob} step="0.01" min="0"
                      readOnly={inputs.currencyMode !== 'usd'}
                      style={{ color: inputs.currencyMode === 'usd' ? 'var(--text)' : 'var(--text-3)' }}
                      onChange={inputs.currencyMode === 'usd' ? e => setInputs({ fob: parseFloat(e.target.value)||0 }) : undefined} />
                  </div>
                  <div className="field">
                    <label>Cantidad de producto <span className="unit">unidades finales</span></label>
                    <input type="number" id="p-qty" value={inputs.qty} min="1"
                      onChange={e => setInputs({ qty: parseInt(e.target.value)||1 })} />
                  </div>
                  {inputs.currencyMode === 'cny' && (
                    <div className="field">
                      <label>Cotización CNY → USD</label>
                      <input type="number" id="p-cny" value={inputs.cny} step="0.001" min="0"
                        onChange={e => syncFob({ cny: parseFloat(e.target.value)||0.138 })} />
                    </div>
                  )}
                  {inputs.currencyMode === 'ars' && (
                    <div className="field">
                      <label>Cotización ARS → USD <span className="unit">ref. por defecto $1.450</span></label>
                      <input type="number" id="p-ars-tc" value={inputs.arsTC} step="10" min="1"
                        onChange={e => syncFob({ arsTC: parseFloat(e.target.value)||1450 })} />
                    </div>
                  )}
                </div>
              </CalcSection>

              <div className="divider"/>
              <div className="section-label" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span>📦 Datos logísticos</span>
                <span style={{ fontSize:10, fontWeight:600, background:'var(--accent)', color:'#fff', padding:'2px 8px', borderRadius:10, letterSpacing:'0.05em' }}>Container Loader</span>
              </div>
              <div className="form-grid-2">
                <div className="field">
                  <label>Tipo de unidad logística</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {[['box','📦 Caja'],['pallet','🟫 Pallet']].map(([t, lbl]) => (
                      <button key={t} type="button"
                        style={{ flex:1, padding:'9px 12px', borderRadius:'var(--radius)', border:`1.5px solid ${inputs.tipoUnidad===t?'var(--accent)':'var(--border-2)'}`, background: inputs.tipoUnidad===t?'var(--accent)':'transparent', color: inputs.tipoUnidad===t?'#fff':'var(--text-2)', fontFamily:'var(--font)', fontSize:13, fontWeight: inputs.tipoUnidad===t?600:500, cursor:'pointer', transition:'all 0.15s' }}
                        onClick={() => setInputs({ tipoUnidad: t })}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    {inputs.tipoUnidad === 'pallet'
                      ? 'Cargá precio, cantidad, peso y medidas por pallet completo.'
                      : 'Cargá precio, cantidad, peso y medidas por caja. Si tu producto viaja suelto, tomá cada pieza como una caja/unidad logística.'}
                  </div>
                  <div className="hint" style={{ marginTop: 8, lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--text-2)' }}>Resumen:</strong> {logisticsContextCopy}
                  </div>
                  <input type="hidden" id="p-tipo-unidad" value={inputs.tipoUnidad} />
                </div>
                <div className="field">
                  <label>Peso por {logisticsUnitLabel} <span className="unit">kg</span></label>
                  <input type="number" id="p-peso-unit" value={inputs.pesoUnit || ''} placeholder="0.0" min="0" step="0.1"
                    onChange={e => setInputs({ pesoUnit: parseFloat(e.target.value)||0 })} />
                </div>
              </div>

              {inputs.tipoUnidad === 'pallet' && (
                <div id="pallet-options">
                  <div className="form-grid-2" style={{ marginBottom:14 }}>
                    <div className="field">
                      <label>Tipo de pallet</label>
                      <select id="p-pallet-type" value={inputs.palletType}
                        onChange={e => handlePalletTypeChange(e.target.value)}>
                        <option value="euro">Euro Pallet — 120×80 cm</option>
                        <option value="eua">Pallet EUA — 120×100 cm</option>
                        <option value="custom">Personalizado</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Altura con carga <span className="unit">cm</span></label>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <input type="range" id="p-pallet-height" min="30" max="220" value={inputs.palletHeight || 120}
                          style={{ flex:1, accentColor:'var(--accent)' }}
                          onChange={e => { const h = parseInt(e.target.value); setInputs({ palletHeight: h, dimH: h }); syncPalletDims(); }} />
                        <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)', whiteSpace:'nowrap', minWidth:48 }}>
                          {inputs.palletHeight || 120} cm
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div id="dims-section">
                <div className={inputs.tipoUnidad === 'pallet' ? 'form-grid-2' : 'form-grid-3'}>
                  <div className="field"><label>Largo por {logisticsUnitLabel} <span className="unit">cm</span></label>
                    <input type="number" id="p-dim-l" value={inputs.dimL||''} placeholder="60" min="1" step="0.5"
                      onChange={e => setInputs({ dimL: e.target.value })} /></div>
                  <div className="field"><label>Ancho por {logisticsUnitLabel} <span className="unit">cm</span></label>
                    <input type="number" id="p-dim-w" value={inputs.dimW||''} placeholder="40" min="1" step="0.5"
                      onChange={e => setInputs({ dimW: e.target.value })} /></div>
                  {inputs.tipoUnidad !== 'pallet' && (
                    <div className="field"><label>Alto por {logisticsUnitLabel} <span className="unit">cm</span></label>
                      <input type="number" id="p-dim-h" value={inputs.dimH||''} placeholder="30" min="1" step="0.5"
                        onChange={e => setInputs({ dimH: e.target.value })} /></div>
                  )}
                </div>
              </div>

              <div className="divider"/>
              {/* ── Referencias + Fotos integradas ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560, margin: '0 auto' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Referencias y fotos</div>

                {[
                  { id:'p-link-1688', photoIdx:0, key:'link1688', label:'1688', color:'#6b9b8b', placeholder:'https://detail.1688.com/...', hint:'Origen' },
                  { id:'p-link-ml',   photoIdx:1, key:'linkML',   label:'ML',   color:'#4a7dc1', placeholder:'https://articulo.mercadolibre.com.ar/...', hint:'Local' },
                ].map(({ id, photoIdx, key, label, color, placeholder, hint }) => {
                  const hasVal   = !!(inputs[key]);
                  const hasPhoto = !!(inputs.photos?.[photoIdx]);
                  return (
                    <div
                      key={key}
                      onPaste={e => handlePhotoPaste(photoIdx, e)}
                      title="Podés pegar una captura con Ctrl + V"
                      style={{ display:'flex', alignItems:'stretch', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--bg)' }}
                    >
                      {/* Platform badge */}
                      <div style={{ background: color, padding:'0 13px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, minWidth:46 }}>
                        <span style={{ fontSize:9, fontWeight:800, color:'#fff', letterSpacing:'0.05em', lineHeight:1 }}>{label}</span>
                        <span style={{ fontSize:8, color:'rgba(255,255,255,0.7)', marginTop:2, lineHeight:1 }}>{hint}</span>
                      </div>
                      {/* URL input */}
                      <input
                        type="url" id={id} value={inputs[key]||''} placeholder={placeholder}
                        style={{ flex:1, border:'none', background:'transparent', padding:'10px 12px', fontFamily:'var(--font)', fontSize:12, color:'var(--text)', outline:'none', minWidth:0 }}
                        onChange={e => setInputs({ [key]: e.target.value })}
                      />
                      {/* Photo slot integrado */}
                      <div
                        onClick={() => document.getElementById(`photo-input-${photoIdx}`).click()}
                        title={hasPhoto ? 'Cambiar foto o pegar captura' : 'Subir foto o pegar captura'}
                        style={{ width:44, borderLeft:'1px solid var(--border-2)', cursor:'pointer', position:'relative', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: hasPhoto ? 'transparent' : 'var(--bg-3)', transition:'background 0.15s' }}
                      >
                        {hasPhoto ? (
                          <>
                            <img src={inputs.photos[photoIdx]} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                            <button
                              onClick={e => { e.stopPropagation(); clearPhoto(photoIdx); }}
                              style={{ position:'absolute', top:2, right:2, width:16, height:16, borderRadius:'50%', background:'rgba(0,0,0,0.6)', border:'none', color:'#fff', fontSize:10, lineHeight:'16px', textAlign:'center', cursor:'pointer', padding:0 }}
                            >×</button>
                          </>
                        ) : (
                          <span style={{ fontSize:16, lineHeight:1, userSelect:'none' }}>📷</span>
                        )}
                        <input type="file" id={`photo-input-${photoIdx}`} accept="image/*" style={{ display:'none' }}
                          onChange={e => loadPhotoFile(photoIdx, e.target.files[0])} />
                      </div>
                      {/* Open link button */}
                      <button
                        onClick={() => hasVal && window.open(inputs[key],'_blank')}
                        style={{ flexShrink:0, width:38, border:'none', borderLeft:'1px solid var(--border-2)', background: hasVal ? `${color}18` : 'transparent', color: hasVal ? color : 'var(--border)', fontSize:hasVal ? 16 : 13, cursor: hasVal ? 'pointer' : 'default', transition:'all 0.15s', display:'flex', alignItems:'center', justifyContent:'center' }}
                        title={hasVal ? 'Abrir enlace' : 'Sin enlace'}
                      >{hasVal ? '✓' : '↗'}</button>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                  Podés cargar una imagen desde archivos o pegar una captura con <strong>Ctrl + V</strong> sobre cada fila.
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Logística e importación ── */}
        <div className="calc-split-grid" style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr)', gap:'1.5rem', marginTop:'1.5rem', alignItems:'start' }}>

          {/* ── Logística ── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Logística e importación</span>
              <button className="btn-text" onClick={() => setActiveSection('ncm')}>Buscar NCM →</button>
            </div>
            {/* 2-col grid: [Flete | Despacho] / [Trader | Aranceles] */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'start' }}>

              {/* Col 1 fila 1: Flete */}
              <CalcSection id="calc-flete" color="#4a8ac4" label="Flete internacional">
                <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                  {[['manual','Carga manual'],['fob36','36% FOB']].map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => setInputs({ fleteMode: mode })}
                      style={{ padding:'6px 10px', borderRadius:'var(--radius)', border:`1.5px solid ${inputs.fleteMode===mode?'var(--accent)':'var(--border-2)'}`, background:inputs.fleteMode===mode?'var(--accent)':'transparent', color:inputs.fleteMode===mode?'#fff':'var(--text-2)', fontFamily:'var(--font)', fontSize:12, fontWeight:inputs.fleteMode===mode?600:500, cursor:'pointer', transition:'all 0.15s' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="form-grid-2">
                  <div className="field">
                    <label>{inputs.fleteMode==='fob36'?'Flete estimado':'Flete total'} <span className="unit">USD</span></label>
                    <input type="number" id="p-flete" value={inputs.fleteMode==='fob36'?rd(c.flete,2):inputs.flete} min="0"
                      readOnly={inputs.fleteMode==='fob36'} style={{ color:inputs.fleteMode==='fob36'?'var(--text-3)':'var(--text)' }}
                      onChange={e => setInputs({ flete: parseFloat(e.target.value)||0 })} />
                  </div>
                  <div className="field">
                    <label>Seguro <span className="unit">%</span></label>
                    <input type="number" id="p-seguro-pct" value={inputs.seguroPct} step="0.1" min="0"
                      onChange={e => setInputs({ seguroPct: parseFloat(e.target.value)||0 })} />
                  </div>
                </div>
                {inputs.fleteMode==='fob36' && (
                  <div style={{ fontSize:10, color:'var(--text-3)', marginTop:6, padding:'5px 8px', background:'var(--bg-3)', borderRadius:5, borderLeft:'3px solid #4a8ac4' }}>
                    Flete unitario: U$S {rd(c.fleteUnit,2)}
                  </div>
                )}
              </CalcSection>

              {/* Col 2 fila 1: Despacho */}
              <CalcSection id="calc-despacho" color="#6b9b8b" label="Despacho y flete interno">
                <div className="form-grid-2">
                  <div className="field">
                    <label>Despachante / aduana <span className="unit">USD total</span></label>
                    <input type="number" id="p-despachante" value={inputs.despachante ?? inputs.aduana ?? 0} min="0"
                      onChange={e => setInputs({ despachante: parseFloat(e.target.value)||0 })} />
                  </div>
                  <div className="field">
                    <label>Flete interno / puerto <span className="unit">USD total</span></label>
                    <input type="number" id="p-flete-interno" value={inputs.fleteInterno||0} min="0"
                      onChange={e => setInputs({ fleteInterno: parseFloat(e.target.value)||0 })} />
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--text-3)', marginTop:6, padding:'5px 8px', background:'var(--bg-3)', borderRadius:5, borderLeft:'3px solid #6b9b8b' }}>
                  Despachante + aranceles + transporte puerto → depósito. Prorrateado por unidad.
                </div>
              </CalcSection>

              {/* Col 1 fila 2: Trader */}
              <CalcSection id="calc-trader" color="#7ba3d4" label="Comisión trader China">
                <div className="form-grid-2">
                  <div className="field">
                    <label>Comisión <span className="unit">% sobre FOB</span></label>
                    <input type="number" id="p-trader-pct" value={inputs.traderPct} step="0.5" min="0" max="20"
                      onChange={e => setInputs({ traderPct: parseFloat(e.target.value)||0 })} />
                  </div>
                  <div className="field">
                    <label>Total trader <span className="unit">USD (lote)</span></label>
                    <input type="number" id="p-trader-usd" value={rd(c.traderUnit*c.qty,2)} readOnly style={{ color:'var(--text-3)' }} />
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--text-3)', marginTop:6, padding:'5px 8px', background:'var(--bg-3)', borderRadius:5, borderLeft:'3px solid #7ba3d4' }}>
                  Rango habitual: 4–8% del FOB.
                </div>
              </CalcSection>

              {/* Col 2 fila 2: Aranceles */}
              <CalcSection id="calc-aranceles" color="#c0392b" label={`Aranceles Argentina${c.di>=35?' ⚠':''}`}>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase' }}>Derecho de importación</div>
                    <button onClick={() => setActiveSection('ncm')}
                      style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:20, border:'1px solid #c0392b50', background:'#c0392b12', color:'#c0392b', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='#c0392b'; e.currentTarget.style.color='#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='#c0392b12'; e.currentTarget.style.color='#c0392b'; }}>
                      🔍 NCM
                    </button>
                  </div>
                  <TaxToggle
                    options={[{v:0,l:'0%'},{v:6,l:'6%'},{v:12,l:'12%'},{v:18,l:'18%'},{v:20,l:'20%'},{v:25,l:'25%'},{v:35,l:'35%'}]}
                    value={inputs.di} onChange={v => setInputs({ di: v })}
                  />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:6 }}>IVA importación</div>
                      <TaxToggle options={[{v:10.5,l:'10.5%'},{v:21,l:'21%'}]} value={inputs.ivaImp} onChange={v => setInputs({ ivaImp: v })} />
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:6 }}>Tasa estadística</div>
                      <TaxToggle options={[{v:0,l:'0%'},{v:3,l:'3%'}]} value={inputs.te} onChange={v => setInputs({ te: v })} />
                    </div>
                  </div>
                </div>
              </CalcSection>

            </div>
          </div>

        </div>

        {/* ── Resultado + Distribución ── */}
        <div className="card dist-card" style={{ marginTop:'1.5rem' }}>
          <div className="card-header"><span className="card-title">Resultado y distribución de ganancia</span></div>

          <div className="dist-main-grid" style={{ display:'grid', gridTemplateColumns:'1fr minmax(0, 1fr)', gap:40, alignItems:'start' }}>

            {/* LEFT: Desglose completo del costo */}
            <div style={{ paddingLeft: 6 }}>
              {/* Big number */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Costo por unidad</div>
                <div className="big-value" style={{ fontSize:32, marginBottom:2 }}>{ars(c.costoARS)}</div>
                <div style={{ fontSize:13, color:'var(--text-3)' }}>
                  U$S {rd(c.costoUSD,2)} · ¥{rd(c.costoUSD/(parseFloat(inputs.cny)||0.1466),0)} CNY · {c.qty} u = {ars(c.costoARS*c.qty)} total
                </div>
              </div>

              {/* Composition bars */}
              <div style={{ display:'flex', height:6, borderRadius:4, overflow:'hidden', marginBottom:8, gap:2 }}>
                {pctBars.map((b,i)=>(
                  <div key={i} style={{ flex:Math.max(b.pct,0.5), background:b.color, borderRadius:3, transition:'flex 0.3s' }} title={`${b.label}: ${rd(b.pct,1)}%`}/>
                ))}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'3px 10px', marginBottom:16 }}>
                {pctBars.map((b,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--text-3)' }}>
                    <span style={{ width:7, height:7, borderRadius:1, background:b.color, flexShrink:0 }}/>
                    {b.label} <strong style={{ color:'var(--text-2)' }}>{rd(b.pct,1)}%</strong>
                  </div>
                ))}
              </div>

              {/* Result groups */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <ResultGroup color="#4a7dc1" label="Precio de compra" rows={[
                  ['Valor FOB (1688)', `U$S ${rd(c.fob,3)}`],
                ]} />
                <ResultGroup color="#6b9b8b" label="Logística" rows={[
                  [c.fleteMode === 'fob36' ? 'Flete (36% FOB)' : 'Flete prorrateado', `U$S ${rd(c.fleteUnit,2)}`],
                  [`Seguro (${c.seguroPct}%)`, `U$S ${rd(c.seguroUnit,3)}`],
                  ['Despachante / aduana', `U$S ${rd(c.despachanteUnit,2)}`],
                  ['Flete interno / puerto', `U$S ${rd(c.fleteInternoUnit,2)}`],
                ]} subtotal={`CIF: U$S ${rd(c.cif,2)}`} />
                <ResultGroup color="#c0392b" label="Impuestos y comisiones" rows={[
                  [`Trader (${c.traderPct}%)`, `U$S ${rd(c.traderUnit,3)}`],
                  [`D.I. (${c.di}%)`, `U$S ${rd(c.diUnit,2)}`],
                  [`IVA imp. (${c.ivaImp}%)`, `U$S ${rd(c.ivaUnit,2)}`],
                  [`Tasa estadística (${c.te}%)`, `U$S ${rd(c.teUnit,3)}`],
                ]} />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--accent)', borderRadius:8, marginTop:2 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#fff', letterSpacing:'0.03em' }}>COSTO UNITARIO TOTAL</span>
                  <span style={{ fontSize:16, fontWeight:800, color:'#fff', fontFamily:"'Inter', system-ui, -apple-system, sans-serif" }}>U$S {rd(c.costoUSD,2)}</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Donut con protagonismo */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, paddingTop:4 }}>
              <div style={{ textAlign:'center', marginBottom:2 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.09em' }}>Composición del costo</div>
                <div style={{ fontSize:13, color:'var(--text-2)', marginTop:3 }}>
                  {c.qty} u · FOB <strong>U$S {rd(c.fob,2)}</strong> c/u · Total {ars(c.costoARS * c.qty)}
                </div>
              </div>
              <InteractiveDonut
                slices={[
                  { label:'FOB',           pct: c.fob/tot*100,                          color:'#1a4f8a', usd: c.fob,                                sectionId:'calc-fob'      },
                  { label:'Flete int.',    pct: (c.fleteUnit+c.seguroUnit)/tot*100,     color:'#4a8ac4', usd: c.fleteUnit+c.seguroUnit,              sectionId:'calc-flete'    },
                  { label:'Despachante',   pct: c.despachanteUnit/tot*100,              color:'#6b9b8b', usd: c.despachanteUnit,                     sectionId:'calc-despacho' },
                  { label:'Flete interno', pct: c.fleteInternoUnit/tot*100,             color:'#5b8b7b', usd: c.fleteInternoUnit,                    sectionId:'calc-despacho' },
                  { label:'Trader',        pct: c.traderUnit/tot*100,                   color:'#7ba3d4', usd: c.traderUnit,                          sectionId:'calc-trader'   },
                  { label:'Impuestos',     pct: (c.diUnit+c.ivaUnit+c.teUnit)/tot*100,  color:'#c0392b', usd: c.diUnit+c.ivaUnit+c.teUnit,           sectionId:'calc-aranceles'},
                ]}
                centerLabel="Costo total"
                centerValue={`U$S ${rd(c.costoUSD,2)}`}
                large
              />
            </div>

          </div>
        </div>

        <div className="page-actions">
          <button className="btn-primary" onClick={handleSaveProduct}>Guardar producto</button>
          <button className="btn-outline" onClick={() => exportCotizacionPDF({ c, canales, inputs })}>Exportar PDF</button>
          <button className="btn-outline" onClick={() => exportCSV(c, canales, inputs.nombre)}>Exportar CSV</button>
        </div>
      </section>
    </div>
  );
}

function CalcSection({ color, label, children, style, id }) {
  return (
    <div id={id} style={{ borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0', overflow: 'hidden', ...style }}>
      <div style={{ padding: '6px 12px', background: `${color}15`, borderBottom: `1px solid ${color}30` }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ padding: '12px 12px 4px' }}>
        {children}
      </div>
    </div>
  );
}

function TaxToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(opt => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            style={{
              padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font)', fontWeight: active ? 700 : 400, transition: 'all 0.15s',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-3)',
              color: active ? '#fff' : 'var(--text-3)',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {opt.l}
          </button>
        );
      })}
    </div>
  );
}

function ResultGroup({ color, label, rows, subtotal }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: '0 6px 6px 0', background: 'var(--bg-3)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: `${color}18` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
        {subtotal && <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{subtotal}</span>}
      </div>
      {rows.map(([l, val], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{l}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function InteractiveDonut({ slices, centerLabel, centerValue, large = false }) {
  const [hovered, setHovered] = useState(null);
  const R  = large ? 92  : 68;
  const SZ = large ? 280 : 200;
  const CX = SZ / 2;
  const CY = SZ / 2;
  const SW = large ? 32  : 26;
  const circ = 2 * Math.PI * R;
  const GAP_DEG = 2.5;
  const centerParts = typeof centerValue === 'string' && centerValue.startsWith('U$S ')
    ? { currency: 'U$S', amount: centerValue.slice(4) }
    : null;

  function scrollToSection(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    function getScrollParent(node) {
      if (!node || node === document.body) return null;
      const { overflowY } = window.getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      return getScrollParent(node.parentElement);
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    }

    function highlight() {
      el.classList.add('calc-highlight-pulse');
      el.addEventListener('animationend', () => el.classList.remove('calc-highlight-pulse'), { once: true });
    }

    const container = getScrollParent(el);
    if (!container) { el.scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(highlight, 700); return; }

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const target = container.scrollTop + (elRect.top - containerRect.top) - container.clientHeight / 2 + el.offsetHeight / 2;
    const start = container.scrollTop;
    const dist  = target - start;
    const duration = 600;
    const t0 = performance.now();

    function step(now) {
      const progress = Math.min((now - t0) / duration, 1);
      container.scrollTop = start + dist * easeInOutCubic(progress);
      if (progress < 1) requestAnimationFrame(step);
      else highlight();
    }
    requestAnimationFrame(step);
  }

  let cumPct = 0;
  const segs = slices.map((s, i) => {
    const startDeg = cumPct * 3.6 - 90;
    const pctAdj = Math.max(s.pct - GAP_DEG / 3.6, 0.05);
    const len = (pctAdj / 100) * circ;
    cumPct += s.pct;
    return { ...s, startDeg, len };
  });

  const hov = hovered !== null ? slices[hovered] : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:'100%' }}>
      <div style={{ position:'relative', width:SZ, height:SZ }}>
        <svg width={SZ} height={SZ} style={{ overflow:'visible' }}>
          {segs.map((seg, i) => {
            const active = hovered === i;
            const r = active ? R + 5 : R;
            const c2 = 2 * Math.PI * r;
            const ratio = seg.len / circ;
            const len2 = ratio * c2;
            return (
              <circle key={i}
                cx={CX} cy={CY} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={active ? SW + 4 : SW}
                strokeDasharray={`${len2} ${c2 - len2}`}
                transform={`rotate(${seg.startDeg} ${CX} ${CY})`}
                style={{ cursor:'pointer', transition:'r 0.18s, stroke-width 0.18s', filter: active ? `drop-shadow(0 0 6px ${seg.color}90)` : 'none' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => scrollToSection(seg.sectionId)}
              />
            );
          })}
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          {hov ? (
            <div style={{ width: large ? 130 : 104, display:'flex', flexDirection:'column', alignItems:'center', gap:2, textAlign:'center' }}>
              <div style={{ fontSize: large ? 10 : 9, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', lineHeight:1.15 }}>{hov.label}</div>
              <div style={{ fontSize: large ? 30 : 22, fontWeight:800, color: hov.color, fontFamily:"'Inter', system-ui, -apple-system, sans-serif", lineHeight:1.05 }}>{rd(hov.pct,1)}%</div>
              <div style={{ fontSize: large ? 13 : 10, color:'var(--text-3)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", lineHeight:1.1 }}>U$S {rd(hov.usd,2)}</div>
            </div>
          ) : (
            <div style={{ width: large ? 140 : 112, display:'flex', flexDirection:'column', alignItems:'center', gap: large ? 4 : 3, textAlign:'center' }}>
              <div style={{ fontSize: large ? 10 : 9, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', lineHeight:1.15 }}>{centerLabel}</div>
              {centerParts ? (
                <>
                  <div style={{ fontSize: large ? 13 : 11, fontWeight:700, color:'var(--text-3)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", lineHeight:1 }}>{centerParts.currency}</div>
                  <div style={{ fontSize: large ? 22 : 16, fontWeight:800, color:'var(--text)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", lineHeight:1.05 }}>{centerParts.amount}</div>
                </>
              ) : (
                <div style={{ fontSize: large ? 22 : 16, fontWeight:800, color:'var(--text)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", lineHeight:1.05 }}>{centerValue}</div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Desglose en USD */}
      <div style={{ width:'100%', maxWidth: large ? '100%' : 200, marginTop:16, borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
        <div style={{ padding: large ? '6px 14px' : '4px 10px', background:'var(--bg-3)', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize: large ? 12 : 11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Desglose U$S</span>
        </div>
        {slices.map((s, i) => {
          const active = hovered === i;
          const pct = rd(s.pct, 1);
          return (
            <div key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => scrollToSection(s.sectionId)}
              style={{ display:'flex', alignItems:'center', gap:8, padding: large ? '8px 14px' : '5px 10px', cursor:'pointer',
                background: active ? `${s.color}14` : 'var(--bg)',
                borderLeft: `3px solid ${active ? s.color : 'transparent'}`,
                borderBottom:'1px solid var(--border)', transition:'all 0.15s' }}>
              <span style={{ width: large ? 8 : 6, height: large ? 8 : 6, borderRadius:1, background:s.color, flexShrink:0 }}/>
              <span style={{ fontSize: large ? 13 : 12, color: active ? 'var(--text)' : 'var(--text-2)', flex:1, fontWeight: active ? 600 : 400, transition:'color 0.15s' }}>{s.label}</span>
              {large && <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", minWidth:38, textAlign:'right' }}>{pct}%</span>}
              <span style={{ fontSize: large ? 13 : 12, fontWeight: active ? 700 : 500, color: active ? s.color : 'var(--text-3)', fontFamily:"'Inter', system-ui, -apple-system, sans-serif", transition:'color 0.15s' }}>
                U$S {rd(s.usd, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exportCSV(c, canales, nombre) {
  const rows = [
    ['Campo','USD','ARS'],['Nombre',nombre,''],['FOB unitario',c.fob,''],['Cantidad',c.qty,''],
    ['Flete unitario',rd(c.fleteUnit,2),''],['Seguro unitario',rd(c.seguroUnit,3),''],
    ['CIF unitario',rd(c.cif,2),''],
    [`Comisión trader (${c.traderPct}%)`,rd(c.traderUnit,2),Math.round(c.traderUnit*c.tc)],
    ['D.I.',rd(c.diUnit,2),Math.round(c.diUnit*c.tc)],
    ['IVA importación',rd(c.ivaUnit,2),Math.round(c.ivaUnit*c.tc)],
    ['Tasa estadística',rd(c.teUnit,2),Math.round(c.teUnit*c.tc)],
    ['Aduana + transporte',rd(c.aduanaUnit,2),Math.round(c.aduanaUnit*c.tc)],
    ['COSTO UNITARIO',rd(c.costoUSD,2),Math.round(c.costoARS)],[],
    ['Canal','Precio ARS','Comisión %','Cuotas ARS','Ganancia/u ARS','Margen %'],
    ...canales.map(ch => {
      const gan = ch.precio - ch.precio*(ch.comision||0)/100 - (ch.cuotas||0) - c.costoARS;
      return [ch.nombre, ch.precio, ch.comision, ch.cuotas||0, Math.round(gan), c.costoARS>0?Math.round(gan/c.costoARS*100):0];
    })
  ];
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href:url, download:`importa-${(nombre||'producto').replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv` }).click();
  URL.revokeObjectURL(url);
}
