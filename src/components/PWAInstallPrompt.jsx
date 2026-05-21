import { useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'importapro-pwa-dismissed-v1';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function detectSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('safari') && !ua.includes('crios') && !ua.includes('fxios') && !ua.includes('edgios');
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(() => isStandaloneMode());

  const isIos = useMemo(() => detectIos(), []);
  const isSafari = useMemo(() => detectSafari(), []);

  useEffect(() => {
    if (installed) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const handleBeforeInstallPrompt = event => {
      event.preventDefault();
      setDeferredPrompt(event);
      setOpen(true);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if (isIos && isSafari && !isStandaloneMode()) {
      setOpen(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [installed, isIos, isSafari]);

  async function installNow() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
  }

  function closePrompt() {
    setOpen(false);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  if (installed || !open) return null;

  const canDesktopInstall = !!deferredPrompt;
  const showIosGuide = isIos && isSafari && !canDesktopInstall;

  return (
    <div
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 2000,
        width: 'min(360px, calc(100vw - 24px))',
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(141,121,102,0.18)',
        borderRadius: 24,
        boxShadow: '0 18px 60px rgba(58, 42, 30, 0.16)',
        padding: '16px 16px 14px',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 28, lineHeight: 1, color: 'var(--text)' }}>
            Instalar app
          </div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {showIosGuide
              ? 'Usala desde el inicio del iPhone como si fuera una app nativa.'
              : 'Instalala en tu escritorio o celular para abrirla mas rapido y en pantalla completa.'}
          </div>
        </div>
        <button
          type="button"
          onClick={closePrompt}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 2,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      {showIosGuide ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 8, color: 'var(--text)', fontSize: 13, lineHeight: 1.6 }}>
          <div>1. Tocá el botón <strong>Compartir</strong> de Safari.</div>
          <div>2. Elegí <strong>Agregar a pantalla de inicio</strong>.</div>
          <div>3. Guardala como <strong>ImportaPro</strong> y te queda en el inicio.</div>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <button
            type="button"
            onClick={installNow}
            style={{
              border: 'none',
              borderRadius: 14,
              background: 'var(--accent2)',
              color: '#fff',
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Instalar ImportaPro
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Si no ves el popup, abrí el menú del navegador y buscá la opción <strong>Instalar app</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
