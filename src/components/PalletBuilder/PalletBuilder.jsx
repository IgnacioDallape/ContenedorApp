import { useState, useCallback } from 'react';
import usePalletStore from '../../stores/palletStore.js';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { PB_PALLET_TYPES, PB_COLORS } from '../../lib/constants.js';
import PalletThreeCanvas from './PalletThreeCanvas.jsx';

const PRODUCT_DEFAULTS = {
  name: '', L: '', W: '', H: '', qty: '', weight: '', mustBeBase: false,
};

export default function PalletBuilder() {
  const {
    palletType, maxHeight, products, results, activeResult,
    setPalletType, setMaxHeight, addOrUpdateProduct, removeProduct,
    setEditingId, editingId, build, setActiveResult, clearResults,
  } = usePalletStore();
  const { setPendingProduct, catalog, setActiveSection: containerNav } = useContainerStore();
  const { setActiveSection, showToast } = useAppStore();

  const [form, setForm] = useState({ ...PRODUCT_DEFAULTS });
  const [showProductForm, setShowProductForm] = useState(false);
  const [catalogModal, setCatalogModal] = useState(false);
  const [catalogSel, setCatalogSel] = useState({}); // { id: qty }

  const pt = PB_PALLET_TYPES[palletType];

  // ── Product form ──
  function openNewForm() {
    setEditingId(null);
    setForm({ ...PRODUCT_DEFAULTS });
    setShowProductForm(true);
  }

  function openEditForm(p) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      L: String(p.dims.L),
      W: String(p.dims.W),
      H: String(p.dims.H),
      qty: String(p.qty),
      weight: String(p.weight || ''),
      mustBeBase: p.mustBeBase || false,
    });
    setShowProductForm(true);
  }

  function saveProduct() {
    const name = form.name.trim();
    const L = parseFloat(form.L), W = parseFloat(form.W), H = parseFloat(form.H);
    const qty = parseInt(form.qty);
    const weight = parseFloat(form.weight) || 0;

    if (!name) return showToast('Ingresá el nombre', 'error');
    if (!L || !W || !H) return showToast('Ingresá las dimensiones', 'error');
    if (!qty || qty < 1) return showToast('Ingresá la cantidad', 'error');
    if (qty > 250) return showToast('Máximo 250 por producto', 'error');

    const minDim = Math.min(L, W, H);
    if (minDim > Math.max(pt.L, pt.W)) return showToast('La caja es más grande que el pallet', 'error');

    addOrUpdateProduct({ name, dims: { L, W, H }, qty, weight, mustBeBase: form.mustBeBase });
    clearResults();
    setShowProductForm(false);
    setForm({ ...PRODUCT_DEFAULTS });
  }

  function cancelForm() {
    setShowProductForm(false);
    setEditingId(null);
    setForm({ ...PRODUCT_DEFAULTS });
  }

  // ── Build ──
  function handleBuild() {
    if (!products.length) return showToast('Agregá productos primero', 'error');
    build();
    if (usePalletStore.getState().results.length) {
      showToast(`✓ ${usePalletStore.getState().results.length} pallet(s) armado(s)`, 'success');
    }
  }

  // ── Export to container ──
  function addPalletToContainer(result) {
    setPendingProduct({
      name: `Pallet ${result.idx + 1} (${result.boxes.length} cj)`,
      type: 'pallet',
      dims: { L: result.palL, W: result.palW, H: result.totalHeight },
      qty: 1,
      price: 0,
      weight: result.totalWeight,
      priorityZone: null,
      packedItems: result.boxes,
      palletBase: { L: result.palL, W: result.palW },
    });
    setActiveSection('container');
  }

  function addAllPalletsToContainer() {
    if (!results.length) return;
    const store = useContainerStore.getState();
    let added = 0;
    for (const r of results) {
      const s = useContainerStore.getState();
      const vol = (r.palL * r.palW * r.totalHeight) / 1e6;
      const usedVol = s.loadedProducts.reduce((acc, p) => acc + p.vol * p.qty, 0);
      if (usedVol + vol > s.CONTAINER_VOL) break;
      store.addProduct({
        name: `Pallet ${r.idx + 1} (${r.boxes.length} cj)`,
        type: 'pallet',
        dims: { L: r.palL, W: r.palW, H: r.totalHeight },
        qty: 1, price: 0, weight: r.totalWeight,
        priorityZone: null, packedItems: r.boxes, palletBase: { L: r.palL, W: r.palW },
      });
      added++;
    }
    setActiveSection('container');
    if (added < results.length) {
      showToast(`✓ ${added} de ${results.length} pallets agregados — el contenedor se llenó`, 'error');
    } else {
      showToast(`✓ ${added} pallets agregados al contenedor`, 'success');
    }
  }

  // ── Catalog picker ──
  function openCatalogPicker() {
    const boxItems = catalog.filter(p => p.dims && p.type !== 'pallet');
    if (!boxItems.length) return showToast('No hay cajas con dimensiones en el catálogo', 'error');
    setCatalogSel({});
    setCatalogModal(true);
  }

  function loadFromCatalog() {
    const catItems = catalog.filter(p => p.dims && p.type !== 'pallet');
    let added = 0;
    for (const [sid, qty] of Object.entries(catalogSel)) {
      if (!qty) continue;
      const p = catItems.find(x => String(x.id) === sid);
      if (!p) continue;
      addOrUpdateProduct({
        name: p.name,
        dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
        qty: Math.max(1, parseInt(qty) || 1),
        weight: p.weight || 0,
        mustBeBase: false,
      });
      added++;
    }
    clearResults();
    setCatalogModal(false);
    showToast(`✓ ${added} producto(s) agregado(s) al pallet`, 'success');
  }

  // ── Active result ──
  const activeRes = results[activeResult] || null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Armador de pallets</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Motor BFD de precisión 2 cm</p>
        </div>

        {/* Pallet config */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 8 }}>TIPO DE PALLET</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Object.entries(PB_PALLET_TYPES).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setPalletType(key)}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
                  border: palletType === key ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: palletType === key ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'var(--bg-3)',
                  color: palletType === key ? 'var(--accent)' : 'var(--text-2)',
                }}
              >
                {val.label}<br />
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", opacity: 0.8 }}>{val.dims}</span>
              </button>
            ))}
          </div>

          <div className="field">
            <label>Altura máxima <span className="unit">cm</span></label>
            <input
              type="range" min="80" max="240" step="5" value={maxHeight}
              onChange={e => setMaxHeight(e.target.value)}
              style={{ width: '100%', marginBottom: 2 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
              <span>80 cm</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{maxHeight} cm</span>
              <span>240 cm</span>
            </div>
          </div>
        </div>

        {/* Products list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)' }}>PRODUCTOS ({products.length})</span>
            <button
              onClick={openCatalogPicker}
              style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-2)' }}
            >
              + Catálogo
            </button>
          </div>

          {!products.length ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 12 }}>Sin productos aún.</p>
            </div>
          ) : (
            products.map(p => (
              <div key={p.id} className="queue-item" style={{ marginBottom: 6 }}>
                <div className="queue-dot" style={{ background: p.color }} />
                <div className="queue-info">
                  <div className="queue-name">
                    {p.name}
                    {p.mustBeBase && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>
                        ⬇ BASE
                      </span>
                    )}
                  </div>
                  <div className="queue-meta">
                    {p.dims.L}×{p.dims.W}×{p.dims.H} cm · {p.qty} cj
                    {p.weight > 0 ? ` · ${p.weight} kg/u` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <button
                    onClick={() => openEditForm(p)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 5px', fontSize: 9, color: 'var(--text-3)', cursor: 'pointer' }}
                  >✎</button>
                  <button
                    className="btn-remove"
                    onClick={() => { removeProduct(p.id); clearResults(); }}
                  >×</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom buttons */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={openNewForm}
            style={{ width: '100%', padding: '9px 0', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            + Agregar producto
          </button>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '10px 0' }}
            onClick={handleBuild}
            disabled={!products.length}
          >
            Armar pallets
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Results panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!results.length ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🟫</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Configurá los productos y presioná "Armar pallets"</p>
              <p style={{ fontSize: 13 }}>El motor BFD calculará la distribución óptima de cajas.</p>
            </div>
          ) : (
            <>
              {/* Pallet tabs + export buttons */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveResult(i)}
                    style={{
                      padding: '6px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px',
                      border: `1.5px solid ${i === activeResult ? 'var(--accent)' : 'var(--border)'}`,
                      background: i === activeResult ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'transparent',
                      color: i === activeResult ? 'var(--accent)' : 'var(--text-3)',
                      fontWeight: i === activeResult ? 700 : 400,
                    }}
                  >
                    🟫 Pallet {r.idx + 1} <span style={{ opacity: 0.7 }}>{r.boxes.length} cj</span>
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => activeRes && addPalletToContainer(activeRes)}
                    style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 700 }}
                  >
                    + Este pallet
                  </button>
                  {results.length > 1 && (
                    <button
                      onClick={addAllPalletsToContainer}
                      style={{ padding: '6px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700 }}
                    >
                      + Todos ({results.length})
                    </button>
                  )}
                </div>
              </div>

              {/* 3D + summary split */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* 3D view */}
                <div style={{ flex: 1, padding: 12, minWidth: 0 }}>
                  <PalletThreeCanvas result={activeRes} />
                </div>

                {/* Summary panel */}
                {activeRes && (
                  <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 14 }}>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'TIPO', val: PB_PALLET_TYPES[activeRes.type]?.label, sub: PB_PALLET_TYPES[activeRes.type]?.dims },
                        { label: 'ALTURA', val: `${activeRes.totalHeight} cm`, sub: `de ${maxHeight} cm máx` },
                        { label: 'CAJAS', val: activeRes.boxes.length, sub: 'unidades' },
                        { label: 'PESO', val: `${activeRes.totalWeight.toFixed(1)} kg`, sub: 'estimado' },
                      ].map(s => (
                        <div key={s.label} style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Per-product breakdown */}
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1, color: 'var(--text-3)', marginBottom: 6 }}>DISTRIBUCIÓN</div>
                    {(() => {
                      const counts = {};
                      for (const b of activeRes.boxes) counts[b.name] = (counts[b.name] || 0) + 1;
                      return Object.entries(counts).map(([name, cnt]) => {
                        const prod = products.find(p => p.name === name);
                        return (
                          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: prod?.color || '#999', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{cnt} cj</span>
                          </div>
                        );
                      });
                    })()}

                    {/* Leftover check */}
                    {(() => {
                      if (!results.length) return null;
                      const totalPlaced = results.reduce((sum, r) => {
                        const c = {};
                        r.boxes.forEach(b => { c[b.name] = (c[b.name] || 0) + 1; });
                        return sum;
                      }, 0);
                      const leftover = products.filter(p => {
                        const placed = results.reduce((s, r) => s + r.boxes.filter(b => b.name === p.name).length, 0);
                        return placed < p.qty;
                      });
                      if (!leftover.length) return null;
                      return (
                        <div style={{ marginTop: 12, background: 'rgba(184,92,92,0.08)', border: '1.5px solid rgba(184,92,92,0.35)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', letterSpacing: 1, marginBottom: 6 }}>NO ENTRARON</div>
                          {leftover.map(p => {
                            const placed = results.reduce((s, r) => s + r.boxes.filter(b => b.name === p.name).length, 0);
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
                                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: p.color || '#999' }} />
                                <span style={{ flex: 1 }}>{p.name}</span>
                                <span style={{ color: 'var(--red)', fontWeight: 600 }}>{p.qty - placed} sin ubicar</span>
                              </div>
                            );
                          })}
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Aumentá la altura máxima o reducí las cantidades</div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── PRODUCT FORM MODAL ── */}
      {showProductForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm(); }}
        >
          <div
            style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                {editingId != null ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button onClick={cancelForm} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
            </div>

            <div className="form-grid-2">
              <div className="field full">
                <label>Nombre</label>
                <input
                  type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Caja chica"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Largo <span className="unit">cm</span></label>
                <input type="number" value={form.L} onChange={e => setForm(f => ({ ...f, L: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Ancho <span className="unit">cm</span></label>
                <input type="number" value={form.W} onChange={e => setForm(f => ({ ...f, W: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Alto <span className="unit">cm</span></label>
                <input type="number" value={form.H} onChange={e => setForm(f => ({ ...f, H: e.target.value }))} min="1" />
              </div>
              <div className="field">
                <label>Cantidad</label>
                <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} min="1" max="250" />
              </div>
              <div className="field full">
                <label>Peso <span className="unit">kg/u</span></label>
                <input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} min="0" step="0.1" />
              </div>
              <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox" id="pbMustBeBase"
                  checked={form.mustBeBase}
                  onChange={e => setForm(f => ({ ...f, mustBeBase: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="pbMustBeBase" style={{ cursor: 'pointer', fontSize: 13, margin: 0 }}>
                  ⬇ Debe ir en la base (capa inferior del pallet)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelForm}
                style={{ padding: '9px 18px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveProduct}>
                {editingId != null ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CATALOG PICKER MODAL ── */}
      {catalogModal && (() => {
        const items = catalog.filter(p => p.dims && p.type !== 'pallet');
        const anyChecked = Object.values(catalogSel).some(Boolean);
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
            onClick={e => { if (e.target === e.currentTarget) setCatalogModal(false); }}
          >
            <div
              style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Catálogo de productos</h3>
                <button onClick={() => setCatalogModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => {
                    const all = {};
                    items.forEach(p => { all[p.id] = catalogSel[p.id] || 1; });
                    setCatalogSel(all);
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                >
                  Seleccionar todo
                </button>
                <button
                  onClick={() => setCatalogSel({})}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                >
                  Deseleccionar
                </button>
                <button
                  onClick={loadFromCatalog}
                  disabled={!anyChecked}
                  style={{ marginLeft: 'auto', padding: '6px 16px', background: anyChecked ? 'var(--accent)' : 'var(--bg-3)', color: anyChecked ? '#fff' : 'var(--text-3)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: anyChecked ? 'pointer' : 'default', transition: 'all 0.15s' }}
                >
                  ✓ Cargar selección
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {items.map(p => {
                  const checked = !!catalogSel[p.id];
                  const qty = catalogSel[p.id] || 1;
                  return (
                    <div key={p.id} style={{ padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setCatalogSel(prev => e.target.checked ? { ...prev, [p.id]: qty } : (() => { const n = { ...prev }; delete n[p.id]; return n; })())}
                          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }}
                        />
                        {p.imgUrl ? (
                          <img src={p.imgUrl} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} alt={p.name} />
                        ) : (
                          <div style={{ width: 40, height: 40, background: 'var(--border)', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
                            {p.dims.L}×{p.dims.W}×{p.dims.H} cm{p.weight ? ` · ${p.weight} kg/u` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <button
                            onClick={() => setCatalogSel(prev => ({ ...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1) }))}
                            style={{ width: 28, height: 28, background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text)' }}
                          >−</button>
                          <input
                            type="number" value={qty} min="1" max="500"
                            onChange={e => setCatalogSel(prev => ({ ...prev, [p.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            style={{ width: 50, height: 28, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 13, background: 'var(--bg-2)', color: 'var(--text)' }}
                          />
                          <button
                            onClick={() => setCatalogSel(prev => ({ ...prev, [p.id]: Math.min(500, (prev[p.id] || 1) + 1) }))}
                            style={{ width: 28, height: 28, background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text)' }}
                          >+</button>
                        </div>
                        <button
                          onClick={() => {
                            const existingProd = products.find(x => x.name === p.name);
                            if (existingProd) {
                              addOrUpdateProduct({ ...existingProd, qty: existingProd.qty + qty });
                            } else {
                              addOrUpdateProduct({
                                name: p.name,
                                dims: { L: p.dims.L, W: p.dims.W, H: p.dims.H },
                                qty,
                                weight: p.weight || 0,
                                mustBeBase: false,
                              });
                            }
                            clearResults();
                            setCatalogModal(false);
                            showToast(`✓ ${p.name} (${qty} u) agregado`, 'success');
                          }}
                          style={{ flex: 1, padding: '6px 8px', background: 'transparent', color: 'var(--accent)', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Individual
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
