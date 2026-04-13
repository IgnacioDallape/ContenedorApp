import { useState, useCallback } from 'react';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { PALLET_SIZES, ZONE_COLORS_HEX, ZONE_LABELS } from '../../lib/constants.js';

function shortenUrl(url) {
  try { return new URL(url).hostname; } catch { return url.slice(0, 28); }
}

const MODAL_DEFAULTS = {
  id: null, name: '', imgUrl: '', link: '', price: '', weight: '',
  type: 'box', boxL: '', boxW: '', boxH: '', palletType: 'euro', palletH: '180',
};

export default function Catalog() {
  const {
    catalog, selectedCatalogItems, selectedCatalogZones, priorityZones,
    setSelectedCatalogItems, setSelectedCatalogZones, clearCatalogSelection,
    addToCatalog, deleteCatalogItem, updateCatalogItem, addProduct,
  } = useContainerStore();
  const { setActiveSection, showToast } = useAppStore();

  const [modal, setModal] = useState(null); // null = closed, or MODAL_DEFAULTS-like object
  const [imgError, setImgError] = useState(false);

  // ── Selection helpers ──
  function toggleItem(id) {
    const n = { ...selectedCatalogItems };
    if (n[id] !== undefined) delete n[id];
    else n[id] = 1;
    setSelectedCatalogItems(n);
  }

  function setQty(id, val) {
    const qty = Math.max(1, parseInt(val) || 1);
    const n = { ...selectedCatalogItems };
    if (n[id] !== undefined) n[id] = qty;
    setSelectedCatalogItems(n);
  }

  function setZone(id, val) {
    setSelectedCatalogZones({ ...selectedCatalogZones, [id]: val });
  }

  // ── Add selected to container ──
  function addSelectedToContainer() {
    const ids = Object.keys(selectedCatalogItems);
    if (!ids.length) return;
    const activeZones = priorityZones.filter(z => z !== null);

    for (const sid of ids) {
      const p = catalog.find(c => String(c.id) === String(sid));
      if (!p) continue;
      const zoneVal = selectedCatalogZones[sid] || selectedCatalogZones[Number(sid)];
      let zone = null;
      if (zoneVal && zoneVal !== 'auto') {
        zone = priorityZones[parseInt(zoneVal)] || null;
      } else if (activeZones.length === 1) {
        zone = activeZones[0];
      }
      const qty = selectedCatalogItems[sid] || selectedCatalogItems[Number(sid)] || 1;
      addProduct({ ...p, qty, weight: p.weight || 0, priorityZone: zone });
    }

    clearCatalogSelection();
    setActiveSection('container');
  }

  // ── Modal helpers ──
  function openNew() {
    setModal({ ...MODAL_DEFAULTS });
    setImgError(false);
  }

  function openEdit(p) {
    setModal({
      id: p.id,
      name: p.name,
      imgUrl: p.imgUrl || '',
      link: p.link || '',
      price: String(p.price || ''),
      weight: String(p.weight || ''),
      type: p.type,
      boxL: p.type === 'box' ? String(p.dims.L) : '',
      boxW: p.type === 'box' ? String(p.dims.W) : '',
      boxH: p.type === 'box' ? String(p.dims.H) : '',
      palletType: 'euro',
      palletH: p.type === 'pallet' ? String(p.dims.H) : '180',
    });
    setImgError(false);
  }

  function closeModal() { setModal(null); }

  function saveModal() {
    if (!modal.name.trim()) return showToast('Ingresá el nombre', 'error');
    const price = parseFloat(modal.price) || 0;
    const weight = parseFloat(modal.weight) || 0;
    let dims;
    if (modal.type === 'box') {
      const L = parseFloat(modal.boxL), W = parseFloat(modal.boxW), H = parseFloat(modal.boxH);
      if (!L || !W || !H) return showToast('Ingresá las dimensiones', 'error');
      const fits = (
        (L <= 1200 && W <= 235 && H <= 269) || (L <= 1200 && H <= 235 && W <= 269) ||
        (W <= 1200 && L <= 235 && H <= 269) || (W <= 1200 && H <= 235 && L <= 269) ||
        (H <= 1200 && L <= 235 && W <= 269) || (H <= 1200 && W <= 235 && L <= 269)
      );
      if (!fits) return showToast('Las dimensiones no caben en ningún contenedor', 'error');
      dims = { L, W, H };
    } else {
      const sz = PALLET_SIZES[modal.palletType];
      dims = { L: sz.L, W: sz.W, H: parseFloat(modal.palletH) || 180 };
    }

    const prod = {
      id: modal.id || Date.now(),
      name: modal.name.trim(),
      type: modal.type,
      dims,
      price,
      weight,
      imgUrl: modal.imgUrl.trim() || null,
      link: modal.link.trim() || null,
    };

    if (modal.id) {
      updateCatalogItem(prod);
      showToast('Producto actualizado', 'success');
    } else {
      addToCatalog(prod);
      showToast('Producto guardado', 'success');
    }
    closeModal();
  }

  const selectedCount = Object.keys(selectedCatalogItems).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1>Catálogo de productos</h1>
            <p className="page-sub">Seleccioná productos para agregar rápidamente al contenedor</p>
          </div>
          <button
            className="btn-primary"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={openNew}
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px 0' }}>
        {!catalog.length ? (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗂️</div>
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Tu catálogo está vacío</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Guardá productos con imagen y link para agregarlos rápidamente al contenedor.
            </p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={openNew}>
              + Crear primer producto
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
            padding: '4px 2px',
          }}>
            {catalog.map(p => {
              const sel = selectedCatalogItems[p.id] !== undefined;
              const qty = selectedCatalogItems[p.id] || 1;
              const hasDims = p.dims && p.dims.L && p.dims.W && p.dims.H;
              const ipBadge = p.source === 'importapro';

              return (
                <div
                  key={p.id}
                  className={`cat-card${sel ? ' selected' : ''}`}
                  onClick={() => hasDims && toggleItem(p.id)}
                  style={{ cursor: hasDims ? 'pointer' : 'default' }}
                >
                  <div className="cat-card-check">✓</div>

                  {p.imgUrl ? (
                    <img
                      className="cat-img"
                      src={p.imgUrl}
                      alt={p.name}
                      onError={e => { e.target.outerHTML = '<div class="cat-img-placeholder">📦</div>'; }}
                    />
                  ) : (
                    <div className="cat-img-placeholder">📦</div>
                  )}

                  <div className="cat-body">
                    <div className="cat-name">
                      {p.name}
                      {ipBadge && (
                        <span style={{ fontSize: 9, background: '#1a4f8a', color: '#fff', padding: '1px 6px', borderRadius: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px', verticalAlign: 'middle', marginLeft: 4 }}>
                          IP
                        </span>
                      )}
                    </div>
                    {hasDims ? (
                      <div className="cat-meta">
                        {p.type === 'box' ? '📦' : '🟫'} {p.dims.L}×{p.dims.W}×{p.dims.H} cm
                        {p.weight > 0 ? ` · ⚖ ${p.weight} kg` : ''}
                      </div>
                    ) : (
                      <div className="cat-meta" style={{ color: 'var(--text-3)' }}>Sin dimensiones</div>
                    )}
                    {p.link && (
                      <a
                        className="cat-link"
                        href={p.link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                      >
                        🔗 {shortenUrl(p.link)}
                      </a>
                    )}
                    <div className="cat-price">${(p.price || 0).toFixed(2)} / {p.type === 'box' ? 'caja' : 'pallet'}</div>
                  </div>

                  <div className="cat-footer" onClick={e => e.stopPropagation()}>
                    {hasDims ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <label style={{ fontSize: 10, margin: 0, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>Cant.</label>
                          <input
                            type="number" min="1" value={qty}
                            style={{ width: 52, padding: '5px 7px', fontSize: 13 }}
                            onChange={e => setQty(p.id, e.target.value)}
                          />
                          <div className="cat-actions">
                            <button
                              className={`btn-icon${sel ? ' sel-active' : ''}`}
                              onClick={() => toggleItem(p.id)}
                            >
                              {sel ? '✓' : '+ Sel.'}
                            </button>
                            <button className="btn-icon" onClick={() => openEdit(p)} title="Editar">✏️</button>
                            <button
                              className="btn-icon danger"
                              onClick={() => { deleteCatalogItem(p.id); showToast('Producto eliminado', ''); }}
                              title="Eliminar"
                            >🗑</button>
                          </div>
                        </div>

                        {/* Zone selector */}
                        <div className="cat-footer-row2">
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-3)', letterSpacing: 1, whiteSpace: 'nowrap' }}>ZONA:</span>
                          <div className="zone-select-wrap">
                            {['auto', '0', '1', '2'].map((v, i) => {
                              const cur = selectedCatalogZones[p.id] === undefined ? 'auto' : selectedCatalogZones[p.id];
                              const isActive = cur === v;
                              const colors = ['var(--text-3)', ...ZONE_COLORS_HEX];
                              const labels = ['Auto', ...ZONE_LABELS];
                              const col = colors[i];
                              return (
                                <button
                                  key={v}
                                  onClick={() => setZone(p.id, v)}
                                  style={{
                                    padding: '2px 8px', fontSize: 9,
                                    fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px',
                                    borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                                    border: `1px solid ${col}`, color: isActive ? '#fff' : col,
                                    background: isActive ? col : 'transparent',
                                    fontWeight: isActive ? 700 : 400,
                                  }}
                                >
                                  {labels[i]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '6px 0', background: 'var(--bg-3)', borderRadius: 'var(--radius)', marginBottom: 6 }}>
                          Sin dimensiones — no se puede cargar
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-icon" style={{ flex: 1 }} onClick={() => openEdit(p)}>✏️ Editar</button>
                          <button
                            className="btn-icon danger"
                            style={{ flex: 1 }}
                            onClick={() => { deleteCatalogItem(p.id); showToast('Producto eliminado', ''); }}
                          >🗑 Eliminar</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add to container bar */}
      <div
        id="atcBar"
        className={`atc-bar${selectedCount > 0 ? ' visible' : ''}`}
        style={{
          position: 'fixed', bottom: 0, left: 'var(--sidebar-w, 220px)', right: 0,
          background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '12px 24px', zIndex: 100,
          transform: selectedCount > 0 ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {selectedCount} producto{selectedCount !== 1 ? 's' : ''} seleccionado{selectedCount !== 1 ? 's' : ''}
        </span>
        <button
          onClick={clearCatalogSelection}
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '7px 14px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13 }}
        >
          Limpiar
        </button>
        <button
          onClick={addSelectedToContainer}
          style={{ background: '#fff', color: 'var(--accent)', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          Agregar al contenedor →
        </button>
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
        >
          <div
            className="modal-content"
            style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {modal.id ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button onClick={closeModal} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
            </div>

            {/* Type tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['box', 'pallet'].map(t => (
                <button
                  key={t}
                  onClick={() => setModal(m => ({ ...m, type: t }))}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 'var(--radius)', cursor: 'pointer',
                    border: modal.type === t ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: modal.type === t ? 'var(--accent-dim, rgba(0,0,0,0.06))' : 'var(--bg-3)',
                    color: modal.type === t ? 'var(--accent)' : 'var(--text-2)',
                    fontWeight: modal.type === t ? 700 : 400, fontSize: 13,
                  }}
                >
                  {t === 'box' ? '📦 Caja' : '🟫 Pallet'}
                </button>
              ))}
            </div>

            <div className="form-grid-2">
              <div className="field full">
                <label>Nombre del producto</label>
                <input type="text" value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} placeholder="Ej: Alfombra shaggy 160×230" autoFocus />
              </div>

              {modal.type === 'box' ? (
                <>
                  <div className="field">
                    <label>Largo <span className="unit">cm</span></label>
                    <input type="number" value={modal.boxL} onChange={e => setModal(m => ({ ...m, boxL: e.target.value }))} min="1" />
                  </div>
                  <div className="field">
                    <label>Ancho <span className="unit">cm</span></label>
                    <input type="number" value={modal.boxW} onChange={e => setModal(m => ({ ...m, boxW: e.target.value }))} min="1" />
                  </div>
                  <div className="field full">
                    <label>Alto <span className="unit">cm</span></label>
                    <input type="number" value={modal.boxH} onChange={e => setModal(m => ({ ...m, boxH: e.target.value }))} min="1" />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Tipo de pallet</label>
                    <select value={modal.palletType} onChange={e => setModal(m => ({ ...m, palletType: e.target.value }))}>
                      <option value="euro">Euro (120×80 cm)</option>
                      <option value="eua">EUA (120×100 cm)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Altura total <span className="unit">cm</span></label>
                    <input type="number" value={modal.palletH} onChange={e => setModal(m => ({ ...m, palletH: e.target.value }))} min="1" />
                  </div>
                </>
              )}

              <div className="field">
                <label>Precio <span className="unit">USD</span></label>
                <input type="number" value={modal.price} onChange={e => setModal(m => ({ ...m, price: e.target.value }))} min="0" step="0.01" />
              </div>
              <div className="field">
                <label>Peso <span className="unit">kg/u</span></label>
                <input type="number" value={modal.weight} onChange={e => setModal(m => ({ ...m, weight: e.target.value }))} min="0" step="0.1" />
              </div>
              <div className="field full">
                <label>URL de imagen <span className="unit">opcional</span></label>
                <input type="url" value={modal.imgUrl} onChange={e => { setImgError(false); setModal(m => ({ ...m, imgUrl: e.target.value })); }} placeholder="https://..." />
              </div>
              <div className="field full">
                <label>Link del producto <span className="unit">opcional</span></label>
                <input type="url" value={modal.link} onChange={e => setModal(m => ({ ...m, link: e.target.value }))} placeholder="https://..." />
              </div>
            </div>

            {/* Image preview */}
            {modal.imgUrl && !imgError && (
              <div style={{ marginTop: 8, marginBottom: 12, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-3)', borderRadius: 8 }}>
                <img
                  src={modal.imgUrl}
                  alt="preview"
                  style={{ maxHeight: 76, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                  onError={() => setImgError(true)}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={closeModal}
                style={{ padding: '9px 18px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveModal}>
                {modal.id ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
