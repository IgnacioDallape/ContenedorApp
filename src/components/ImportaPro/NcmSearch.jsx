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

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [catActiva, setCat] = useState('Todas');

  async function buscarNcm() {
    if (!query.trim()) return;
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      setError('Configurá tu API Key de Anthropic en la barra lateral para usar la búsqueda IA.');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
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
        <div className="page-header ncm-header">
          <h1>Búsqueda NCM</h1>
          <p className="page-sub">Encontrá el código NCM y derecho de importación para tu producto</p>
        </div>

        <div className="ncm-layout">
          <div className="ncm-top-grid">
            <div className="card ncm-hero-card">
              <div className="ncm-hero-copy">
                <div className="card-title">Buscador NCM</div>
                <h2>Buscá por descripción y encontrá una referencia rápida.</h2>
                <p>
                  Describí el producto en lenguaje natural para obtener códigos NCM probables junto con su
                  derecho de importación estimado.
                </p>
              </div>

              <div className="ncm-hero-meta">
                <div className="ncm-stat">
                  <span className="ncm-stat-value">{NCM_FRECUENTES.length}</span>
                  <span className="ncm-stat-label">NCM frecuentes cargados</span>
                </div>
              </div>

              <div className="ncm-search-box">
                <label htmlFor="ncm-ai-query" className="ncm-search-label">Descripción del producto</label>
                <div className="ncm-search-row">
                  <input
                    id="ncm-ai-query"
                    type="text"
                    value={query}
                    placeholder="Ej: alfombra de nylon para cocina, base antideslizante..."
                    className="ncm-search-input"
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarNcm()}
                  />
                  <button className="btn-primary ncm-search-btn" onClick={buscarNcm} disabled={loading}>
                    {loading ? 'Buscando…' : 'Buscar NCM'}
                  </button>
                </div>
                <p className="ncm-search-help">
                  Consejo: incluí material, uso principal y tipo de producto para obtener resultados más precisos.
                </p>
              </div>

              <div className="ncm-warning">
                <strong>Importante:</strong> este porcentaje puede estar desactualizado al momento del uso.
                Corroborá siempre el DI con un despachante de aduanas antes de tomarlo como definitivo.
              </div>

              {error && <div className="ncm-error">{error}</div>}

              {results.length > 0 && (
                <div className="ncm-ai-results">
                <div className="ncm-results-header">
                    <span className="card-title">Resultados sugeridos</span>
                    <span className="ncm-results-count">{results.length} coincidencias</span>
                  </div>

                  <div className="ncm-results-list">
                    {results.map((r, i) => (
                      <article key={i} className="ncm-result-card ncm-result-card-ai">
                        <div className="ncm-result-main">
                          <div className="ncm-result-code">{r.code}</div>
                          <div className="ncm-result-desc">{r.desc}</div>
                        </div>
                        <div className="ncm-result-actions">
                          <span className={`badge badge-${diToBadge(r.di)}`}>DI {r.di}%</span>
                          <button onClick={() => applyDi(r.di)} className="ncm-apply-btn">
                            Aplicar a calculadora
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="card ncm-side-card">
              <div className="card-title">Cómo usarlo</div>
              <div className="ncm-side-stack">
                <div className="ncm-tip">
                  <span className="ncm-tip-index">01</span>
                  <div>
                    <strong>Describí el producto</strong>
                    <p>Indicá material, uso, tamaño o familia del artículo para afinar la búsqueda.</p>
                  </div>
                </div>
                <div className="ncm-tip">
                  <span className="ncm-tip-index">02</span>
                  <div>
                    <strong>Contrastá con los frecuentes</strong>
                    <p>Usá la base local para comparar alternativas cercanas por rubro o código.</p>
                  </div>
                </div>
                <div className="ncm-tip">
                  <span className="ncm-tip-index">03</span>
                  <div>
                    <strong>Aplicá el DI</strong>
                    <p>Con un click lo llevás a la calculadora para seguir trabajando el costo final.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="card ncm-library-card">
            <div className="ncm-library-head">
              <div>
                <div className="card-title">Biblioteca NCM</div>
                <h3>NCM frecuentes para explorar y aplicar</h3>
              </div>
              <span className="ncm-results-count">{frecuentesFiltrados.length} resultados</span>
            </div>

            <div className="ncm-filter-panel">
              <input
                type="text"
                value={filtro}
                placeholder="Filtrar por descripción o código NCM..."
                onChange={e => setFiltro(e.target.value)}
                className="ncm-filter-input"
              />

              <div className="ncm-chip-row">
                {CATEGORIAS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`ncm-chip ${catActiva === c ? 'active' : ''}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div id="ncm-frecuentes" className="ncm-results-list">
              {frecuentesFiltrados.length === 0 && (
                <div className="ncm-empty-state">
                  Sin resultados para "{filtro}"
                </div>
              )}
              {frecuentesFiltrados.map((n, i) => (
                <article key={n.code + i} className="ncm-result-card">
                  <div className="ncm-result-main">
                    <div className="ncm-result-code">{n.code}</div>
                    <div className="ncm-result-desc">{n.desc}</div>
                    {n.cat && <div className="ncm-result-cat">{n.cat}</div>}
                  </div>
                  <div className="ncm-result-actions">
                    <span className={`badge badge-${n.badge}`}>DI {n.di}%</span>
                    <button onClick={() => applyDi(n.di)} className="ncm-apply-btn">
                      Aplicar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
