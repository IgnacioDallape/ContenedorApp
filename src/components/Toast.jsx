import useAppStore from '../stores/appStore.js';

export default function Toast() {
  const toasts = useAppStore(s => s.toasts);
  const removeToast = useAppStore(s => s.removeToast);

  return (
    <div id="toast" style={{ position:'fixed', bottom:'20px', left:'50%', transform:'translateX(-50%)', zIndex:9999, display:'flex', flexDirection:'column', gap:8, alignItems:'center', pointerEvents:'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            background: t.type === 'error' ? 'var(--danger, #c0392b)' : t.type === 'success' ? 'var(--green, #27ae60)' : 'rgba(58,48,40,0.92)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            animation: 'fadeInUp 0.2s ease',
            maxWidth: 400,
            textAlign: 'center',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
