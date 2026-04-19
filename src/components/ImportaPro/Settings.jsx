import { useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';

export default function Settings() {
  const { inputs, updateGlobalTC, tcUpdatedAt } = useImportaproStore();
  const { setActiveSection } = useAppStore();
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  async function handleFetchTC() {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch('https://api.bluelytics.com.ar/v2/latest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const value = Math.round(data.blue.value_avg);
      updateGlobalTC(value);
    } catch (e) {
      setFetchError(e.message || 'Error al obtener el tipo de cambio');
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="ip-section active" id="section-settings">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ margin: 0 }}>Configuracion</h1>
            <button
              onClick={() => setActiveSection('calc')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              Volver a la calculadora
            </button>
          </div>
          <p className="page-sub">Tipo de cambio y preferencias generales</p>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem', maxWidth: 500 }}>
          <div className="card-header">
            <span className="card-title">Tipo de cambio</span>
          </div>
          <div className="field">
            <label>USD / ARS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                value={inputs.globalTC}
                min="1"
                style={{ flex: 1 }}
                onChange={e => updateGlobalTC(parseFloat(e.target.value) || 1450)}
              />
              <span className="tc-badge">USD/ARS</span>
              <button
                onClick={handleFetchTC}
                disabled={fetching}
                style={{ padding: '0 12px', height: 38, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', cursor: fetching ? 'not-allowed' : 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, opacity: fetching ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {fetching ? '...' : 'Actualizar dolar blue'}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              {tcUpdatedAt
                ? <span style={{ color: 'var(--green)' }}>Actualizado: {new Date(tcUpdatedAt).toLocaleString('es-AR')}</span>
                : <span style={{ color: 'var(--amber, #e6a817)' }}>Sin actualizar</span>}
              {fetchError && <span style={{ color: 'var(--red)', marginLeft: 10 }}>{fetchError}</span>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
