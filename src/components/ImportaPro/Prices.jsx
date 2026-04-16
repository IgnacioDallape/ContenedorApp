import { useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars } from '../../lib/formatters.js';

export default function Prices() {
  const { savedProducts } = useImportaproStore();
  const { setActiveSection } = useAppStore();
  const [targetMargen, setTargetMargen] = useState(30);

  if (!savedProducts.length) {
    return (
      <div className="ip-section active" id="section-prices">
        <section className="tab" style={{ display: 'block' }}>
          <div className="page-header">
            <h1>Precios a publicar</h1>
            <p className="page-sub">Márgenes y precios sugeridos por canal de venta para cada producto calculado</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48 }}>🏷</div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>No hay productos con análisis de precios</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Calculá un producto y guardalo para ver sus precios sugeridos acá.</p>
            <button className="btn-primary" onClick={() => setActiveSection('calc')} style={{ marginTop: 8 }}>Ir a calculadora</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ip-section active" id="section-prices">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Precios a publicar</h1>
          <p className="page-sub">Márgenes y precios sugeridos por canal de venta para cada producto calculado</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Margen objetivo para precio sugerido:</span>
          <input
            type="number" value={targetMargen} min="0" max="500" step="5"
            onChange={e => setTargetMargen(parseFloat(e.target.value) || 0)}
            style={{ width: 70, padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-2)', background: 'var(--bg-3)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, textAlign: 'center' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>%</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {savedProducts.map(p => {
            const canales = p.canales || [];
            return (
              <div key={p.id} className="card">
                <div className="card-header">
                  <span className="card-title">{p.nombre}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Costo: {ars(p.costoARS)} · {p.qty} u · {p.date}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Canal', 'Precio actual', 'Comisión', 'Cuotas', 'Ganancia/u', 'Margen', `Precio p/${targetMargen}%`].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {canales.map((ch, i) => {
                        const com = ch.precio * (ch.comision || 0) / 100;
                        const neto = ch.precio - com - (ch.cuotas || 0);
                        const gan = neto - p.costoARS;
                        const margen = p.costoARS > 0 ? Math.round(gan / p.costoARS * 100) : 0;
                        const badge = margen >= 50 ? 'green' : margen >= 20 ? 'amber' : 'red';
                        // precio sugerido para alcanzar targetMargen: costo*(1+M%) / (1 - comision%) + cuotas
                        const comF = (ch.comision || 0) / 100;
                        const precioSug = p.costoARS > 0
                          ? Math.ceil((p.costoARS * (1 + targetMargen / 100) + (ch.cuotas || 0)) / (1 - comF))
                          : 0;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-2)' }}>
                            <td style={{ padding: '9px 10px', fontWeight: 500 }}>{ch.nombre}</td>
                            <td style={{ padding: '9px 10px', fontWeight: 700 }}>{ch.precio ? ars(ch.precio) : <span style={{ color: 'var(--text-3)' }}>Sin precio</span>}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text-2)' }}>{ch.comision}%</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text-2)' }}>{ch.cuotas ? ars(ch.cuotas) : '—'}</td>
                            <td style={{ padding: '9px 10px', fontWeight: 600, color: gan >= 0 ? 'var(--green)' : 'var(--red)' }}>{ch.precio ? ars(gan) : '—'}</td>
                            <td style={{ padding: '9px 10px' }}>{ch.precio ? <span className={`badge badge-${badge}`}>{margen}%</span> : '—'}</td>
                            <td style={{ padding: '9px 10px', fontWeight: 700, color: 'var(--accent)' }}>{p.costoARS > 0 ? ars(precioSug) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        {savedProducts.length >= 2 && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header"><span className="card-title">Comparación de productos</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Producto','Costo/u','Costo total','Mejor precio','Margen'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {savedProducts.map(p => {
                    const best = (p.canales || []).reduce((a, b) => (b.precio > a.precio ? b : a), { precio: 0, nombre: '' });
                    const margen = best.precio > 0 ? Math.round((best.precio - p.costoARS) / p.costoARS * 100) : 0;
                    const badge = margen >= 50 ? 'green' : margen >= 20 ? 'amber' : 'red';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
                        <td style={{ padding: '10px' }}><strong>{p.nombre}</strong><br/><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.qty} u · DI {p.di}%</span></td>
                        <td style={{ padding: '10px' }}>{ars(p.costoARS)}</td>
                        <td style={{ padding: '10px' }}>{ars(p.costoARS * p.qty)}</td>
                        <td style={{ padding: '10px' }}>{ars(best.precio)}<br/><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{best.nombre}</span></td>
                        <td style={{ padding: '10px' }}><span className={`badge badge-${badge}`}>{margen}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
