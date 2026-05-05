import { useState } from 'react';
import usePalletStore, { pb_validatePlacement } from '../../stores/palletStore.js';
import useContainerStore from '../../stores/containerStore.js';
import useAppStore from '../../stores/appStore.js';
import { PB_PALLET_TYPES, PB_COLORS } from '../../lib/constants.js';
import PalletThreeCanvas from './PalletThreeCanvas.jsx';

const PRODUCT_DEFAULTS = {
  name: '', L: '', W: '', H: '', qty: '', weight: '', mustBeBase: false, noRotate: false, imgUrl: null,
};

export default function PalletBuilder() {
  const {
    palletType, maxHeight, products, results, activeResult,
    setPalletType, setMaxHeight, addOrUpdateProduct, removeProduct,
    setEditingId, editingId, build, setActiveResult, clearResults,
    selectedBoxUid, setSelectedBoxUid, updateActiveResultBoxes, removeBoxFromActiveResult,
  } = usePalletStore();
  const { setPendingProduct, catalog, setActiveSection: containerNav } = useContainerStore();
  const { setActiveSection, showToast } = useAppStore();

  const [form, setForm] = useState({ ...PRODUCT_DEFAULTS });
  const [showProductForm, setShowProductForm] = useState(false);
  const [catalogModal, setCatalogModal] = useState(false);
  const [catalogSel, setCatalogSel] = useState({}); // { id: qty }
  const [isBuilding, setIsBuilding] = useState(false);

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
      noRotate: p.noRotate || false,
      imgUrl: p.imgUrl || null,
    });
    setShowProductForm(true);
  }

  function loadPhotoFilePB(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setForm(f => ({ ...f, imgUrl: e.target.result }));
    reader.readAsDataURL(file);
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

    addOrUpdateProduct({
      name,
      dims: { L, W, H },
      qty,
      weight,
      mustBeBase: form.mustBeBase,
      noRotate: form.noRotate,
      imgUrl: form.imgUrl || null,
    });
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
    setIsBuilding(true);
    window.setTimeout(() => {
      try {
        build();
        if (usePalletStore.getState().results.length) {
          showToast(`✓ ${usePalletStore.getState().results.length} pallet(s) armado(s)`, 'success');
        }
      } finally {
        setIsBuilding(false);
      }
    }, 0);
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
        noRotate: !!p.noRotate,
      });
      added++;
    }
    clearResults();
    setCatalogModal(false);
    showToast(`✓ ${added} producto(s) agregado(s) al pallet`, 'success');
  }

  // ── Active result ──
  const activeRes = results[activeResult] || null;
  const selectedBox = activeRes?.boxes?.find(box => box.uid === selectedBoxUid) || null;

  function rotateSelectedBox() {
    if (!activeRes || !selectedBox) return;
    if (selectedBox.noRotate) return showToast('Esta caja solo puede ir en su posición por defecto', 'error');

    const nextDims = { dX: selectedBox.dZ, dY: selectedBox.dY, dZ: selectedBox.dX };
    const placement = pb_validatePlacement(
      activeRes.boxes,
      selectedBox,
      activeRes.palL,
      activeRes.palW,
      activeRes.maxHeight,
      selectedBox.x,
      selectedBox.z,
      nextDims
    );

    if (!placement.valid) {
      return showToast('No entra rotada en esa posición', 'error');
    }

    updateActiveResultBoxes(activeRes.boxes.map(box =>
      box.uid === selectedBox.uid
        ? { ...box, ...placement }
        : box
    ));
    showToast('Orientación actualizada', 'success');
  }

  function restoreSelectedBoxOrientation() {
    if (!activeRes || !selectedBox?.sourceDims) return;
    const nextDims = {
      dX: selectedBox.sourceDims.L,
      dY: selectedBox.sourceDims.H,
      dZ: selectedBox.sourceDims.W,
    };
    const placement = pb_validatePlacement(
      activeRes.boxes,
      selectedBox,
      activeRes.palL,
      activeRes.palW,
      activeRes.maxHeight,
      selectedBox.x,
      selectedBox.z,
      nextDims
    );

    if (!placement.valid) {
      return showToast('No se puede restaurar esa orientación en esta posición', 'error');
    }

    updateActiveResultBoxes(activeRes.boxes.map(box =>
      box.uid === selectedBox.uid
        ? { ...box, ...placement }
        : box
    ));
    showToast('Orientación restaurada', 'success');
  }

  return (
    <div className="pallet-builder-root" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="pallet-builder-sidebar" style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                {p.imgUrl
                  ? <img src={p.imgUrl} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div className="queue-dot" style={{ background: p.color }} />
                }
                <div className="queue-info">
                  <div className="queue-name">
                    {p.name}
                    {p.mustBeBase && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>
                        ⬇ BASE
                      </span>
                    )}
                    {p.noRotate && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-3)', color: 'var(--text)', fontFamily: "'DM Mono', monospace", marginLeft: 4, border: '1px solid var(--border)' }}>
                        POS. FIJA
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
            disabled={!products.length || isBuilding}
          >
            {isBuilding ? 'Armando...' : 'Armar pallets'}
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="pallet-builder-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Results panel */}
        <div className="pallet-builder-results" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!results.length ? (
            <div className="pallet-builder-empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🟫</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Configurá los productos y presioná "Armar pallets"</p>
              <p style={{ fontSize: 13 }}>El motor BFD calculará la distribución óptima de cajas.</p>
            </div>
          ) : (
            <>
              {/* Pallet tabs + export buttons */}
              <div className="pallet-builder-tabs" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
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
              <div className="pallet-builder-view" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* 3D view */}
                <div className="pallet-builder-canvas-panel" style={{ flex: 1, padding: 12, minWidth: 0, position: 'relative' }}>
                  <PalletThreeCanvas
                    result={activeRes}
                    selectedBoxUid={selectedBoxUid}
                    onSelectBox={setSelectedBoxUid}
                    onUpdateBoxes={updateActiveResultBoxes}
                  />
                  {selectedBox && (
                    <div className="pallet-builder-inspector" style={{ position: 'absolute', right: 22, top: 22, zIndex: 30, width: 'min(272px, calc(100% - 44px))', maxHeight: 'calc(100% - 44px)', background: 'linear-gradient(180deg, rgba(251,247,241,0.98), rgba(243,236,227,0.98))', border: '1px solid rgba(141,121,102,0.22)', borderRadius: 18, boxShadow: '0 20px 44px rgba(97,78,60,0.18)', fontFamily: "'DM Mono', monospace", backdropFilter: 'blur(14px)', overflowX: 'hidden', overflowY: 'auto' }}>
                      <div style={{ padding: '14px 14px 12px', background: 'linear-gradient(135deg, var(--c1), #a48f7d)', color: 'var(--c5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(248,241,233,0.16)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedBox.name}</div>
                            <div style={{ fontSize: 9, color: 'rgba(248,241,233,0.78)', letterSpacing: 0.8 }}>UNIDAD {selectedBox.uid.split('::').pop()}</div>
                          </div>
                        </div>
                        <button onClick={() => setSelectedBoxUid(null)} style={{ width: 28, height: 28, borderRadius: 9, border: '1px solid rgba(248,241,233,0.18)', background: 'rgba(248,241,233,0.12)', color: 'var(--c5)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>×</button>
                      </div>

                      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>MEDIDAS</div>
                            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{selectedBox.dX}×{selectedBox.dZ}×{selectedBox.dY} cm</div>
                          </div>
                          <div style={{ padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,121,102,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>POSICIÓN</div>
                            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>X {selectedBox.x} · Z {selectedBox.z} · Y {selectedBox.y}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(141,121,102,0.12)' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1.4, marginBottom: 9 }}>ORIENTACIÓN Y POSICIÓN</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          <button
                            onClick={rotateSelectedBox}
                            disabled={selectedBox.noRotate}
                            style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'rgba(255,255,255,0.56)', color: 'var(--text)', cursor: selectedBox.noRotate ? 'not-allowed' : 'pointer', opacity: selectedBox.noRotate ? 0.38 : 1 }}
                          >
                            Giro horizontal
                          </button>
                          <button
                            onClick={restoreSelectedBoxOrientation}
                            style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(141,121,102,0.14)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
                          >
                            Restaurar
                          </button>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(141,121,102,0.08)', color: 'var(--muted)', fontSize: 10, lineHeight: 1.45 }}>
                          Podés arrastrar la caja dentro del pallet. Si sostiene otras cajas, se mueve la pila completa y queda limitada por largo, ancho, altura máxima y apoyo real.
                        </div>
                      </div>

                      <div style={{ padding: '12px 14px 14px', display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                        <button onClick={() => removeBoxFromActiveResult(selectedBox.uid)} style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid rgba(184,92,92,0.26)', background: 'rgba(184,92,92,0.06)', color: 'var(--danger)', cursor: 'pointer' }}>Eliminar unidad</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary panel */}
                {activeRes && (
                  <div className="pallet-builder-summary" style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 14 }}>
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
          className="pb-product-modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm(); }}
        >
          <div
            className="pb-product-modal"
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
              <div className="field full" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox" id="pbNoRotate"
                  checked={form.noRotate}
                  onChange={e => setForm(f => ({ ...f, noRotate: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="pbNoRotate" style={{ cursor: 'pointer', fontSize: 13, margin: 0 }}>
                  Solo puede ir en posición por defecto
                  <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>
                    Si no lo marcás, el motor puede rotarla para acomodarla mejor.
                  </span>
                </label>
              </div>
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
              <div className="field full">
                <label>Foto de referencia <span className="unit">opcional</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {form.imgUrl ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={form.imgUrl} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <button onClick={() => setForm(f => ({ ...f, imgUrl: null }))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => document.getElementById('pb-photo-input').click()}
                    style={{ padding: '7px 14px', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}
                  >
                    {form.imgUrl ? 'Cambiar foto' : '+ Subir foto'}
                  </button>
                  <input type="file" id="pb-photo-input" accept="image/*" style={{ display: 'none' }}
                    onChange={e => loadPhotoFilePB(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className="pb-product-form-actions" style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
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
                                noRotate: !!p.noRotate,
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
