import { useState, useMemo } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars, rd } from '../../lib/formatters.js';
import { calcCostos } from './Calculator.jsx';
import '../../../css/redesign/Comparator.css';

const SLOT_COLORS = ['#2f6fb0', '#2f9e6a'];
const CANAL_COLORS_LIST = ['var(--accent)', '#2f9e6a', 'var(--amber)', '#5b9bd5', '#2f6fb0'];

function chanGanNeta(ch, costoARS) {
  if (!ch || !ch.precio) return null;
  const com = ch.precio * (ch.comision || 0) / 100;
  return ch.precio - com - (ch.cuotas || 0) - costoARS;
}

function CompBadge({ better }) {
  return better ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(6,118,71,0.25)', whiteSpace: 'nowrap',
      textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      ▲ mejor
    </span>
  ) : (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(180,35,24,0.25)', whiteSpace: 'nowrap',
      textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      ▼ peor
    </span>
  );
}

function ProductCard({ slotIdx, product, onSelect, savedProducts, c }) {
  const color = SLOT_COLORS[slotIdx];
  const bars = c ? [
    { label: 'FOB',       pct: c.fob / (c.costoUSD || 1) * 100,                                    color: '#1a4f8a' },
    { label: 'Flete',     pct: (c.fleteUnit + c.seguroUnit) / (c.costoUSD || 1) * 100,              color: '#4a8ac4' },
    { label: 'Despacho',  pct: (c.despachanteUnit + c.fleteInternoUnit) / (c.costoUSD || 1) * 100,  color: '#6b9b8b' },
    { label: 'Trader',    pct: c.traderUnit / (c.costoUSD || 1) * 100,                              color: '#7ba3d4' },
    { label: 'Impuestos', pct: (c.diUnit + c.ivaUnit + c.teUnit) / (c.costoUSD || 1) * 100,        color: '#c0392b' },
  ] : [];

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Selector */}
      <div className="comparator-product-selector" style={{ background: 'var(--surface)', border: `1.5px solid ${color}`, borderRadius: 6, padding: '12px 14px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Producto {slotIdx + 1}
        </div>
        <select
          value={product?.nombre || ''}
          onChange={e => onSelect(savedProducts.find(p => p.nombre === e.target.value) || null)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--border-2)',
            background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
        >
          <option value="">— Elegí un producto —</option>
          {savedProducts.map(p => (
            <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {c && product ? (
        <>
          {/* Costo principal */}
          <div className="comparator-cost-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.2rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Costo por unidad
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", lineHeight: 1.1 }}>
              {ars(c.costoARS)}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginTop: 6 }}>
              U$S {rd(c.costoUSD, 2)} · lote {product.qty} u · total {ars(c.costoARS * c.qty)}
            </div>

            {/* Composition bar */}
            <div className="comparator-distribution-bar" style={{ display: 'flex', height: 7, borderRadius: 3, overflow: 'hidden', marginTop: 12, gap: 1 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ flex: Math.max(b.pct, 0.5), background: b.color }}
                  title={`${b.label}: ${rd(b.pct, 1)}%`} />
              ))}
            </div>
            <div className="comparator-distribution-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 9, fontSize: '0.72rem' }}>
              {bars.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-2)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                  {b.label} <strong style={{ color: 'var(--text-2)' }}>{rd(b.pct, 1)}%</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Desglose */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: 'FOB',                       val: `U$S ${rd(c.fob, 3)}`,                                  color: '#2f6fb0' },
              { label: 'Flete + seguro',             val: `U$S ${rd(c.fleteUnit + c.seguroUnit, 2)}`,             color: '#5b9bd5' },
              { label: 'Despacho + flete int.',      val: `U$S ${rd(c.despachanteUnit + c.fleteInternoUnit, 2)}`, color: '#2f9e6a' },
              { label: `Trader (${c.traderPct}%)`,   val: `U$S ${rd(c.traderUnit, 3)}`,                          color: '#d9a64a' },
              { label: `D.I. (${c.di}%)`,            val: `U$S ${rd(c.diUnit, 2)}`,                              color: '#c2603f' },
              { label: `IVA imp. (${c.ivaImp}%)`,   val: `U$S ${rd(c.ivaUnit, 2)}`,                             color: '#cf7a5c' },
              { label: `T.E. (${c.te}%)`,            val: `U$S ${rd(c.teUnit, 3)}`,                              color: '#dca07f' },
            ].map(({ label, val, color: rc }, i) => (
              <div key={i} className="comparator-breakdown-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px',
                borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${rc}`, fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontWeight: 600, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: 'var(--text)' }}>{val}</span>
              </div>
            ))}
            <div className="comparator-breakdown-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px',
              background: color }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total por unidad</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#fff' }}>U$S {rd(c.costoUSD, 2)}</span>
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-2)', borderRadius: 6,
          padding: '50px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          Seleccioná un producto
        </div>
      )}
    </div>
  );
}

export default function Comparator() {
  const { savedProducts, inputs, canales } = useImportaproStore();
  const { setActiveSection } = useAppStore();
  const [prodA, setProdA] = useState(null);
  const [prodB, setProdB] = useState(null);

  const globalTC = parseFloat(inputs.globalTC) || 1359;

  const cA = useMemo(() => prodA ? calcCostos({ ...prodA, globalTC }) : null, [prodA, globalTC]);
  const cB = useMemo(() => prodB ? calcCostos({ ...prodB, globalTC }) : null, [prodB, globalTC]);

  const sharedCanales = prodA?.canales || prodB?.canales || canales;
  const hasBoth = cA && cB;
  const summaryRows = hasBoth ? [
    { label: 'Costo unitario (ARS)', valA: cA.costoARS,  valB: cB.costoARS,  fmt: ars, higherIsBetter: false },
    { label: 'Costo unitario (USD)', valA: cA.costoUSD,  valB: cB.costoUSD,  fmt: v => `U$S ${rd(v,2)}`, higherIsBetter: false },
    { label: 'FOB unitario',          valA: cA.fob,       valB: cB.fob,       fmt: v => `U$S ${rd(v,3)}`, higherIsBetter: false },
    { label: 'Impuestos (D.I.+IVA+T.E.)', valA: cA.diUnit+cA.ivaUnit+cA.teUnit, valB: cB.diUnit+cB.ivaUnit+cB.teUnit, fmt: v => `U$S ${rd(v,2)}`, higherIsBetter: false },
    { label: 'Costo total del lote',  valA: cA.costoARS*cA.qty, valB: cB.costoARS*cB.qty, fmt: ars, higherIsBetter: false },
  ] : [];

  // Overall winner: lower cost
  const overallWinner = hasBoth
    ? (cA.costoUSD < cB.costoUSD ? 0 : cA.costoUSD > cB.costoUSD ? 1 : null)
    : null;

  return (
    <div className="ip-section active" id="section-comparator">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Comparar productos</h1>
          <p className="page-sub">Analizá dos productos lado a lado para decidir cuál importar</p>
        </div>

        {savedProducts.length < 2 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
              Necesitás al menos 2 productos guardados
            </div>
            <div style={{ fontSize: 14, marginBottom: 22 }}>
              Calculá y guardá productos desde la calculadora para poder compararlos
            </div>
            <button onClick={() => setActiveSection('calc')}
              style={{ padding: '10px 24px', borderRadius: 4, background: 'var(--accent)', color: '#fff',
                border: 'none', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Ir a la calculadora →
            </button>
          </div>
        ) : (
          <>
            {/* Winner banner */}
            {hasBoth && overallWinner !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                background: 'var(--accent-soft, rgba(14,90,107,0.08))',
                border: '1px solid var(--border)',
                borderRadius: 6, padding: '14px 18px', marginBottom: 18 }}>
                <span style={{ width: 38, height: 38, borderRadius: 6, background: 'var(--surface)',
                  display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                    Producto más económico
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                      {overallWinner === 0 ? prodA?.nombre : prodB?.nombre}
                    </span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>
                      {ars(Math.abs(cA.costoARS - cB.costoARS))} menos por unidad
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Slots lado a lado */}
            <div className="comparator-slots-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
              <ProductCard slotIdx={0} product={prodA} onSelect={setProdA} savedProducts={savedProducts} c={cA} />
              <ProductCard slotIdx={1} product={prodB} onSelect={setProdB} savedProducts={savedProducts} c={cB} />
            </div>

            {/* Comparación de canales */}
            {hasBoth && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <span className="card-title">Ganancia por canal de venta</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>por unidad vendida</span>
                </div>
                <div className="comparator-channel-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {sharedCanales.map((ch, i) => {
                    const ganA = chanGanNeta(ch, cA.costoARS);
                    const ganB = chanGanNeta(ch, cB.costoARS);
                    const maxAbs = Math.max(Math.abs(ganA || 0), Math.abs(ganB || 0), 1);
                    const aWins = ganA !== null && ganB !== null && ganA > ganB;
                    const bWins = ganA !== null && ganB !== null && ganB > ganA;
                    const tie   = ganA !== null && ganB !== null && ganA === ganB;
                    const bothNeg = (ganA === null || ganA < 0) && (ganB === null || ganB < 0);
                    const edgeColor = bothNeg ? 'var(--red)' : SLOT_COLORS[aWins ? 0 : 1];

                    return (
                      <div key={i} className="comparator-channel-item" style={{ borderLeft: `3px solid ${edgeColor}`, paddingLeft: 14 }}>
                        {/* Canal header */}
                        <div className="comparator-channel-header" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{ch.nombre}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
                            Precio {ars(ch.precio)} · Comisión {ch.comision}%
                          </span>
                          {tie && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                              padding: '2px 8px', borderRadius: 4, background: 'var(--surface2)',
                              border: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empate</span>
                          )}
                        </div>

                        {/* Per-product rows */}
                        {[
                          { prod: prodA, gan: ganA, color: SLOT_COLORS[0], wins: aWins },
                          { prod: prodB, gan: ganB, color: SLOT_COLORS[1], wins: bWins },
                        ].map(({ prod, gan, color: sc, wins }, si) => {
                          const isNeg = gan !== null && gan < 0;
                          const pct   = Math.abs(gan || 0) / maxAbs * 100;
                          const margin = gan !== null && ch.precio > 0 ? (gan / ch.precio * 100) : null;
                          return (
                            <div key={si} className="comparator-channel-product" style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.85rem', color: 'var(--text-2)',
                                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 9, height: 9, borderRadius: 2, background: sc, flexShrink: 0 }} />
                                  {prod?.nombre || `Producto ${si + 1}`}
                                </span>
                                {!tie && (wins ? <CompBadge better={true} /> : <CompBadge better={false} />)}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="comparator-channel-bar" style={{ flex: 1, height: 8,
                                  background: 'var(--bg-4)', borderRadius: 999, overflow: 'hidden' }}>
                                  <div className="comparator-channel-bar-fill" style={{ height: '100%', width: `${pct}%`,
                                    background: isNeg ? 'var(--red)' : sc, borderRadius: 999,
                                    transition: 'width 0.4s ease' }} />
                                </div>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: 90, textAlign: 'right',
                                  color: isNeg ? 'var(--red)' : 'var(--text)',
                                  fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                                  {gan !== null ? ars(gan) : '—'}
                                </span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: 50, textAlign: 'right',
                                  color: isNeg ? 'var(--red)' : 'var(--text-3)' }}>
                                  {margin !== null ? `${rd(margin, 1)}%` : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Resumen comparativo */}
            {hasBoth && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                  <span className="card-title">Resumen comparativo</span>
                </div>

                <div className="comparator-summary-mobile">
                  {summaryRows.map(({ label, valA, valB, fmt, higherIsBetter }, rowIdx) => {
                    const aWins = higherIsBetter ? valA > valB : valA < valB;
                    const bWins = higherIsBetter ? valB > valA : valB < valA;
                    const tie = valA === valB;
                    return (
                      <div key={rowIdx} className="comparator-mobile-card">
                        <div className="comparator-mobile-label">{label}</div>
                        <div className="comparator-mobile-columns">
                          {[
                            { prod: prodA, val: valA, wins: aWins, loses: bWins, color: SLOT_COLORS[0] },
                            { prod: prodB, val: valB, wins: bWins, loses: aWins, color: SLOT_COLORS[1] },
                          ].map(({ prod, val, wins, loses, color }, si) => (
                            <div key={si} className={`comparator-mobile-cell${wins && !tie ? ' is-winner' : ''}`} style={{ '--cmp-accent': color }}>
                              <div className="comparator-mobile-head">
                                <span className="comparator-mobile-dot" style={{ background: color }} />
                                <span className="comparator-mobile-name">{prod?.nombre || `Producto ${si + 1}`}</span>
                              </div>
                              <div className="comparator-mobile-value">{fmt(val)}</div>
                              {!tie && (wins ? <CompBadge better={true} /> : <CompBadge better={false} />)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Column headers */}
                <div className="comparator-summary-wrapper">
                <div className="comparator-summary-grid" style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', borderBottom: '2px solid var(--border)', paddingBottom: 8, marginBottom: 4 }}>
                  <div />
                  {[{ prod: prodA, color: SLOT_COLORS[0] }, { prod: prodB, color: SLOT_COLORS[1] }].map(({ prod, color }, si) => (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {prod?.nombre || `Producto ${si + 1}`}
                      </span>
                    </div>
                  ))}
                </div>

                {summaryRows.map(({ label, valA, valB, fmt, higherIsBetter }, rowIdx) => {
                  const aWins = higherIsBetter ? valA > valB : valA < valB;
                  const bWins = higherIsBetter ? valB > valA : valB < valA;
                  const tie   = valA === valB;
                  return (
                    <div key={rowIdx} className="comparator-summary-grid" style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr',
                      borderTop: '1px solid var(--border)' }}>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
                      </div>
                      {[
                        { val: valA, wins: aWins, loses: bWins, color: SLOT_COLORS[0] },
                        { val: valB, wins: bWins, loses: aWins, color: SLOT_COLORS[1] },
                      ].map(({ val, wins, loses, color }, si) => (
                        <div key={si} style={{ padding: '12px 14px',
                          background: wins && !tie ? `${color}10` : 'transparent',
                          borderLeft: `2px solid ${wins && !tie ? color : 'transparent'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: wins && !tie ? 800 : 600,
                            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                            color: wins && !tie ? 'var(--text)' : 'var(--text-2)' }}>
                            {fmt(val)}
                          </span>
                          {!tie && (wins ? <CompBadge better={true} /> : <CompBadge better={false} />)}
                        </div>
                      ))}
                    </div>
                  );
                })}
                </div>{/* comparator-summary-wrapper */}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
