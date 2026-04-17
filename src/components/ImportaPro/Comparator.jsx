import { useState, useMemo } from 'react';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import { ars, rd } from '../../lib/formatters.js';
import { calcCostos } from './Calculator.jsx';

const SLOT_COLORS = ['#4a7dc1', '#6b9b8b'];
const CANAL_COLORS = ['var(--accent)', 'var(--green)', 'var(--amber)', '#7ba3d4', '#6b9b8b'];

const COST_BARS = (c) => [
  { label: 'FOB',           pct: c.fob / (c.costoUSD || 1) * 100,                         color: '#1a4f8a' },
  { label: 'Flete int.',    pct: (c.fleteUnit + c.seguroUnit) / (c.costoUSD || 1) * 100,  color: '#4a8ac4' },
  { label: 'Despacho',      pct: c.despachanteUnit / (c.costoUSD || 1) * 100,             color: '#6b9b8b' },
  { label: 'Flete interno', pct: c.fleteInternoUnit / (c.costoUSD || 1) * 100,            color: '#5b8b7b' },
  { label: 'Trader',        pct: c.traderUnit / (c.costoUSD || 1) * 100,                  color: '#7ba3d4' },
  { label: 'Impuestos',     pct: (c.diUnit + c.ivaUnit + c.teUnit) / (c.costoUSD || 1) * 100, color: '#c0392b' },
];

function chanGanNeta(ch, costoARS) {
  if (!ch || !ch.precio) return null;
  const com = ch.precio * (ch.comision || 0) / 100;
  return ch.precio - com - (ch.cuotas || 0) - costoARS;
}

function DiffBadge({ valA, valB, higherIsBetter = true }) {
  if (valA == null || valB == null || valA === valB) return null;
  const aBetter = higherIsBetter ? valA > valB : valA < valB;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
      background: aBetter ? '#27ae6020' : '#c0392b20',
      color: aBetter ? '#27ae60' : '#c0392b',
      marginLeft: 5,
    }}>
      {aBetter ? '▲' : '▼'} mejor
    </span>
  );
}

