import { useEffect, useState, lazy, Suspense } from 'react';
import { _sb } from '../../lib/supabase.js';
import { CONTAINER_TYPES } from '../../lib/constants.js';
import useContainerStore from '../../stores/containerStore.js';

const ThreeCanvas = lazy(() => import('../ContainerLoader/ThreeCanvas.jsx'));

const fmt = (n, dec = 2) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const STATUS_CONFIG = {
  preparacion:         { label: 'En preparación',              color: '#C0614A', bg: '#FDF0ED', icon: '🔴' },
  en_transito_puerto:  { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto_partida:   { label: 'En puerto de partida',        color: '#8C6B3C', bg: '#FBF3E6', icon: '⚓' },
  embarcado:           { label: 'Embarcado',                   color: '#2E7DC0', bg: '#EBF4FD', icon: '🚢' },
  en_puerto_destino:   { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
  en_transito_destino: { label: 'En tránsito a destino final', color: '#4D7C8A', bg: '#EDF6F8', icon: '🚚' },
  entregado:           { label: 'Entregado',                   color: '#3A8C52', bg: '#EDF7F1', icon: '✅' },
  en_transito:         { label: 'En tránsito al puerto',       color: '#7A5C8A', bg: '#F3EEF8', icon: '🚛' },
  en_puerto:           { label: 'En puerto destino',           color: '#C08A1A', bg: '#FDF6E3', icon: '🟡' },
};

function normalizeShipmentStatus(status) {
  if (status === 'en_transito') return 'en_transito_puerto';
  if (status === 'en_puerto') return 'en_puerto_destino';
  return STATUS_CONFIG[status] ? status : 'preparacion';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function SharePage({ shipmentId }) {
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [show3d, setShow3d] = useState(false);
  const [active3d, setActive3d] = useState(0);

  const { loadShipmentData, switchToContainer } = useContainerStore();

  useEffect(() => {
    let cancelled = false;

    async function loadPublicShipment() {
      const maxAttempts = 6;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data, error } = await _sb
          .from('shipments')
          .select('*')
          .eq('id', shipmentId)
          .eq('is_public', true)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          setShipment(data);
          setLoading(false);
          return;
        }

        if (error && attempt === maxAttempts - 1) {
          setError('No pude cargar este embarque compartido. Intenta abrir el link nuevamente.');
          setLoading(false);
          return;
        }

        if (attempt < maxAttempts - 1) {
          await wait(650);
        }
      }

      if (!cancelled) {
        setError('Este embarque no existe o no esta disponible publicamente.');
        setLoading(false);
      }
    }

    loadPublicShipment();
    return () => { cancelled = true; };
  }, [shipmentId]);

  function handle3d(conts) {
    const loadable = conts.map((c, i) => ({
      id: i + 1,
      type: c.type || '20ft',
      products: (c.products || []).map(p => ({
        ...p,
        vol: p.vol || ((p.dims?.L || 0) * (p.dims?.W || 0) * (p.dims?.H || 0)) / 1e6,
      })),
      priorityZones: c.priorityZones || [null, null, null],
      instanceManualPos: c.instanceManualPos || {},
      instanceLockedOri: c.instanceLockedOri || {},
    }));
    loadShipmentData({ id: shipmentId, name: shipment?.name || '', containers: loadable });
    setActive3d(0);
    setShow3d(true);
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 12, color: '#8D7966', letterSpacing: 2 }}>
      Cargando embarque...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#6b5a4e', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🚢</div>
      <div style={{ fontSize: 16 }}>{error}</div>
      <a href="/" style={{ fontSize: 13, color: '#8D7966' }}>Ir a ImportaPro →</a>
    </div>
  );

  const rawC = shipment.containers || [];
  const containers = Array.isArray(rawC) ? rawC : (rawC?.items || []);
  const shipNotes = Array.isArray(rawC) ? '' : (rawC?.notes || '');
  const allProds = containers.flatMap(c => c.products || []);
  const totU = allProds.reduce((s, p) => s + p.qty, 0);
  const totV = allProds.reduce((s, p) => s + p.vol * p.qty, 0);
  const totW = allProds.reduce((s, p) => s + (p.weight || 0) * p.qty, 0);
  const totVal = allProds.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
  const st = STATUS_CONFIG[normalizeShipmentStatus(shipment.status)] || STATUS_CONFIG.preparacion;
  const date = new Date(shipment.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4EE', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#8D7966', color: '#fff', padding: '16px 32px' }}>
        <div style={{ fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>IMPORTAPRO — EMBARQUE COMPARTIDO</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{shipment.name}</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{date}</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            ['Contenedores', containers.length],
            ['Unidades', totU],
            ['Volumen', fmt(totV) + ' m³'],
            ['Valor', 'U$S ' + fmt(totVal)],
          ].map(([label, val]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '12px 10px', border: '1px solid #E8E0D8', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#8D7966', letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4a3d35' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div style={{
          background: st.bg, border: `1.5px solid ${st.color}40`,
          borderLeft: `5px solid ${st.color}`,
          borderRadius: 10, padding: '14px 20px', marginBottom: shipNotes ? 10 : 24,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>{st.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: st.color, letterSpacing: 1, marginBottom: 2 }}>ESTADO DEL EMBARQUE</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{st.label}</div>
          </div>
          {allProds.length > 0 && (
            <button
              onClick={() => show3d ? setShow3d(false) : handle3d(containers)}
              style={{ padding: '8px 16px', background: show3d ? '#8D7966' : '#fff', color: show3d ? '#fff' : '#8D7966', border: '1.5px solid #8D7966', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>
              {show3d ? '× Cerrar 3D' : '🧊 Ver en 3D'}
            </button>
          )}
        </div>

        {/* Notes */}
        {shipNotes && (
          <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#5a4a3e', lineHeight: 1.6 }}>
            📝 {shipNotes}
          </div>
        )}

        {/* 3D View */}
        {show3d && (
          <div style={{ marginBottom: 20, background: '#fff', border: '1px solid #E8E0D8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#F0EBE3', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: '#8D7966', letterSpacing: 1 }}>VISTA 3D</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {containers.map((c, i) => (
                  <button key={i} onClick={() => { switchToContainer(i); setActive3d(i); }}
                    style={{ padding: '4px 10px', fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 5, cursor: 'pointer', border: `1.5px solid ${active3d === i ? '#8D7966' : '#E8E0D8'}`, background: active3d === i ? '#8D7966' : 'transparent', color: active3d === i ? '#fff' : '#8D7966' }}>
                    Cont. {i + 1}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 380, position: 'relative' }}>
              <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 11, color: '#8D7966', letterSpacing: 2 }}>Cargando 3D...</div>}>
                <ThreeCanvas readOnly />
              </Suspense>
            </div>
          </div>
        )}

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
                <div style={{ fontSize: 11, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#8D7966' }}>{fmt(cVol)} m³ · {pct}% ocupación</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E8E0D8' }}>
                    {['Producto', 'Tipo', 'Dims (cm)', 'Cant.', 'Volumen', 'Precio/u', 'Notas'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 10, color: '#8D7966', fontWeight: 600, letterSpacing: 1 }}>{h}</th>
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
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>{p.dims.L}×{p.dims.W}×{p.dims.H}</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', textAlign: 'center' }}>{p.qty}</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12 }}>{fmt(p.vol * p.qty)} m³</td>
                      <td style={{ padding: '9px 14px', color: '#6b5a4e', fontSize: 12 }}>{p.price ? 'U$S ' + fmt(p.price) : '—'}</td>
                      <td style={{ padding: '9px 14px', color: '#9a8778', fontSize: 11, fontStyle: 'italic' }}>{p.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
