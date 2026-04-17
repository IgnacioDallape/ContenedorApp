import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars } from '../../lib/formatters.js';

function formatDate(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

export default function Prices() {
  const { publicationPlans, removePublicationPlan } = useImportaproStore();
  const { setActiveSection, showToast } = useAppStore();

  if (!publicationPlans.length) {
    return (
      <div className="ip-section active" id="section-prices">
        <section className="tab" style={{ display: 'block' }}>
          <div className="page-header">
            <h1>Precios confirmados</h1>
            <p className="page-sub">Acá quedan los precios definidos desde el simulador para revisar antes de publicar</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48 }}>🏷</div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Todavía no confirmaste precios para publicar</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', maxWidth: 420 }}>
              Primero simulá un producto, elegí qué canales vas a usar y confirmá esos precios desde la sección de simulador.
            </p>
            <button className="btn-primary" onClick={() => setActiveSection('simulator')} style={{ marginTop: 8 }}>
              Ir al simulador
            </button>
          </div>
        </section>
      </div>
    );
  }

  const totalChannels = publicationPlans.reduce((acc, plan) => acc + plan.channels.filter(ch => ch.publicar && ch.precio > 0).length, 0);

  return (
    <div className="ip-section active" id="section-prices">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Precios confirmados</h1>
          <p className="page-sub">Listado confirmado desde el simulador, listo para revisar antes de publicar</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(26,79,138,0.05), #fff)' }}>
            <div className="card-title">Productos listos</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--accent)', lineHeight: 1, marginTop: 8 }}>{publicationPlans.length}</div>
          </div>
          <div className="card" style={{ padding: '1rem 1.1rem', background: 'linear-gradient(180deg, rgba(26,122,74,0.05), #fff)' }}>
            <div className="card-title">Canales confirmados</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 34, color: 'var(--green)', lineHeight: 1, marginTop: 8 }}>{totalChannels}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {publicationPlans.map(plan => {
            const activeChannels = plan.channels.filter(ch => ch.publicar && ch.precio > 0);
            return (
              <div key={plan.productId} className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header" style={{ alignItems: 'start' }}>
                  <div>
                    <span className="card-title">{plan.productName}</span>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="badge badge-blue">Costo {ars(plan.costoARS)}</span>
                      <span className="badge badge-green">Margen objetivo {plan.targetMargin}%</span>
                      <span className="badge badge-amber">{activeChannels.length} canal{activeChannels.length === 1 ? '' : 'es'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Actualizado {formatDate(plan.updatedAt)}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-outline" onClick={() => setActiveSection('simulator')}>Editar</button>
                      <button
                        className="btn-outline"
                        onClick={() => {
                          removePublicationPlan(plan.productId);
                          showToast(`Se quitó "${plan.productName}" de precios a publicar`);
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Canal', 'Precio confirmado', 'Sugerido', 'Comisión', 'Ganancia/u', 'Margen post-IIGG'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeChannels.map(ch => {
                        const badge = ch.mgReal >= 30 ? 'green' : ch.mgReal >= 10 ? 'amber' : 'red';
                        return (
                          <tr key={ch.nombre} style={{ borderBottom: '1px solid var(--border-2)' }}>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{ch.nombre}</td>
                            <td style={{ padding: '10px', fontWeight: 800, color: 'var(--accent)' }}>{ars(ch.precio)}</td>
                            <td style={{ padding: '10px', color: 'var(--text-2)' }}>{ars(ch.sugerido)}</td>
                            <td style={{ padding: '10px', color: 'var(--text-2)' }}>{ch.comision}%</td>
                            <td style={{ padding: '10px', fontWeight: 600, color: ch.ganPost >= 0 ? 'var(--green)' : 'var(--red)' }}>{ars(ch.ganPost)}</td>
                            <td style={{ padding: '10px' }}><span className={`badge badge-${badge}`}>{ch.mgReal}%</span></td>
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
      </section>
    </div>
  );
}
