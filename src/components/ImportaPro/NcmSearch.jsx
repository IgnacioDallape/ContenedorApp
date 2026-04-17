import { useMemo, useState } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { NCM_FRECUENTES } from '../../lib/constants.js';

const CATEGORIAS = ['Todas', ...Array.from(new Set(NCM_FRECUENTES.map(n => n.cat).filter(Boolean))).sort()];

const DI_BADGE = { 0: 'green', 12: 'green', 18: 'amber', 20: 'amber', 35: 'red' };
function diToBadge(di) { return DI_BADGE[di] ?? (di === 0 ? 'green' : di <= 12 ? 'green' : di <= 20 ? 'amber' : 'red'); }

export default function NcmSearch() {
  const { setInputs } = useImportaproStore();
  const { showToast, setActiveSection } = useAppStore();

  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState('');
  const [catActiva, setCat] = useState('Todas');

  function applyDi(di) {
    setInputs({ di });
    showToast(`DI ${di}% aplicado a la calculadora`);
    setActiveSection('calc');
  }

  const busquedaRapida = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return NCM_FRECUENTES
      .filter(n =>
        n.code.toLowerCase().includes(q) ||
        n.desc.toLowerCase().includes(q) ||
        (n.cat || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aCodeStarts = a.code.toLowerCase().startsWith(q) ? 1 : 0;
        const bCodeStarts = b.code.toLowerCase().startsWith(q) ? 1 : 0;
        if (aCodeStarts !== bCodeStarts) return bCodeStarts - aCodeStarts;

        const aDescStarts = a.desc.toLowerCase().startsWith(q) ? 1 : 0;
        const bDescStarts = b.desc.toLowerCase().startsWith(q) ? 1 : 0;
        if (aDescStarts !== bDescStarts) return bDescStarts - aDescStarts;

        return a.desc.localeCompare(b.desc);
      })
      .slice(0, 6);
  }, [query]);

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
                <h2>Buscá dentro de tu base cargada y resolvé más rápido.</h2>
                <p>
                  Usá esta búsqueda rápida para encontrar códigos NCM ya cargados por descripción, código o rubro,
                  y aplicá el DI directo a la calculadora.
                </p>
              </div>

              <div className="ncm-hero-meta">
                <div className="ncm-stat-card">
                  <span className="ncm-stat-value">{NCM_FRECUENTES.length}</span>
                  <span className="ncm-stat-label">NCM cargados</span>
                </div>
                <div className="ncm-stat-card ncm-stat-card-soft">
                  <span className="ncm-stat-value">{CATEGORIAS.length - 1}</span>
                  <span className="ncm-stat-label">rubros disponibles</span>
                </div>
              </div>

              <div className="ncm-search-box">
                <label htmlFor="ncm-quick-query" className="ncm-search-label">Buscar dentro de los NCM cargados</label>
                <div className="ncm-search-row">
                  <span className="ncm-search-icon" aria-hidden="true">⌕</span>
                  <input
                    id="ncm-quick-query"
                    type="text"
                    value={query}
                    placeholder="Ej: alfombra, auriculares, 8517, ropa deportiva..."
                    className="ncm-search-input"
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
                <p className="ncm-search-help">
                  Podés buscar por descripción, código NCM o categoría para encontrar coincidencias más rápido.
                </p>
              </div>

              <div className="ncm-warning">
                <strong>Importante:</strong> este porcentaje puede estar desactualizado al momento del uso.
                Corroborá siempre el DI con un despachante de aduanas antes de tomarlo como definitivo.
              </div>

              {query.trim() && (
                <div className="ncm-ai-results">
                  <div className="ncm-results-header">
                    <span className="card-title">Coincidencias rápidas</span>
                    <span className="ncm-results-count">{busquedaRapida.length} resultados</span>
                  </div>

                  {busquedaRapida.length > 0 ? (
                    <div className="ncm-results-list">
                      {busquedaRapida.map((r, i) => (
                        <article key={r.code + i} className="ncm-result-card ncm-result-card-ai">
                          <div className="ncm-result-main">
                            <div className="ncm-result-code">{r.code}</div>
                            <div className="ncm-result-desc">{r.desc}</div>
                            {r.cat && <div className="ncm-result-cat">{r.cat}</div>}
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
                  ) : (
                    <div className="ncm-empty-state">
                      No encontramos coincidencias en los NCM cargados para "{query}".
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="card ncm-side-card">
              <div className="card-title">Cómo usarlo</div>
              <div className="ncm-side-stack">
                <div className="ncm-tip">
                  <span className="ncm-tip-index">01</span>
                  <div>
                    <strong>Buscá por nombre o código</strong>
                    <p>Escribí una palabra clave, parte del código o el rubro para filtrar rápido.</p>
                  </div>
                </div>
                <div className="ncm-tip">
                  <span className="ncm-tip-index">02</span>
                  <div>
                    <strong>Compará opciones cercanas</strong>
                    <p>Revisá varias coincidencias antes de elegir el DI que vas a llevar a la calculadora.</p>
                  </div>
                </div>
                <div className="ncm-tip">
                  <span className="ncm-tip-index">03</span>
                  <div>
                    <strong>Validalo antes de cerrar</strong>
                    <p>Tomalo como referencia inicial y confirmalo con tu despachante de aduanas.</p>
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
