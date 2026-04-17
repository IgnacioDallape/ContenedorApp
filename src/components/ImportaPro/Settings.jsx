import { useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';

export default function Settings() {
  const { apiKey, setApiKey, inputs, updateGlobalTC, tcUpdatedAt } = useImportaproStore();
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const keyStatus = apiKey?.startsWith('sk-ant-') ? 'ok' : apiKey ? 'warn' : 'none';

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
          <h1>Configuración</h1>
          <p className="page-sub">Tipo de cambio y acceso a IA</p>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem', maxWidth: 500 }}>
          <div className="card-header"><span className="card-title">Tipo de cambio</span></div>
          <div className="field">
            <label>USD / ARS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" value={inputs.globalTC} min="1" style={{ flex: 1 }}
                onChange={e => updateGlobalTC(parseFloat(e.target.value) || 1450)}
              />
              <span className="tc-badge">USD/ARS</span>
              <button
                onClick={handleFetchTC}
                disabled={fetching}
                style={{ padding: '0 12px', height: 38, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', cursor: fetching ? 'not-allowed' : 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, opacity: fetching ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {fetching ? '...' : '🔄 Actualizar dólar blue'}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              {tcUpdatedAt
                ? <span style={{ color: 'var(--green)' }}>Actualizado: {new Date(tcUpdatedAt).toLocaleString('es-AR')}</span>
                : <span style={{ color: 'var(--amber, #e6a817)' }}>Sin actualizar</span>
              }
              {fetchError && <span style={{ color: 'var(--red)', marginLeft: 10 }}>{fetchError}</span>}
            </div>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 500 }}>
          <div className="card-header">
            <span className="card-title">API Key Anthropic</span>
            <span style={{ fontSize: 11, color: keyStatus === 'ok' ? 'var(--green)' : keyStatus === 'warn' ? 'var(--amber)' : 'var(--text-3)' }}>
              {keyStatus === 'ok' ? '✓ Configurada' : keyStatus === 'warn' ? '⚠ Formato inválido' : 'Sin configurar'}
            </span>
          </div>
          <div className="field">
            <label>Pegá tu key para búsqueda NCM con IA</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                placeholder="sk-ant-..."
                style={{ flex: 1 }}
                onChange={e => setApiKey(e.target.value)}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ padding: '0 12px', height: 38, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 14 }}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Obtené tu key gratis en{' '}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>console.anthropic.com</a>
              {' '}→ API Keys
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
