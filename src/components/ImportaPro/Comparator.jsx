import { useState, useMemo } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars, rd } from '../../lib/formatters.js';
import { calcCostos } from './Calculator.jsx';

const SLOT_COLORS = ['#4a7dc1', '#27ae60'];
const CANAL_COLORS_LIST = ['var(--accent)', '#27ae60', 'var(--amber)', '#7ba3d4', '#6b9b8b'];

function chanGanNeta(ch, costoARS) {
  if (!ch || !ch.precio) return null;
  const com = ch.precio * (ch.comision || 0) / 100;
  return ch.precio - com - (ch.cuotas || 0) - costoARS;
}

function CompBadge({ better }) {
  return better ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: '#27ae6015', color: '#27ae60', border: '1px solid #27ae6030', whiteSpace: 'nowrap' }}>
      ▲ mejor
    </span>
  ) : (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: '#c0392b10', color: '#c0392b', border: '1px solid #c0392b25', whiteSpace: 'nowrap' }}>
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
      <div style={{ background: 'var(--bg-3)', border: `2px solid ${color}`, borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Producto {slotIdx + 1}
        </div>
        <select
          value={product?.nombre || ''}
          onChange={e => onSelect(savedProducts.find(p => p.nombre === e.target.value) || null)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${color}50`,
            background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, cursor: 'pointer', outline: 'none' }}
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
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Costo por unidad
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', fontFamily: "'DM Mono',monospace", lineHeight: 1.1 }}>
              {ars(c.costoARS)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
              U$S {rd(c.costoUSD, 2)} · lote {product.qty} u · total {ars(c.costoARS * c.qty)}
            </div>

            {/* Composition bar */}
            <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 14, gap: 1 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ flex: Math.max(b.pct, 0.5), background: b.color, borderRadius: 2 }}
                  title={`${b.label}: ${rd(b.pct, 1)}%`} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 7 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: b.color, flexShrink: 0 }} />
                  {b.label} <strong style={{ color: 'var(--text-2)' }}>{rd(b.pct, 1)}%</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Desglose */}
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { label: 'FOB',                       val: `U$S ${rd(c.fob, 3)}`,                                  color: '#4a7dc1' },
              { label: 'Flete + seguro',             val: `U$S ${rd(c.fleteUnit + c.seguroUnit, 2)}`,             color: '#4a8ac4' },
              { label: 'Despacho + flete int.',      val: `U$S ${rd(c.despachanteUnit + c.fleteInternoUnit, 2)}`, color: '#6b9b8b' },
              { label: `Trader (${c.traderPct}%)`,   val: `U$S ${rd(c.traderUnit, 3)}`,                          color: '#7ba3d4' },
              { label: `D.I. (${c.di}%)`,            val: `U$S ${rd(c.diUnit, 2)}`,                              color: '#c0392b' },
              { label: `IVA imp. (${c.ivaImp}%)`,   val: `U$S ${rd(c.ivaUnit, 2)}`,                             color: '#e07070' },
              { label: `T.E. (${c.te}%)`,            val: `U$S ${rd(c.teUnit, 3)}`,                              color: '#e09070' },
            ].map(({ label, val, color: rc }, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px',
                borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${rc}` }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono',monospace", color: 'var(--text)' }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
              background: color, borderLeft: `3px solid ${color}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total por unidad</span>
              <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#fff' }}>U$S {rd(c.costoUSD, 2)}</span>
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: 'var(--bg-3)', border: '1px dashed var(--border)', borderRadius: 12,
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
              style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--accent)', color: '#fff',
                border: 'none', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Ir a la calculadora →
            </button>
          </div>
        ) : (
          <>
            {/* Winner banner */}
            {hasBoth && overallWinner !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                background: `${SLOT_COLORS[overallWinner]}10`,
                border: `1.5px solid ${SLOT_COLORS[overallWinner]}40`,
                borderRadius: 12, padding: '14px 20px', marginBottom: 20 }}>
                <span style={{ fontSize: 28 }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: SLOT_COLORS[overallWinner],
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                    Producto más económico
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                      {overallWinner === 0 ? prodA?.nombre : prodB?.nombre}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--text-3)' }}>
                      {ars(Math.abs(cA.costoARS - cB.costoARS))} menos por unidad
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Slots lado a lado */}
            <div className="comparator-slots-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
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
                <div className="comparator-channel-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sharedCanales.map((ch, i) => {
                    const ganA = chanGanNeta(ch, cA.costoARS);
                    const ganB = chanGanNeta(ch, cB.costoARS);
                    const maxAbs = Math.max(Math.abs(ganA || 0), Math.abs(ganB || 0), 1);
                    const color = CANAL_COLORS_LIST[i % CANAL_COLORS_LIST.length];
                    const aWins = ganA !== null && ganB !== null && ganA > ganB;
                    const bWins = ganA !== null && ganB !== null && ganB > ganA;
                    const tie   = ganA !== null && ganB !== null && ganA === ganB;

                    return (
                      <div key={i} style={{ background: 'var(--bg-3)', borderRadius: 10,
                        border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {/* Canal header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 16px', background: `${color}12`,
                          borderBottom: '1px solid var(--border)', borderLeft: `4px solid ${color}` }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ch.nombre}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10 }}>
                              Precio {ars(ch.precio)} · Comisión {ch.comision}%
                            </span>
                          </div>
                          {tie ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                              padding: '3px 10px', borderRadius: 6, background: 'var(--bg-2)',
                              border: '1px solid var(--border)' }}>Empate</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#27ae60',
                              padding: '3px 10px', borderRadius: 6,
                              background: '#27ae6012', border: '1px solid #27ae6030' }}>
                              🏆 {aWins ? (prodA?.nombre || 'Producto 1') : (prodB?.nombre || 'Producto 2')}
                            </span>
                          )}
                        </div>

                        {/* Bars */}
                        <div className="comparator-channel-grid" style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          {[
                            { prod: prodA, gan: ganA, color: SLOT_COLORS[0], wins: aWins, loses: bWins },
                            { prod: prodB, gan: ganB, color: SLOT_COLORS[1], wins: bWins, loses: aWins },
                          ].map(({ prod, gan, color: sc, wins, loses }, si) => {
                            const isNeg = gan !== null && gan < 0;
                            const pct   = Math.abs(gan || 0) / maxAbs * 100;
                            const margin = gan !== null && ch.precio > 0 ? (gan / ch.precio * 100) : null;
                            return (
                              <div key={si}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                  <span style={{ width: 9, height: 9, borderRadius: 2, background: sc, flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)',
                                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {prod?.nombre || `Producto ${si + 1}`}
                                  </span>
                                  {!tie && (wins ? <CompBadge better={true} /> : <CompBadge better={false} />)}
                                </div>
                                <div style={{ height: 8, background: 'var(--border)', borderRadius: 6,
                                  overflow: 'hidden', marginBottom: 6 }}>
                                  <div style={{ height: '100%', width: `${pct}%`,
                                    background: isNeg ? '#c0392b' : sc, borderRadius: 6,
                                    transition: 'width 0.4s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                  <span style={{ fontSize: 17, fontWeight: 700,
                                    color: isNeg ? '#c0392b' : 'var(--text)',
                                    fontFamily: "'DM Mono',monospace" }}>
                                    {gan !== null ? ars(gan) : '—'}
                                  </span>
                                  {margin !== null && (
                                    <span style={{ fontSize: 13, color: isNeg ? '#c0392b' : 'var(--text-3)', fontWeight: 600 }}>
                                      {rd(margin, 1)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                            fontFamily: "'DM Mono',monospace",
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
