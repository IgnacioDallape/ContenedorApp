import { useEffect, useState } from 'react';
import useAuthStore from './stores/authStore.js';
import useAppStore from './stores/appStore.js';
import useContainerStore from './stores/containerStore.js';
import LoginPage from './components/Auth/LoginPage.jsx';
import AppShell from './components/Layout/AppShell.jsx';
import PWAInstallPrompt from './components/PWAInstallPrompt.jsx';
import SharePage from './components/Share/SharePage.jsx';
import Toast from './components/Toast.jsx';

// Detect /share/:id in URL
function getShareId() {
  const match = window.location.pathname.match(/^\/share\/([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}

export default function App() {
  const { user, loading, init } = useAuthStore();
  const { loadCatalog } = useContainerStore();
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const shareId = getShareId();

  // Hooks must always be called — early return is AFTER all hooks
  useEffect(() => {
    if (shareId) return;
    init().then(mode => {
      if (mode === 'recovery') {
        setAuthMode('recovery');
        setAuthMessage('');
      } else if (typeof mode === 'object' && mode?.mode === 'forgot') {
        setAuthMode('forgot');
        setAuthMessage(mode.message || '');
      }
    });
  }, []);

  useEffect(() => {
    if (shareId || !user) return;
    loadCatalog();
  }, [user]);

  // If share URL, render SharePage without auth
  if (shareId) return <><SharePage shipmentId={shareId} /><Toast /></>;

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg, #F8F4EE)' }}>
        <div style={{ fontFamily:'DM Mono, monospace', fontSize:12, color:'var(--muted, #8D7966)', letterSpacing:2 }}>
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <>
      {!user ? <LoginPage initialMode={authMode} initialMessage={authMessage} /> : <AppShell />}
      <PWAInstallPrompt />
      <Toast />
    </>
  );
}
