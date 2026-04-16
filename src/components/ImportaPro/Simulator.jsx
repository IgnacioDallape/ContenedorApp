import { useState, useMemo, useEffect } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import { ars, rd } from '../../lib/formatters.js';

const CHANNELS = [
  { nombre: 'Mercado Libre',    comision: 13 },
  { nombre: 'Tienda propia',    comision: 3  },
  { nombre: 'Instagram / WA',   comision: 0  },
  { nombre: 'Otro marketplace', comision: 8  },
];

function simCalc(costo, margenT, iva, iibb, iigg) {
  return CHANNELS.map(ch => {
    const ivaF  = 1 + iva / 100;
    const comF  = ch.comision / 100;
    const iibbF = iibb / 100;
    const base  = costo * (1 + margenT / 100 / (1 - iigg / 100)) / (1 - comF - iibbF);
    const precio = Math.round(base * ivaF);
    const ganB  = precio - costo - precio * comF - precio * iibbF - precio / ivaF * (iva / 100);
    const ganPost = ganB * (1 - iigg / 100);
    const mgReal  = costo > 0 ? Math.round(ganPost / costo * 100) : 0;
    return { ...ch, precio, ganPost, mgReal };
  });
}

export default function Simulator() {
  const { savedProducts } = useImportaproStore();

  const [costo,   setCosto]   = useState(0);
  const [margen,  setMargen]  = useState(30);
  const [iva,     setIva]     = useState(21);
  const [iibb,    setIibb]    = useState(3);
  const [iigg,    setIigg]    = useState(35);
  const [selProd, setSelProd] = useState(null);

  useEffect(() => {
    if (savedProducts.length === 1 && selProd === null) {
      setSelProd(0);
      setCosto(savedProducts[0].costoARS);
    }
  }, [savedProducts.length]);

  function selectPill(i) {
    if (selProd === i) { setSelProd(null); setCosto(0); return; }
    setSelProd(i);
    setCosto(savedProducts[i].costoARS);
  }

  const results = useMemo(() => simCalc(costo, margen, iva, iibb, iigg), [costo, margen, iva, iibb, iigg]);

  const varPct = [-30, -20, -10, 0, 10, 20, 30, 50, 80, 100];

  return (
    <div className="ip-section active" id="section-simulator">
      <section id="tab-simulator" className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Simulador de precio</h1>
          <p className="page-sub">Calculá el precio final con impuestos y comisiones para cada canal</p>
        </div>

        {savedProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Cargar desde Mis Productos</span>
              {selProd === null && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>← Hacé clic para cargar el costo</span>}
            </div>
            <div id="sim-prod-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {savedProducts.map((p, i) => (
                <div
                  key={p.id}
                  className={`prod-pill${selProd === i ? ' selected' : ''}`}
                  onClick={() => selectPill(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 20, border: `1.5px solid ${selProd === i ? 'var(--accent)' : 'var(--border)'}`, background: selProd === i ? 'var(--accent-dim)' : 'var(--bg-3)', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {p.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ars(p.costoARS)}/u · {p.qty} u</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2-1" style={{ alignItems: 'start' }}>
          <div className="col">
            <div className="card">
              <div className="card-header"><span className="card-title">Parámetros</span></div>
              <div className="form-grid-2">
                <div className="field full">
                  <label>Costo del producto <span className="unit">ARS</span></label>
                  <input type="number" id="sim-costo" value={costo} min="0"
                    onChange={e => setCosto(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label>Margen deseado <span className="unit">%</span></label>
                  <input type="number" id="sim-margen" value={margen} min="0" max="200"
                    onChange={e => setMargen(parseFloat(e.target.value) || 0)} />
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
                  <input type="number" id="sim-iibb" value={iibb} step="0.5" min="0"
                    onChange={e => setIibb(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label>IIGG <span className="unit">%</span></label>
                  <input type="number" id="sim-iigg" value={iigg} step="1" min="0"
                    onChange={e => setIigg(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card">
              <div className="card-header"><span className="card-title">Precios sugeridos</span></div>
              <div id="sim-result">
                {results.map((ch, i) => {
                  const badge = ch.mgReal >= 30 ? 'green' : ch.mgReal >= 10 ? 'amber' : 'red';
                  return (
                    <div key={i} className="sim-ch-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-2)' }}>
                      <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{ch.nombre}</span>
                      <div style={{ textAlign: 'right' }}>
                        <div className="sim-price" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{ars(ch.precio)}</div>
                        <div style={{ fontSize: 11.5, marginTop: 3, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <span className={`badge badge-${badge}`}>{ch.mgReal}% post-IIGG</span>
                          <span style={{ color: 'var(--text-3)' }}>gan. {ars(ch.ganPost)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><span className="card-title">Análisis de sensibilidad</span></div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Variación del precio sobre el costo, con IVA {iva}% incluido — comisión ML {CHANNELS[0].comision}%</p>
          <div id="sensibilidad-table">
            <div className="sens-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '6px 8px', background: 'var(--bg-3)', borderRadius: 'var(--radius)', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
              <span>Variación del precio</span><span>Precio c/ IVA</span><span>Margen bruto (ML {CHANNELS[0].comision}%)</span>
            </div>
            {varPct.map(vp => {
              const pr   = Math.round(costo * (1 + vp / 100) * (1 + iva / 100));
              const gan  = pr - costo - pr * CHANNELS[0].comision / 100 - pr * iibb / 100 - pr / (1 + iva / 100) * (iva / 100);
              const mg   = costo > 0 ? Math.round(gan / costo * 100) : 0;
              const b    = mg >= 50 ? 'green' : mg >= 20 ? 'amber' : 'red';
              return (
                <div key={vp} className="sens-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--border-2)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>{vp >= 0 ? '+' : ''}{vp}% sobre costo</span>
                  <span style={{ fontWeight: 500 }}>{ars(pr)}</span>
                  <span><span className={`badge badge-${b}`}>{mg}%</span></span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
