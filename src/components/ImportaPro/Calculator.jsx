import { useMemo, useRef, useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import useContainerStore from '../../stores/containerStore.js';
import { ars, rd } from '../../lib/formatters.js';
import { PALLET_SIZES } from '../../lib/constants.js';

export function calcCostos(inp) {
  const fob             = parseFloat(inp.fob)           || 0;
  const qty             = parseInt(inp.qty)              || 1;
  const flete           = parseFloat(inp.flete)          || 0;
  const seguroPct       = parseFloat(inp.seguroPct)      || 0;
  const despachante     = parseFloat(inp.despachante)    || parseFloat(inp.aduana) || 0; // backward compat
  const fleteInterno    = parseFloat(inp.fleteInterno)   || 0;
  const traderPct       = parseFloat(inp.traderPct)      || 0;
  const di              = parseFloat(inp.di)             || 0;
  const ivaImp          = parseFloat(inp.ivaImp)         || 21;
  const te              = parseFloat(inp.te)             || 0;
  const tc              = parseFloat(inp.globalTC)       || 1359;
  const fleteUnit       = flete / qty;
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
  return { fob, qty, flete, seguroPct, despachante, fleteInterno, traderPct, di, ivaImp, te, tc,
           fleteUnit, seguroUnit, traderUnit, cif, diUnit, ivaUnit, teUnit,
           despachanteUnit, fleteInternoUnit, aduanaUnit, costoUSD, costoARS };
}

export default function Calculator() {
  const { inputs, setInputs, canales, addCanal, updateCanal, removeCanal, saveProduct } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();
  const { addToCatalog } = useContainerStore();

  const [distReinv, setDistReinv] = useState(40);
  const [distGan,   setDistGan]   = useState(40);

  const c = useMemo(() => calcCostos(inputs), [inputs]);

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
    if (!(parseFloat(inputs.pesoUnit) > 0)) { showToast('Ingresá el peso por unidad (debe ser mayor a 0)', 'error'); return; }
    const prod = {
      id:        Date.now(),
      nombre:    inputs.nombre,
      fob:       c.fob,
      qty:       c.qty,
      costoARS:  Math.round(c.costoARS),
      costoUSD:  rd(c.costoUSD, 2),
      di:        c.di,
      traderPct: c.traderPct,
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

  function clearPhoto(idx) {
    const photos = [...(inputs.photos || [null, null])];
    photos[idx] = null;
    setInputs({ photos });
  }

  const distLibre = Math.max(0, 100 - distReinv - distGan);
  const mlCh  = canales.find(ch => ch.nombre.toLowerCase().includes('mercado')) || canales[0];
  const tpCh  = canales.find(ch => ch.nombre.toLowerCase().includes('tienda'))  || canales[1];

  function chanGan(ch) {
    if (!ch || !ch.precio) return 0;
    const com = ch.precio * (ch.comision || 0) / 100;
    const neto = ch.precio - com - (ch.cuotas || 0);
    return Math.max(0, neto - c.costoARS);
  }

  const tot = c.costoUSD || 1;
  const breakdown = [
    ['Valor FOB (1688)',             `U$S ${rd(c.fob, 3)}`],
    ['Flete prorrateado',             `U$S ${rd(c.fleteUnit, 2)}`],
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
        <div className="page-header">
          <h1>Calculadora de costos</h1>
          <p className="page-sub">Costo real de importar desde 1688 a Argentina, incluyendo impuestos, logística y trader</p>
        </div>

        <div className="grid-2-1">
          <div className="col">
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
              <CalcSection color="#4a7dc1" label="Precio de compra" style={{ marginBottom: 4 }}>
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
                  {inputs.currencyMode === 'cny' && (
                    <div className="field">
                      <label>Precio 1688 <span className="unit">CNY / unidad</span></label>
                      <input type="number" id="p-fob-cny" value={inputs.fobCny} step="0.1" min="0"
                        onChange={e => syncFob({ fobCny: parseFloat(e.target.value)||0 })} />
                    </div>
                  )}
                  {inputs.currencyMode === 'ars' && (
                    <div className="field">
                      <label>Precio de compra <span className="unit">ARS / unidad</span></label>
                      <input type="number" id="p-fob-ars" value={inputs.fobArs} step="100" min="0"
                        onChange={e => syncFob({ fobArs: parseFloat(e.target.value)||0 })} />
                    </div>
                  )}
                  <div className="field">
                    <label>Equivalente <span className="unit">USD / unidad</span></label>
                    <input type="number" id="p-fob" value={inputs.fob} step="0.01" min="0"
                      readOnly={inputs.currencyMode !== 'usd'}
                      style={{ color: inputs.currencyMode === 'usd' ? 'var(--text)' : 'var(--text-3)' }}
                      onChange={inputs.currencyMode === 'usd' ? e => setInputs({ fob: parseFloat(e.target.value)||0 }) : undefined} />
                  </div>
                  <div className="field">
                    <label>Cantidad <span className="unit">unidades</span></label>
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
                  <label>Tipo de unidad</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {[['box','📦 Caja'],['pallet','🟫 Pallet']].map(([t, lbl]) => (
                      <button key={t} type="button"
                        style={{ flex:1, padding:'9px 12px', borderRadius:'var(--radius)', border:`1.5px solid ${inputs.tipoUnidad===t?'var(--accent)':'var(--border-2)'}`, background: inputs.tipoUnidad===t?'var(--accent)':'transparent', color: inputs.tipoUnidad===t?'#fff':'var(--text-2)', fontFamily:'var(--font)', fontSize:13, fontWeight: inputs.tipoUnidad===t?600:500, cursor:'pointer', transition:'all 0.15s' }}
                        onClick={() => setInputs({ tipoUnidad: t })}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" id="p-tipo-unidad" value={inputs.tipoUnidad} />
                </div>
                <div className="field">
                  <label>Peso por unidad <span className="unit">kg</span></label>
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
                          onChange={e => { setInputs({ palletHeight: parseInt(e.target.value) }); syncPalletDims(); }} />
                        <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)', whiteSpace:'nowrap', minWidth:48 }}>
                          {inputs.palletHeight || 120} cm
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div id="dims-section">
                <div className="form-grid-3">
                  <div className="field"><label>Largo <span className="unit">cm</span></label>
                    <input type="number" id="p-dim-l" value={inputs.dimL||''} placeholder="60" min="1" step="0.5"
                      onChange={e => setInputs({ dimL: e.target.value })} /></div>
                  <div className="field"><label>Ancho <span className="unit">cm</span></label>
                    <input type="number" id="p-dim-w" value={inputs.dimW||''} placeholder="40" min="1" step="0.5"
                      onChange={e => setInputs({ dimW: e.target.value })} /></div>
                  <div className="field"><label>Alto <span className="unit">cm</span></label>
                    <input type="number" id="p-dim-h" value={inputs.dimH||''} placeholder="30" min="1" step="0.5"
                      onChange={e => setInputs({ dimH: e.target.value })} /></div>
                </div>
              </div>

              <div className="divider"/>
              {/* ── Referencias + Fotos ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Referencias y fotos</div>

                {/* Links con badge de plataforma */}
                {[
                  { id:'p-link-1688', key:'link1688', label:'1688', color:'#e87722', placeholder:'https://detail.1688.com/...', hint:'Origen' },
                  { id:'p-link-ml',   key:'linkML',   label:'ML',   color:'#3483fa', placeholder:'https://articulo.mercadolibre.com.ar/...', hint:'Local' },
                ].map(({ id, key, label, color, placeholder, hint }) => {
                  const hasVal = !!(inputs[key]);
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--bg)', transition:'border-color 0.15s' }}>
                      <div style={{ background: color, padding:'0 13px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', alignSelf:'stretch', flexShrink:0, minWidth:46 }}>
                        <span style={{ fontSize:9, fontWeight:800, color:'#fff', letterSpacing:'0.05em', lineHeight:1 }}>{label}</span>
                        <span style={{ fontSize:8, color:'rgba(255,255,255,0.7)', marginTop:2, lineHeight:1 }}>{hint}</span>
                      </div>
                      <input
                        type="url" id={id} value={inputs[key]||''} placeholder={placeholder}
                        style={{ flex:1, border:'none', background:'transparent', padding:'10px 12px', fontFamily:'var(--font)', fontSize:12, color:'var(--text)', outline:'none', minWidth:0 }}
                        onChange={e => setInputs({ [key]: e.target.value })}
                      />
                      <button
                        onClick={() => hasVal && window.open(inputs[key],'_blank')}
                        style={{ flexShrink:0, padding:'0 14px', alignSelf:'stretch', border:'none', borderLeft:'1px solid var(--border-2)', background: hasVal ? `${color}12` : 'transparent', color: hasVal ? color : 'var(--border)', fontSize:14, cursor: hasVal ? 'pointer' : 'default', transition:'all 0.15s' }}
                        title={hasVal ? 'Abrir enlace' : 'Sin enlace'}
                      >↗</button>
                    </div>
                  );
                })}

                {/* Fotos */}
                <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginTop:4 }}>
                  {[0, 1].map(idx => {
                    const label = idx === 0 ? '1688' : 'ML';
                    const color = idx === 0 ? '#e87722' : '#3483fa';
                    const hasPhoto = !!(inputs.photos?.[idx]);
                    return (
                      <div key={idx}
                        onClick={() => document.getElementById(`photo-input-${idx}`).click()}
                        style={{ width:88, height:88, border: hasPhoto ? `2px solid ${color}40` : '1.5px dashed var(--border)', borderRadius:10, cursor:'pointer', position:'relative', overflow:'hidden', background: hasPhoto ? 'transparent' : 'var(--bg-3)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', flexShrink:0, transition:'border-color 0.2s' }}
                      >
                        {hasPhoto ? (
                          <>
                            <img src={inputs.photos[idx]} style={{ display:'block', width:'100%', height:'100%', objectFit:'cover' }} />
                            <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0)', transition:'background 0.2s' }}/>
                            <button
                              className="photo-del"
                              onClick={e => { e.stopPropagation(); clearPhoto(idx); }}
                              style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', fontSize:13, lineHeight:'20px', textAlign:'center', cursor:'pointer', padding:0 }}
                            >×</button>
                            <div style={{ position:'absolute', bottom:0, left:0, right:0, background: `${color}cc`, padding:'3px 0', textAlign:'center' }}>
                              <span style={{ fontSize:8, fontWeight:700, color:'#fff', letterSpacing:'0.06em' }}>{label}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize:22, color:'var(--border)', lineHeight:1 }}>+</span>
                            <span style={{ fontSize:9, color:'var(--text-3)', marginTop:5, fontWeight:600, letterSpacing:'0.04em' }}>{label}</span>
                          </>
                        )}
                        <input type="file" id={`photo-input-${idx}`} accept="image/*" style={{ display:'none' }}
                          onChange={e => loadPhotoFile(idx, e.target.files[0])} />
                      </div>
                    );
                  })}
                  <p style={{ fontSize:11, color:'var(--text-3)', lineHeight:1.6, margin:0, paddingTop:2 }}>
                    Guardá fotos del producto en origen (1688) y en el mercado local (ML) para comparar visualmente. Se almacenan junto al producto.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Logística ── */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Logística e importación</span>
                <button className="btn-text" onClick={() => setActiveSection('ncm')}>Buscar NCM →</button>
              </div>

              {/* Flete internacional */}
              <CalcSection color="#4a8ac4" label="Flete internacional">
                <div className="form-grid-2">
                  <div className="field"><label>Flete total <span className="unit">USD</span></label>
                    <input type="number" id="p-flete" value={inputs.flete} min="0"
                      onChange={e => setInputs({ flete: parseFloat(e.target.value)||0 })} /></div>
                  <div className="field"><label>Seguro <span className="unit">%</span></label>
                    <input type="number" id="p-seguro-pct" value={inputs.seguroPct} step="0.1" min="0"
                      onChange={e => setInputs({ seguroPct: parseFloat(e.target.value)||0 })} /></div>
                </div>
              </CalcSection>

              {/* Despacho y logística local */}
              <CalcSection color="#6b9b8b" label="Despacho y flete interno" style={{ marginTop: 10 }}>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Despachante / aduana <span className="unit">USD total</span></label>
                    <input type="number" id="p-despachante" value={inputs.despachante ?? inputs.aduana ?? 0} min="0"
                      onChange={e => setInputs({ despachante: parseFloat(e.target.value)||0 })} />
                  </div>
                  <div className="field">
                    <label>Flete interno / puerto <span className="unit">USD total</span></label>
                    <input type="number" id="p-flete-interno" value={inputs.fleteInterno || 0} min="0"
                      onChange={e => setInputs({ fleteInterno: parseFloat(e.target.value)||0 })} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 6, borderLeft: '3px solid #6b9b8b' }}>
                  Honorarios del despachante + aranceles pagados en aduana + transporte puerto → depósito. Se prorratean por unidad.
                </div>
              </CalcSection>

              {/* Trader */}
              <CalcSection color="#7ba3d4" label="Comisión trader China" style={{ marginTop: 10 }}>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Comisión trader <span className="unit">% sobre FOB</span></label>
                    <input type="number" id="p-trader-pct" value={inputs.traderPct} step="0.5" min="0" max="20"
                      onChange={e => setInputs({ traderPct: parseFloat(e.target.value)||0 })} />
                  </div>
                  <div className="field">
                    <label>Total trader <span className="unit">USD (lote completo)</span></label>
                    <input type="number" id="p-trader-usd" value={rd(c.traderUnit * c.qty, 2)} readOnly style={{ color: 'var(--text-3)' }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 6, borderLeft: '3px solid #7ba3d4' }}>
                  Gestiona fabricantes, calidad y despacho en origen. Rango habitual: 4 – 8 % del FOB.
                </div>
              </CalcSection>

              {/* Aranceles */}
              <CalcSection color="#c0392b" label="Aranceles Argentina" style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>Derecho de importación</div>
                    <TaxToggle
                      options={[{v:0,l:'0% — Exento'},{v:6,l:'6%'},{v:12,l:'12%'},{v:18,l:'18%'},{v:20,l:'20%'},{v:25,l:'25%'},{v:35,l:'35%'}]}
                      value={inputs.di}
                      onChange={v => setInputs({ di: v })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>IVA importación</div>
                      <TaxToggle
                        options={[{v:10.5,l:'10.5%'},{v:21,l:'21%'}]}
                        value={inputs.ivaImp}
                        onChange={v => setInputs({ ivaImp: v })}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>Tasa estadística</div>
                      <TaxToggle
                        options={[{v:0,l:'0%'},{v:3,l:'3%'}]}
                        value={inputs.te}
                        onChange={v => setInputs({ te: v })}
                      />
                    </div>
                  </div>
                </div>
              </CalcSection>
            </div>
          </div>

          {/* ── Right col: Result ── */}
          <div className="col">
            <div className="card result-card">
              {/* Big number */}
              <div className="big-metric" style={{ paddingBottom: 16 }}>
                <div className="big-label">Costo unitario total</div>
                <div className="big-value" id="res-costo-ars">{ars(c.costoARS)}</div>
                <div className="big-sub" id="res-costo-usd">
                  U$S {rd(c.costoUSD, 2)} · ¥{rd(c.costoUSD / (parseFloat(inputs.cny) || 0.1466), 0)} CNY · {c.qty} u = {ars(c.costoARS * c.qty)} total
                </div>
              </div>

              {/* Composition mini-bars */}
              <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', marginBottom: 10, gap: 2 }}>
                {pctBars.map((b, i) => (
                  <div key={i} style={{ flex: Math.max(b.pct, 0.5), background: b.color, borderRadius: 3, transition: 'flex 0.3s' }} title={`${b.label}: ${rd(b.pct,1)}%`} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 18 }}>
                {pctBars.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                    {b.label} <strong style={{ color: 'var(--text-2)' }}>{rd(b.pct, 1)}%</strong>
                  </div>
                ))}
              </div>

              {/* Grouped breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Grupo 1: Precio de compra */}
                <ResultGroup color="#4a7dc1" label="Precio de compra" rows={[
                  ['Valor FOB (1688)', `U$S ${rd(c.fob, 3)}`],
                ]} />

                {/* Grupo 2: Logística */}
                <ResultGroup color="#6b9b8b" label="Logística" rows={[
                  ['Flete prorrateado', `U$S ${rd(c.fleteUnit, 2)}`],
                  [`Seguro (${c.seguroPct}%)`, `U$S ${rd(c.seguroUnit, 3)}`],
                  ['Despachante / aduana', `U$S ${rd(c.despachanteUnit, 2)}`],
                  ['Flete interno / puerto', `U$S ${rd(c.fleteInternoUnit, 2)}`],
                ]} subtotal={`CIF: U$S ${rd(c.cif, 2)}`} />

                {/* Grupo 3: Impuestos y comisiones */}
                <ResultGroup color="#c0392b" label="Impuestos y comisiones" rows={[
                  [`Trader (${c.traderPct}%)`, `U$S ${rd(c.traderUnit, 3)}`],
                  [`D.I. (${c.di}%)`, `U$S ${rd(c.diUnit, 2)}`],
                  [`IVA imp. (${c.ivaImp}%)`, `U$S ${rd(c.ivaUnit, 2)}`],
                  [`Tasa estadística (${c.te}%)`, `U$S ${rd(c.teUnit, 3)}`],
                ]} />

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--accent)', borderRadius: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>COSTO UNITARIO TOTAL</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace" }}>U$S {rd(c.costoUSD, 2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Canales ── */}
        <div className="card" style={{ marginTop:'1.5rem' }}>
          <div className="card-header">
            <span className="card-title">Canales de venta</span>
            <button className="btn-outline" onClick={addCanal}>+ Agregar canal</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {canales.map((canal, i) => {
              const precio   = canal.precio || 0;
              const comision = precio * (canal.comision || 0) / 100;
              const neto     = precio - comision - (canal.cuotas || 0);
              const ganancia = neto - c.costoARS;
              const margen   = c.costoARS > 0 ? Math.round(ganancia / c.costoARS * 100) : 0;
              const badgeKey = margen >= 50 ? 'green' : margen >= 20 ? 'amber' : 'red';
              const accentColor = margen >= 50 ? 'var(--green)' : margen >= 20 ? 'var(--amber, #e6a817)' : 'var(--red)';
              return (
                <div key={i} style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-2)' }}>
                  {/* Header: canal name + ganancia + badge + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderLeft: `4px solid ${accentColor}`, background: 'var(--bg-3)', borderBottom: '1px solid var(--border-2)', gap: 10 }}>
                    <input
                      value={canal.nombre}
                      onChange={e => updateCanal(i, { nombre: e.target.value })}
                      style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font)', minWidth: 0 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1, marginBottom: 2 }}>Ganancia/u</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: ganancia >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>
                          {precio ? ars(ganancia) : <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 12 }}>—</span>}
                        </div>
                      </div>
                      <span className={`badge badge-${badgeKey}`} style={{ fontSize: 11 }}>{precio ? `${margen}%` : '—'}</span>
                      <button onClick={() => removeCanal(i)} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-3)', cursor: 'pointer', lineHeight: 1, padding: '0 2px', opacity: 0.5 }} title="Eliminar canal">×</button>
                    </div>
                  </div>
                  {/* Input cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderLeft: `4px solid ${accentColor}` }}>
                    {[
                      { label: 'Precio venta ARS', val: precio,           step: 100,  onChange: v => updateCanal(i, { precio: v }) },
                      { label: 'Comisión %',        val: canal.comision,  step: 0.5,  onChange: v => updateCanal(i, { comision: v }) },
                      { label: 'Cuotas ARS',        val: canal.cuotas||0, step: 100,  onChange: v => updateCanal(i, { cuotas: v }) },
                    ].map((f, fi) => (
                      <div key={f.label} style={{ padding: '8px 14px', borderRight: fi < 2 ? '1px solid var(--border-2)' : 'none' }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>{f.label}</div>
                        <input
                          type="number" value={f.val} step={f.step}
                          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, color: 'var(--text)', padding: 0 }}
                          onChange={e => f.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Distribución ── */}
        <div className="card dist-card" style={{ marginTop:'1.5rem' }}>
          <div className="card-header"><span className="card-title">Distribución de la ganancia por venta</span></div>
          <p className="hint" style={{ marginBottom:'1.25rem' }}>Definí cómo distribuir la ganancia neta una vez consumada la venta.</p>
          <div className="dist-controls">
            <div className="field">
              <label>Reinversión en mercadería <span className="unit">% de la ganancia neta</span></label>
              <input type="number" id="dist-reinversion" value={distReinv} min="0" max="100" step="5"
                onChange={e => setDistReinv(Math.min(100, Math.max(0, parseFloat(e.target.value)||0)))} />
            </div>
            <div className="field">
              <label>Retiro personal (ganancia) <span className="unit">% de la ganancia neta</span></label>
              <input type="number" id="dist-ganancia" value={distGan} min="0" max="100" step="5"
                onChange={e => setDistGan(Math.min(100, Math.max(0, parseFloat(e.target.value)||0)))} />
            </div>
          </div>
          <div className="dist-metrics" id="dist-metrics">
            {[{ ch: mlCh, label: mlCh?.nombre || 'Mercado Libre', color: 'var(--accent)' },
              { ch: tpCh, label: tpCh?.nombre || 'Tienda propia', color: 'var(--green)' }
            ].map(({ ch, label: lbl, color }, i) => {
              const ganNeta = chanGan(ch);
              return (
                <div key={i} style={{ background:'var(--bg-3)', borderRadius:'var(--radius-lg)', padding:'14px 16px', border:'1px solid var(--border)', marginBottom: i===0?10:0 }}>
                  <div style={{ fontSize:'10.5px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color, marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>{lbl}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:12 }}>
                    <div style={{ gridColumn:'1/-1' }}><div className="dm-label">Ganancia neta</div><div style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>{ars(ganNeta)}</div></div>
                    <div style={{ background:'var(--accent-dim)', borderRadius:'var(--radius)', padding:'8px 10px' }}><div className="dm-label" style={{ color:'var(--accent)' }}>Reinversión {distReinv}%</div><div style={{ fontSize:14, fontWeight:700, color:'var(--accent)' }}>{ars(ganNeta*distReinv/100)}</div></div>
                    <div style={{ background:'var(--green-dim)', borderRadius:'var(--radius)', padding:'8px 10px' }}><div className="dm-label" style={{ color:'var(--green)' }}>Retiro {distGan}%</div><div style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{ars(ganNeta*distGan/100)}</div></div>
                    <div style={{ background:'var(--amber-dim)', borderRadius:'var(--radius)', padding:'8px 10px', gridColumn:'1/-1' }}><div className="dm-label" style={{ color:'var(--amber)' }}>Disponible {rd(distLibre,1)}%</div><div style={{ fontSize:14, fontWeight:700, color:'var(--amber)' }}>{ars(ganNeta*distLibre/100)} <span style={{ fontSize:11, fontWeight:400 }}>por {c.qty} u: {ars(ganNeta*distLibre/100*c.qty)}</span></div></div>
                  </div>
                  <div style={{ display:'flex', height:8, borderRadius:5, overflow:'hidden', gap:2 }}>
                    <div style={{ flex:distReinv||0.5, background:'var(--accent)', borderRadius:3 }}/>
                    <div style={{ flex:distGan||0.5, background:'var(--green)', borderRadius:3 }}/>
                    <div style={{ flex:Math.max(distLibre,0.5), background:'var(--amber)', borderRadius:3 }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="page-actions">
          <button className="btn-primary" onClick={handleSaveProduct}>Guardar producto</button>
          <button className="btn-outline" onClick={() => exportCSV(c, canales, inputs.nombre)}>Exportar CSV</button>
        </div>
      </section>
    </div>
  );
}

function CalcSection({ color, label, children, style }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0', overflow: 'hidden', ...style }}>
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
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
        {subtotal && <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>{subtotal}</span>}
      </div>
      {rows.map(([l, val], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{l}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: "'DM Mono', monospace" }}>{val}</span>
        </div>
      ))}
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
    ['Canal','Precio ARS','Comisión %','Ganancia/u ARS','Margen %'],
    ...canales.map(ch => {
      const gan = ch.precio - ch.precio*(ch.comision||0)/100 - c.costoARS;
      return [ch.nombre, ch.precio, ch.comision, Math.round(gan), c.costoARS>0?Math.round(gan/c.costoARS*100):0];
    })
  ];
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href:url, download:`importa-${(nombre||'producto').replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv` }).click();
  URL.revokeObjectURL(url);
}

