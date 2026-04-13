import { useEffect, useState } from 'react';
import useAuthStore from './stores/authStore.js';
import useAppStore from './stores/appStore.js';
import LoginPage from './components/Auth/LoginPage.jsx';
import AppShell from './components/Layout/AppShell.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const { user, loading, init } = useAuthStore();
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'recovery'

  useEffect(() => {
    init().then(mode => {
      if (mode === 'recovery') setAuthMode('recovery');
    });
  }, []);

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
