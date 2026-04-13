import { useEffect, useState } from 'react';
import useAuthStore from './stores/authStore.js';
import useAppStore from './stores/appStore.js';
import useContainerStore from './stores/containerStore.js';
import LoginPage from './components/Auth/LoginPage.jsx';
import AppShell from './components/Layout/AppShell.jsx';
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
  const shareId = getShareId();

  // If share URL, render SharePage without auth
  if (shareId) return <SharePage shipmentId={shareId} />;

  useEffect(() => {
    init().then(mode => {
      if (mode === 'recovery') setAuthMode('recovery');
    });
  }, []);

  useEffect(() => {
    if (user) loadCatalog();
  }, [user]);

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
      {!user ? <LoginPage initialMode={authMode} /> : <AppShell />}
      <Toast />
    </>
  );
}
