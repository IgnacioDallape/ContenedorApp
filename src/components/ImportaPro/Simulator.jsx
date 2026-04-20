import { useState, useMemo, useEffect } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars } from '../../lib/formatters.js';
import { SIMULATOR_CHANNELS, simulateChannelPrices } from '../../lib/pricing.js';

function normalizeDraft(results, existingPlan) {
  const existingChannels = new Map((existingPlan?.channels || []).map(ch => [ch.nombre, ch]));
  return results.map(result => {
    const saved = existingChannels.get(result.nombre);
    return {
      nombre: result.nombre,
      comision: result.comision,
      sugerido: result.precio,
      confirmado: saved?.precio ?? result.precio,
      publicar: saved?.publicar ?? true,
      ganPost: result.ganPost,
      mgReal: result.mgReal,
    };
  });
}

export default function Simulator() {
  const { savedProducts, publicationPlans, savePublicationPlan } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();

  const [costo, setCosto] = useState(0);
  const [margen, setMargen] = useState(30);
  const [iva, setIva] = useState(21);
  const [iibb, setIibb] = useState(3);
  const [iigg, setIigg] = useState(35);
  const [selProd, setSelProd] = useState(null);
  const [draftChannels, setDraftChannels] = useState([]);

  const selectedProduct = selProd !== null ? savedProducts[selProd] : null;
  const existingPlan = selectedProduct
    ? publicationPlans.find(plan => plan.productId === selectedProduct.id)
    : null;

  useEffect(() => {
    if (savedProducts.length === 1 && selProd === null) {
      setSelProd(0);
      setCosto(savedProducts[0].costoARS);
    }
  }, [savedProducts.length, selProd]);

  function selectPill(i) {
    if (selProd === i) {
      setSelProd(null);
      setCosto(0);
      setDraftChannels([]);
      return;
    }
    setSelProd(i);
    setCosto(savedProducts[i].costoARS);
  }

  const results = useMemo(
    () => simulateChannelPrices(costo, margen, iva, iibb, iigg, SIMULATOR_CHANNELS),
    [costo, margen, iva, iibb, iigg]
  );

  useEffect(() => {
    if (!selectedProduct) {
      setDraftChannels([]);
      return;
    }
    setDraftChannels(normalizeDraft(results, existingPlan));
  }, [selectedProduct?.id, results, existingPlan?.updatedAt]);

  function updateDraftChannel(nombre, patch) {
    setDraftChannels(curr => curr.map(ch => ch.nombre === nombre ? { ...ch, ...patch } : ch));
  }

  function confirmPublicationPlan() {
    if (!selectedProduct) {
      showToast('Seleccioná un producto para confirmar precios', 'error');
      return;
    }

    const activeChannels = draftChannels.filter(ch => ch.publicar && ch.confirmado > 0);
    if (!activeChannels.length) {
      showToast('Elegí al menos un canal con precio confirmado', 'error');
      return;
    }

    savePublicationPlan({
      productId: selectedProduct.id,
      productName: selectedProduct.nombre,
      costoARS: selectedProduct.costoARS,
      qty: selectedProduct.qty,
      targetMargin: margen,
      iva,
      iibb,
      iigg,
      updatedAt: new Date().toISOString(),
      channels: draftChannels.map(ch => ({
        nombre: ch.nombre,
        comision: ch.comision,
        sugerido: ch.sugerido,
        precio: Number(ch.confirmado) || 0,
        publicar: !!ch.publicar,
        ganPost: ch.ganPost,
        mgReal: ch.mgReal,
      })),
    });

    showToast(`Precios confirmados para "${selectedProduct.nombre}"`, 'success');
    setActiveSection('prices');
  }

  return (
    <div className="ip-section active" id="section-simulator">
      <section id="tab-simulator" className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Simulador de precio</h1>
          <p className="page-sub">Simulá, ajustá y confirmá los precios que realmente vas a publicar</p>
        </div>

        {savedProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Elegí un producto para publicar</span>
              {selProd === null && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Seleccioná uno para cargar su costo</span>}
            </div>
            <div className="prod-picker">
              {savedProducts.map((p, i) => (
                <div key={p.id} className={`prod-pill${selProd === i ? ' selected' : ''}`} onClick={() => selectPill(i)}>
                  <div className="prod-pill-avatar">{p.nombre.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="prod-pill-name">{p.nombre}</div>
                    <div className="prod-pill-meta">{ars(p.costoARS)}/u · {p.qty} u</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2-1" style={{ alignItems: 'start' }}>
          <div className="col">
            <div className="card">
              <div className="card-header"><span className="card-title">Parámetros del escenario</span></div>
              <div className="form-grid-2">
                <div className="field full">
                  <label>Costo del producto <span className="unit">ARS</span></label>
                  <input type="number" id="sim-costo" value={costo} min="0" onChange={e => setCosto(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label>Margen objetivo <span className="unit">%</span></label>
                  <input type="number" id="sim-margen" value={margen} min="0" max="200" onChange={e => setMargen(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label>IVA ventas <span className="unit">%</span></label>
                  <select id="sim-iva" value={iva} onChange={e => setIva(parseFloat(e.target.value))}>
                    <option value="10.5">10.5%</option>
                    <option value="21">21%</option>
                  </select>
                </div>
                <div className="field">
                  <label>IIBB <span className="unit">%</span></label>
                  <input type="number" id="sim-iibb" value={iibb} step="0.5" min="0" onChange={e => setIibb(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label>IIGG <span className="unit">%</span></label>
                  <input type="number" id="sim-iigg" value={iigg} step="1" min="0" onChange={e => setIigg(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header">
                <span className="card-title">Confirmación para publicar</span>
                {selectedProduct && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{selectedProduct.nombre}</span>}
              </div>

              {!selectedProduct ? (
                <div className="prod-picker-empty">Seleccioná un producto para decidir qué precios vas a publicar.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {draftChannels.map(ch => (
                    <div key={ch.nombre} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(26,79,138,0.04), #fff)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ch.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Sugerido: {ars(ch.sugerido)} · Comisión {ch.comision}%</div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                          <input type="checkbox" checked={ch.publicar} onChange={e => updateDraftChannel(ch.nombre, { publicar: e.target.checked })} />
                          Publicar
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center' }}>
                        <input
                          type="number"
                          value={ch.confirmado}
                          min="0"
                          onChange={e => updateDraftChannel(ch.nombre, { confirmado: parseFloat(e.target.value) || 0 })}
                          style={{ minWidth: 0 }}
                        />
                        <span className={`badge badge-${ch.mgReal >= 30 ? 'green' : ch.mgReal >= 10 ? 'amber' : 'red'}`}>{ch.mgReal}% post-IIGG</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>gan. {ars(ch.ganPost)}</span>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Esto alimenta directamente la sección "Precios a publicar".</span>
                    <button className="btn-primary" onClick={confirmPublicationPlan}>Confirmar precios</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="col">
            <div className="card">
              <div className="card-header"><span className="card-title">Precios sugeridos por canal</span></div>
              <div id="sim-result" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {results.map((ch, i) => {
                  const badge = ch.mgReal >= 30 ? 'green' : ch.mgReal >= 10 ? 'amber' : 'red';
                  return (
                    <div key={i} style={{ padding: '14px', borderRadius: 14, border: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(26,79,138,0.03), #fff)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ch.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Comisión {ch.comision}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="sim-price" style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{ars(ch.precio)}</div>
                          <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <span className={`badge badge-${badge}`}>{ch.mgReal}% post-IIGG</span>
                            <span style={{ color: 'var(--text-3)' }}>gan. {ars(ch.ganPost)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
