import { useEffect, useState } from 'react';
import { _sb } from '../../lib/supabase.js';
import { CONTAINER_TYPES } from '../../lib/constants.js';

const fmt = (n, dec = 2) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const STATUS_CONFIG = {
  preparacion: { label: 'En preparación', color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  embarcado:   { label: 'Embarcado',      color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto:   { label: 'En puerto',      color: '#C08A1A', bg: '#FDF6E3', icon: '⚓' },
  entregado:   { label: 'Entregado',      color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
};

export default function SharePage({ shipmentId }) {
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    _sb.from('shipments').select('*').eq('id', shipmentId).eq('is_public', true).single()
      .then(({ data, error }) => {
        if (error || !data) setError('Este embarque no existe o no está disponible públicamente.');
        else setShipment(data);
        setLoading(false);
      });
  }, [shipmentId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#8D7966', letterSpacing: 2 }}>
      Cargando embarque...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Jost', sans-serif", color: '#6b5a4e', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🚢</div>
      <div style={{ fontSize: 16 }}>{error}</div>
      <a href="/" style={{ fontSize: 13, color: '#8D7966' }}>Ir a ImportaPro →</a>
    </div>
  );

  const containers = shipment.containers || [];
  const allProds = containers.flatMap(c => c.products || []);
  const totU = allProds.reduce((s, p) => s + p.qty, 0);
  const totV = allProds.reduce((s, p) => s + p.vol * p.qty, 0);
  const totW = allProds.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
  const totVal = allProds.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
  const st = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.preparacion;
  const date = new Date(shipment.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4EE', fontFamily: "'Jost', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#8D7966', color: '#fff', padding: '16px 32px' }}>
        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>IMPORTAPRO — EMBARQUE COMPARTIDO</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{shipment.name}</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{date}</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            ['Contenedores', containers.length],
            ['Unidades', totU],
            ['Volumen', fmt(totV) + ' m³'],
            ['Valor', 'U$S ' + fmt(totVal)],
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #E8E0D8', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: '#8D7966', letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#4a3d35' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div style={{
          background: st.bg, border: `1.5px solid ${st.color}40`,
          borderLeft: `5px solid ${st.color}`,
          borderRadius: 10, padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>{st.icon}</span>
          <div>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: st.color, letterSpacing: 1, marginBottom: 2 }}>ESTADO DEL EMBARQUE</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{st.label}</div>
          </div>
        </div>

        {/* Per container */}
        {containers.map((cont, ci) => {
          const prods = cont.products || [];
          if (!prods.length) return null;
          const ct = CONTAINER_TYPES[cont.type];
          const cVol = prods.reduce((s, p) => s + p.vol * p.qty, 0);
          const pct = ct ? (cVol / ct.vol * 100).toFixed(1) : '—';
          return (
            <div key={ci} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E8E0D8', marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ background: '#F0EBE3', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, color: '#5a4a3e' }}>Contenedor {ci + 1} — {ct?.label || cont.type}</div>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#8D7966' }}>{fmt(cVol)} m³ · {pct}% ocupación</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E8E0D8' }}>
                    {['Producto', 'Tipo', 'Dims (cm)', 'Cant.', 'Volumen', 'Precio/u', 'Notas'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#8D7966', fontWeight: 600, letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prods.map((p, pi) => (
                    <tr key={pi} style={{ borderBottom: '1px solid #F0EBE3', background: pi % 2 === 0 ? '#FAFAF8' : '#fff' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 500, color: '#3d2e24' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: p.color, marginRight: 7, verticalAlign: 'middle' }} />
                        {p.name}
                      </td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12 }}>{p.type === 'pallet' ? 'Pallet' : 'Caja'}</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{p.dims.L}×{p.dims.W}×{p.dims.H}</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', textAlign: 'center' }}>{p.qty}</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12 }}>{fmt(p.vol * p.qty)} m³</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12 }}>{p.price ? 'U$S ' + fmt(p.price) : '—'}</td>
                      <td style={{ padding: '9px 14px', color: '#9a8778', fontSize: 11, fontStyle: 'italic' }}>{p.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9a8778' }}>
          Generado por <a href="/" style={{ color: '#8D7966' }}>ImportaPro</a> · fleetloader.vercel.app
        </div>
      </div>
    </div>
  );
}
