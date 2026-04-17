import { useState, useMemo } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { NCM_FRECUENTES } from '../../lib/constants.js';

const CATEGORIAS = ['Todas', ...Array.from(new Set(NCM_FRECUENTES.map(n => n.cat).filter(Boolean))).sort()];

const DI_BADGE = { 0: 'green', 12: 'green', 18: 'amber', 20: 'amber', 35: 'red' };
function diToBadge(di) { return DI_BADGE[di] ?? (di === 0 ? 'green' : di <= 12 ? 'green' : di <= 20 ? 'amber' : 'red'); }

export default function NcmSearch() {
  const { apiKey, setInputs } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [filtro, setFiltro]     = useState('');
  const [catActiva, setCat]     = useState('Todas');

  async function buscarNcm() {
    if (!query.trim()) return;
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      setError('Configurá tu API Key de Anthropic en la barra lateral para usar la búsqueda IA.');
      return;
    }
    setLoading(true); setError(''); setResults([]);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `Sos un experto en comercio exterior argentino. Para el producto "${query}", dame los 3 NCM más probables con su descripción y derecho de importación (DI%). Responde SOLO con JSON válido, sin texto adicional, con este formato:
[{"code":"XXXX.XX","desc":"descripción corta","di":NN},...]`,
          }],
        }),
      });
      if (!resp.ok) throw new Error('Error API: ' + resp.status);
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Respuesta inválida');
      const parsed = JSON.parse(jsonMatch[0]);
      setResults(parsed);
    } catch (e) {
      setError('Error al consultar la IA: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyDi(di) {
    setInputs({ di });
    showToast(`DI ${di}% aplicado a la calculadora`);
    setActiveSection('calc');
  }

  const frecuentesFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return NCM_FRECUENTES.filter(n => {
      const matchCat = catActiva === 'Todas' || n.cat === catActiva;
      if (!matchCat) return false;
      if (!q) return true;
      return n.code.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q);
    }).sort((a, b) => a.desc.localeCompare(b.desc));
  }, [filtro, catActiva]);

  return (
    <div className="ip-section active" id="section-ncm">
      <section id="tab-ncm" className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Búsqueda NCM</h1>
          <p className="page-sub">Encontrá el código NCM y derecho de importación para tu producto</p>
        </div>

        <div className="card" style={{ maxWidth: 700 }}>
          <div className="card-header"><span className="card-title">Buscar por IA (Claude Haiku)</span></div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Describí tu producto y la IA buscará el NCM más probable. Necesitás una API Key de Anthropic configurada en la barra lateral.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={query}
              placeholder="Ej: alfombra de nylon para cocina..."
              style={{ flex: 1 }}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarNcm()}
            />
            <button className="btn-primary" onClick={buscarNcm} disabled={loading}>
              {loading ? 'Buscando…' : 'Buscar →'}
            </button>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {results.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {results.map((r, i) => (
                <div key={i} className="ncm-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-2)' }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{r.code}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{r.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                    <span className={`badge badge-${diToBadge(r.di)}`}>DI {r.di}%</span>
                    <button
                      onClick={() => applyDi(r.di)}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
                    >
                      Aplicar →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ maxWidth: 700, marginTop: 20 }}>
          <div className="card-header">
            <span className="card-title">NCM frecuentes</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 8 }}>{frecuentesFiltrados.length} resultados</span>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={filtro}
              placeholder="Filtrar por descripción o código NCM..."
              onChange={e => setFiltro(e.target.value)}
              style={{ fontSize: 13 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIAS.map(c => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: catActiva === c ? 'var(--accent)' : 'transparent',
                    color: catActiva === c ? '#fff' : 'var(--text-2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    fontWeight: catActiva === c ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div id="ncm-frecuentes">
            {frecuentesFiltrados.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 13, padding: '24px 0' }}>
                Sin resultados para "{filtro}"
              </div>
            )}
            {frecuentesFiltrados.map((n, i) => (
              <div key={n.code + i} className="ncm-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-2)' }}>
                <span className="ncm-desc" style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text)', marginRight: 8 }}>{n.code}</span>
                  {n.desc}
                  {n.cat && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-2)', opacity: 0.7 }}>{n.cat}</span>}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                  <span className={`badge badge-${n.badge}`}>DI {n.di}%</span>
                  <button
                    onClick={() => applyDi(n.di)}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
