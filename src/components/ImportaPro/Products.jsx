import { useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import useContainerStore from '../../stores/containerStore.js';
import { ars } from '../../lib/formatters.js';

function getCanalData(p, keyword) {
  const ch = p.canales?.find(c => c.nombre.toLowerCase().includes(keyword));
  if (!ch || !ch.precio) return null;
  const com = ch.precio * (ch.comision || 0) / 100;
  const gan = ch.precio - com - (ch.cuotas || 0) - p.costoARS;
  const margen = p.costoARS > 0 ? Math.round(gan / p.costoARS * 100) : 0;
  return { precio: ch.precio, gan, margen };
}

export default function Products() {
  const { savedProducts, loadProductToCalc, deleteProduct } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();
  const { catalog, addToCatalog, deleteCatalogItem, selectedCatalogItems, setSelectedCatalogItems, clearCatalogSelection, addProduct: addToContainer } = useContainerStore();

  const [selectedItems, setSelectedItems] = useState({});
  const [selectedZones, setSelectedZones] = useState({});

  function handleLoadProduct(p) {
    loadProductToCalc(p);
    setActiveSection('calc');
  }

  function handleDelete(i) {
    const p = savedProducts[i];
    // Remove from catalog too
    if (p) {
      const catalogItem = catalog.find(c => c.name === p.nombre);
      if (catalogItem) deleteCatalogItem(catalogItem.id);
    }
    deleteProduct(i);
    showToast('Producto eliminado');
  }

  if (!savedProducts.length) {
    return (
      <div className="ip-section active" id="section-products">
        <section id="tab-products" className="tab" style={{ display: 'block' }}>
          <div className="page-header">
            <h1>Mis productos</h1>
            <p className="page-sub">Productos guardados desde la calculadora</p>
          </div>
          <div id="no-products" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48 }}>◧</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Todavía no tenés productos guardados.</div>
            <button className="btn-outline" onClick={() => setActiveSection('calc')}>Ir a la calculadora →</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ip-section active" id="section-products">
      <section id="tab-products" className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Mis productos</h1>
          <p className="page-sub">Guardados desde la calculadora — hacé clic para editar</p>
        </div>

        <div id="products-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {savedProducts.map((p, i) => {
            const ml   = getCanalData(p, 'mercado');
            const tp   = getCanalData(p, 'tienda');
            const best = p.canales?.reduce((a, b) => (b.precio > a.precio ? b : a), { precio: 0 }) || { precio: 0 };
            const bestMargen = best.precio > 0 ? Math.round((best.precio - p.costoARS) / p.costoARS * 100) : 0;
            const topBadge = bestMargen >= 50 ? 'green' : bestMargen >= 20 ? 'amber' : 'red';
            const hasDims = p.dims && p.dims.L && p.dims.W && p.dims.H;

            const ChanRow = ({ label, data, color }) => data ? (
              <div style={{ padding: '12px 14px', background: 'linear-gradient(135deg,rgba(26,79,138,0.08) 0%,rgba(26,79,138,0.04) 100%)', border: '1px solid rgba(26,79,138,0.08)', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 5 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{ars(data.precio)}</div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <span className={`badge badge-${data.margen >= 50 ? 'green' : data.margen >= 20 ? 'amber' : 'red'}`}>{data.margen}%</span>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color }}>{ars(data.gan)}</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '11px 14px', background: 'rgba(26,79,138,0.04)', border: '1px solid rgba(26,79,138,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label} — sin precio</div>
            );

            return (
              <div key={p.id} className="product-card" onClick={() => handleLoadProduct(p)}>
                <div style={{ textAlign: 'center', marginBottom: 18, position: 'relative' }}>
                  <div className="product-name" style={{ fontSize: 22, marginBottom: 8 }}>{p.nombre}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{ars(p.costoARS)}</div>
                  <div className="product-date" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{p.date} · {p.qty} unidades</div>
                  <span className={`badge badge-${topBadge}`} style={{ position: 'absolute', top: 0, right: 0 }}>{bestMargen}%</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  <ChanRow label="Mercado Libre" data={ml} color="var(--green)" />
                  <ChanRow label="Tienda propia" data={tp} color="var(--accent)" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(26,79,138,0.06)' }}>
                  <div className="product-metric" style={{ textAlign: 'center' }}>
                    <div className="pm-label">FOB 1688</div>
                    <div className="pm-value" style={{ fontSize: 16 }}>U$S {p.fob}</div>
                  </div>
                  <div className="product-metric" style={{ textAlign: 'center' }}>
                    <div className="pm-label">DI aplicado</div>
                    <div className="pm-value" style={{ fontSize: 16 }}>{p.di}%</div>
                  </div>
                </div>

                <div className="product-actions" onClick={e => e.stopPropagation()}>
                  {p.link1688 && <a href={p.link1688} target="_blank" rel="noreferrer" className="btn-outline" style={{ textDecoration: 'none' }}>1688 ↗</a>}
                  {p.linkML   && <a href={p.linkML}   target="_blank" rel="noreferrer" className="btn-outline" style={{ textDecoration: 'none' }}>ML ↗</a>}
                  <button className="btn-outline" onClick={() => handleLoadProduct(p)}>Editar</button>
                  {hasDims
                    ? <span className="badge badge-green" style={{ marginLeft: 'auto' }}>📦 En catálogo</span>
                    : <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 0', fontWeight: 500 }}>Sin dimensiones</span>
                  }
                  <button className="del-btn" onClick={() => handleDelete(i)}>× Eliminar</button>
                </div>

                {p.photos && (p.photos[0] || p.photos[1]) && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(26,79,138,0.06)' }}>
                    {p.photos[0] && <img src={p.photos[0]} style={{ width: 90, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(26,79,138,0.1)' }} title="Foto 1688" />}
                    {p.photos[1] && <img src={p.photos[1]} style={{ width: 90, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(26,79,138,0.1)' }} title="Foto ML" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {savedProducts.length >= 2 && (
          <div id="compare-section" style={{ marginTop: 24 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Comparativa de productos</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Producto','Costo/u','Costo total','Mejor precio','Margen'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {savedProducts.map(p => {
                      const best = p.canales?.reduce((a, b) => (b.precio > a.precio ? b : a), { precio: 0, nombre: '' }) || { precio: 0, nombre: '' };
                      const margen = best.precio > 0 ? Math.round((best.precio - p.costoARS) / p.costoARS * 100) : 0;
                      const badge = margen >= 50 ? 'green' : margen >= 20 ? 'amber' : 'red';
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
                          <td style={{ padding: '10px 10px' }}><strong>{p.nombre}</strong><br/><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.qty} u · DI {p.di}%</span></td>
                          <td style={{ padding: '10px 10px' }}>{ars(p.costoARS)}</td>
                          <td style={{ padding: '10px 10px' }}>{ars(p.costoARS * p.qty)}</td>
                          <td style={{ padding: '10px 10px' }}>{ars(best.precio)}<br/><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{best.nombre}</span></td>
                          <td style={{ padding: '10px 10px' }}><span className={`badge badge-${badge}`}>{margen}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