function ProductSlot({ slotIdx, product, onSelect, savedProducts, globalTC }) {
  const c = useMemo(() => product ? calcCostos({ ...product, globalTC }) : null, [product, globalTC]);
  const color = SLOT_COLORS[slotIdx];
  const bars = c ? COST_BARS(c) : [];

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Selector */}
      <div style={{ background: 'var(--bg-3)', border: `2px solid ${color}`, borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Producto {slotIdx + 1}
        </div>
        <select
          value={product?.nombre || ''}
          onChange={e => onSelect(savedProducts.find(p => p.nombre === e.target.value) || null)}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, cursor: 'pointer', outline: 'none' }}
        >
          <option value="">— Elegí un producto —</option>
          {savedProducts.map(p => (
            <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {/* Data */}
      {c && product ? (
        <>
          {/* Costo grande */}
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Costo unitario</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontFamily: "'DM Mono',monospace", lineHeight: 1.1 }}>{ars(c.costoARS)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>U$S {rd(c.costoUSD, 2)} · {product.qty} u</div>

            {/* Barra de composición */}
            <div style={{ display: 'flex', height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 10, gap: 1 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ flex: Math.max(b.pct, 0.5), background: b.color, borderRadius: 2 }} title={`${b.label}: ${rd(b.pct, 1)}%`} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 5 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-3)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: b.color, flexShrink: 0 }} />
                  {b.label} <strong style={{ color: 'var(--text-2)' }}>{rd(b.pct, 1)}%</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Desglose */}
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {[
              { label: 'FOB',            val: `U$S ${rd(c.fob, 3)}`,            color: '#4a7dc1' },
              { label: 'Flete + seguro', val: `U$S ${rd(c.fleteUnit + c.seguroUnit, 2)}`, color: '#4a8ac4' },
              { label: 'Despacho',       val: `U$S ${rd(c.aduanaUnit, 2)}`,     color: '#6b9b8b' },
              { label: `Trader (${c.traderPct}%)`, val: `U$S ${rd(c.traderUnit, 3)}`, color: '#7ba3d4' },
              { label: `D.I. (${c.di}%)`, val: `U$S ${rd(c.diUnit, 2)}`,        color: '#c0392b' },
              { label: `IVA (${c.ivaImp}%)`, val: `U$S ${rd(c.ivaUnit, 2)}`,   color: '#e07070' },
              { label: `T.E. (${c.te}%)`,  val: `U$S ${rd(c.teUnit, 3)}`,      color: '#e09070' },
            ].map(({ label, val, color: rc }, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${rc}` }}>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono',monospace", color: 'var(--text)' }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--accent)', borderLeft: '3px solid var(--accent)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#fff' }}>U$S {rd(c.costoUSD, 2)}</span>
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: 'var(--bg-3)', border: '1px dashed var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Seleccioná un producto para comparar
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

  // Canales compartidos para comparar
  const sharedCanales = prodA?.canales || prodB?.canales || canales;

  const hasBoth = cA && cB;

  return (
    <div className="ip-section active" id="section-comparator">
      <section className="tab" style={{ display: 'block' }}>
        <div className="page-header">
          <h1>Comparar productos</h1>
          <p className="page-sub">Analizá dos productos lado a lado para decidir cuál importar</p>
        </div>

        {savedProducts.length < 2 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Necesitás al menos 2 productos guardados</div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>Calculá y guardá productos desde la calculadora para poder compararlos</div>
            <button onClick={() => setActiveSection('calc')} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Ir a la calculadora →
            </button>
          </div>
        ) : (
          <>
            {/* Slots lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <ProductSlot slotIdx={0} product={prodA} onSelect={setProdA} savedProducts={savedProducts} globalTC={globalTC} />
              <ProductSlot slotIdx={1} product={prodB} onSelect={setProdB} savedProducts={savedProducts} globalTC={globalTC} />
            </div>

            {/* Comparación de canales */}
            {hasBoth && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header"><span className="card-title">Ganancia por canal de venta</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sharedCanales.map((ch, i) => {
                    const ganA = chanGanNeta(ch, cA.costoARS);
                    const ganB = chanGanNeta(ch, cB.costoARS);
                    const maxGan = Math.max(ganA || 0, ganB || 0, 1);
                    const color = CANAL_COLORS[i % CANAL_COLORS.length];
                    return (
                      <div key={i} style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${color}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{ch.nombre} — {ars(ch.precio)} · comisión {ch.comision}%</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            { prod: prodA, gan: ganA, slotColor: SLOT_COLORS[0] },
                            { prod: prodB, gan: ganB, slotColor: SLOT_COLORS[1] },
                          ].map(({ prod, gan, slotColor }, si) => {
                            const isNeg = gan !== null && gan < 0;
                            const pct = gan > 0 ? (gan / maxGan) * 100 : 0;
                            const margin = gan !== null && ch.precio > 0 ? (gan / ch.precio * 100) : null;
                            return (
                              <div key={si}>
                                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: 2, background: slotColor, flexShrink: 0 }} />
                                  {prod?.nombre || `Producto ${si + 1}`}
                                  {margin !== null && <DiffBadge valA={si === 0 ? gan : ganB} valB={si === 0 ? ganB : ganA} higherIsBetter={true} />}
                                </div>
                                <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                                  <div style={{ height: '100%', width: `${Math.max(pct, isNeg ? 100 : 0)}%`, background: isNeg ? '#c0392b' : slotColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: isNeg ? '#c0392b' : 'var(--text)', fontFamily: "'DM Mono',monospace" }}>
                                    {gan !== null ? ars(gan) : '—'}
                                  </span>
                                  {margin !== null && (
                                    <span style={{ fontSize: 10, color: isNeg ? '#c0392b' : 'var(--text-3)', fontWeight: 600 }}>{rd(margin, 1)}%</span>
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

            {/* Resumen si hay ambos */}
            {hasBoth && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header"><span className="card-title">Resumen comparativo</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[
                    { label: 'Costo unitario (ARS)', valA: cA.costoARS,  valB: cB.costoARS,  fmt: ars, higherIsBetter: false },
                    { label: 'Costo unitario (USD)', valA: cA.costoUSD,  valB: cB.costoUSD,  fmt: v => `U$S ${rd(v,2)}`, higherIsBetter: false },
                    { label: 'FOB',                  valA: cA.fob,       valB: cB.fob,       fmt: v => `U$S ${rd(v,3)}`, higherIsBetter: false },
                    { label: 'Impuestos totales',    valA: cA.diUnit+cA.ivaUnit+cA.teUnit, valB: cB.diUnit+cB.ivaUnit+cB.teUnit, fmt: v => `U$S ${rd(v,2)}`, higherIsBetter: false },
                  ].map(({ label, valA, valB, fmt, higherIsBetter }, i) => (
                    <div key={i} style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[{ val: valA, prod: prodA, color: SLOT_COLORS[0], otherVal: valB },
                          { val: valB, prod: prodB, color: SLOT_COLORS[1], otherVal: valA }].map(({ val, prod, color, otherVal }, si) => {
                          const isBetter = higherIsBetter ? val > otherVal : val < otherVal;
                          return (
                            <div key={si} style={{ background: isBetter ? `${color}15` : 'transparent', borderRadius: 6, padding: '5px 8px', border: isBetter ? `1px solid ${color}40` : '1px solid transparent' }}>
                              <div style={{ fontSize: 9, color, fontWeight: 700, marginBottom: 2 }}>{prod?.nombre || `Prod. ${si+1}`}</div>
                              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: 'var(--text)' }}>{fmt(val)}</div>
                              {isBetter && <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 1 }}>✓ mejor</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
