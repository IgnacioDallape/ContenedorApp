import { useEffect, useState, lazy, Suspense } from 'react';
import { _sb } from '../../lib/supabase.js';
import { PB_PALLET_TYPES } from '../../lib/constants.js';

const PalletThreeCanvas = lazy(() => import('../PalletBuilder/PalletThreeCanvas.jsx'));

const fmt = (n, dec = 2) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const usd = (n) => 'U$S ' + fmt(n);

const STATUS_CONFIG = {
  preparacion:         { label: 'En preparación',              color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  en_transito_puerto:  { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto_partida:   { label: 'En puerto de partida',        color: '#8C6B3C', bg: '#FBF3E6', icon: '⚓' },
  embarcado:           { label: 'Embarcado',                   color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto_destino:   { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
  en_transito_destino: { label: 'En tránsito a destino final', color: '#4D7C8A', bg: '#EDF6F8', icon: '🚚' },
  entregado:           { label: 'Entregado',                   color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

export default function SharePalletPage({ palletId }) {
  const [pallet, setPallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error: e } = await _sb.from('pallets')
          .select('*').eq('id', palletId).eq('is_public', true).maybeSingle();
        if (cancelled) return;
        if (data) { setPallet(data); setLoading(false); return; }
        if (e && attempt === 5) {
          setError('No pude cargar este pallet. El link puede no estar disponible.');
          setLoading(false);
          return;
        }
        if (attempt < 5) await wait(650);
      }
      if (!cancelled) {
        setError('Este pallet no existe o no es público.');
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [palletId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#8D7966', letterSpacing: 2 }}>
      Cargando pallet...
    </div>
  );
  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Jost', sans-serif", color: '#6b5a4e', gap: 12 }}>
      <div style={{ fontSize: 40 }}>📦</div>
      <div style={{ fontSize: 16 }}>{error}</div>
      <a href="/" style={{ fontSize: 13, color: '#8D7966' }}>Ir a ImportaPro →</a>
    </div>
  );

  const payload = pallet.payload || {};
  const products = payload.products || [];
  const results = payload.results || [];
  const pt = PB_PALLET_TYPES[payload.palletType] || { L: 120, W: 100, label: payload.palletType };

  const totalBoxes = results.reduce((s, r) => s + (r.boxes?.length || 0), 0);
  const totalWeight = results.reduce((s, r) => s + (Number(r.totalWeight) || 0), 0);
  const totalValue = products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 0), 0);
  const st = STATUS_CONFIG[pallet.status] || STATUS_CONFIG.preparacion;
  const date = new Date(pallet.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const active = results[activeIdx];

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4EE', fontFamily: "'Jost', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#8D7966', color: '#fff', padding: '16px 32px' }}>
        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>IMPORTAPRO — PALLET COMPARTIDO</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{pallet.name}</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{date}</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            ['Pallets', results.length],
            ['Cajas', totalBoxes],
            ['Peso total', fmt(totalWeight, 1) + ' kg'],
            ['Tipo', pt.label || payload.palletType],
            ...(totalValue > 0 ? [['Valor', usd(totalValue)]] : []),
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '12px 10px', border: '1px solid #E8E0D8', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#8D7966', letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4a3d35' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div style={{
          background: st.bg, border: `1.5px solid ${st.color}40`,
          borderLeft: `5px solid ${st.color}`,
          borderRadius: 10, padding: '14px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>{st.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: st.color, letterSpacing: 1, marginBottom: 2 }}>ESTADO</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{st.label}</div>
          </div>
          {pallet.tracking_url && (
            <a href={pallet.tracking_url} target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 16px', background: '#fff', color: '#8D7966', border: '1.5px solid #8D7966', borderRadius: 8, textDecoration: 'none', fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>
              🔗 Tracking →
            </a>
          )}
        </div>

        {/* 3D View */}
        {active && (
          <div style={{ marginBottom: 20, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#F0EBE3', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8D7966', letterSpacing: 1 }}>VISTA 3D — SOLO LECTURA</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {results.map((r, i) => (
                  <button key={i} onClick={() => setActiveIdx(i)}
                    style={{ padding: '4px 10px', fontSize: 11, fontFamily: "'DM Mono', monospace", borderRadius: 5, cursor: 'pointer', border: `1.5px solid ${activeIdx === i ? '#8D7966' : '#E8E0D8'}`, background: activeIdx === i ? '#8D7966' : 'transparent', color: activeIdx === i ? '#fff' : '#8D7966' }}>
                    Pallet {i + 1} ({r.boxes?.length || 0})
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 460, position: 'relative' }}>
              <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#8D7966', letterSpacing: 2 }}>Cargando 3D...</div>}>
                <PalletThreeCanvas
                  result={active}
                  selectedBoxUid={null}
                  onSelectBox={() => {}}
                  onUpdateBoxes={() => {}}
                  onDropReserveBox={() => {}}
                  readOnly={true}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Per pallet detail */}
        {results.map((r, i) => {
          const boxes = r.boxes || [];
          if (!boxes.length) return null;
          // Aggregate boxes by product id
          const byId = new Map();
          boxes.forEach(b => {
            const k = b.id;
            if (!byId.has(k)) byId.set(k, { name: b.name, count: 0, weight: 0 });
            const e = byId.get(k);
            e.count++;
            e.weight += Number(b.weight) || 0;
          });
          // Merge with products to get price + dims
          const prodById = new Map(products.map(p => [p.id, p]));
          const rows = [...byId.entries()].map(([id, e]) => {
            const p = prodById.get(id);
            return {
              name: e.name, count: e.count, weight: e.weight,
              dims: p?.dims, price: p?.price,
            };
          });
          return (
            <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ background: '#F0EBE3', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 600, color: '#5a4a3e' }}>📦 Pallet {i + 1} — {boxes.length} cajas</div>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#8D7966' }}>
                  Altura: {r.totalHeight || '—'} cm · Peso: {fmt(r.totalWeight || 0, 1)} kg
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E8E0D8' }}>
                    {['Producto', 'Dims (cm)', 'Cant.', 'Peso total', 'Precio/u', 'Subtotal'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8D7966', fontWeight: 600, letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, j) => (
                    <tr key={j} style={{ borderBottom: '1px solid #F0EBE3' }}>
                      <td style={{ padding: '8px 14px', color: '#4a3d35' }}>{row.name}</td>
                      <td style={{ padding: '8px 14px', color: '#6b5a4e' }}>{row.dims ? `${row.dims.L}×${row.dims.W}×${row.dims.H}` : '—'}</td>
                      <td style={{ padding: '8px 14px', color: '#4a3d35', fontWeight: 600 }}>{row.count}</td>
                      <td style={{ padding: '8px 14px', color: '#6b5a4e' }}>{fmt(row.weight, 1)} kg</td>
                      <td style={{ padding: '8px 14px', color: '#6b5a4e' }}>{row.price ? usd(row.price) : '—'}</td>
                      <td style={{ padding: '8px 14px', color: '#4a3d35', fontWeight: 600 }}>{row.price ? usd(row.price * row.count) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#8D7966', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>
          GENERADO POR IMPORTAPRO — <a href="/" style={{ color: '#8D7966' }}>fleetloader.vercel.app</a>
        </div>
      </div>
    </div>
  );
}
