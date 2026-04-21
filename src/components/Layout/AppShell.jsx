import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import useAuthStore from '../../stores/authStore.js';
import useAppStore from '../../stores/appStore.js';
import useImportaproStore from '../../stores/importaproStore.js';
import { _sb } from '../../lib/supabase.js';
import { getAppUrl } from '../../lib/appUrl.js';

import Calculator from '../ImportaPro/Calculator.jsx';
import Products from '../ImportaPro/Products.jsx';
import NcmSearch from '../ImportaPro/NcmSearch.jsx';
import Simulator from '../ImportaPro/Simulator.jsx';
import Prices from '../ImportaPro/Prices.jsx';
import Settings from '../ImportaPro/Settings.jsx';
import Comparator from '../ImportaPro/Comparator.jsx';
import UpgradeModal from './UpgradeModal.jsx';

const ContainerLoader = lazy(() => import('../ContainerLoader/ContainerLoader.jsx'));
const PalletBuilder = lazy(() => import('../PalletBuilder/PalletBuilder.jsx'));

const Loader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
    Cargando...
  </div>
);

const ShipMark = ({ size = 58 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M14 39H50L46 50H18L14 39Z" fill="#F24E4E" />
    <path d="M10 50H54C52 54.8 47.3 58 42 58H22C16.7 58 12 54.8 10 50Z" fill="#4A90E2" />
    <path d="M18 31H46V39H18V31Z" fill="#FFF4E6" />
    <path d="M21 24H43V31H21V24Z" fill="#FFF4E6" />
    <path d="M27 16H39V24H27V16Z" fill="#FFF4E6" />
    <path d="M36 10L46 16H36V10Z" fill="#8D7966" />
    <path d="M39 10V31" stroke="#6B5D4F" strokeWidth="2" strokeLinecap="round" />
    <path d="M27 16L36 10" stroke="#6B5D4F" strokeWidth="2" strokeLinecap="round" />
    <path d="M21 34H26" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M30 34H35" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M39 34H44" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M24 27H28" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M32 27H36" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M40 27H44" stroke="#22C1F1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M17 43H47" stroke="#6B5D4F" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

function WelcomePanel({ label, userPlan }) {
  const planLabel = userPlan === 'promax' ? 'Pro Max' : userPlan === 'pro' ? 'Pro' : userPlan === 'basic' ? 'Basic' : 'sin plan';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          background: 'rgba(255,255,255,0.78)',
          border: '1px solid rgba(141,121,102,0.18)',
          borderRadius: 28,
          boxShadow: '0 24px 80px rgba(58, 42, 30, 0.08)',
          padding: '52px 56px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 28,
              background: 'rgba(141,121,102,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShipMark size={64} />
          </div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 50, lineHeight: 1.05, color: 'var(--text)' }}>
          Bienvenido {label}
        </h1>
        <p style={{ margin: '16px auto 0', maxWidth: 560, fontSize: 18, lineHeight: 1.7, color: 'var(--text-2)' }}>
          Listo para empezar a importar?
        </p>
        <div
          style={{
            marginTop: 26,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'rgba(141,121,102,0.1)',
            color: 'var(--accent2)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Plan actual: {planLabel}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { user, userPlan } = useAuthStore();
  const { activeSection, setActiveSection, showToast } = useAppStore();
  const [upgradeModal, setUpgradeModal] = useState(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const label = user?.user_metadata?.username || user?.email?.split('@')[0] || '-';

  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  function navigate(id) {
    if (id === 'settings') {
      setActiveSection('settings');
      return;
    }

    if (id === 'container' && !['pro', 'promax'].includes(userPlan)) {
      setUpgradeModal('Pro');
      return;
    }

    if (id === 'palletbuilder' && userPlan !== 'promax') {
      setUpgradeModal('Pro Max');
      return;
    }

    if (userPlan === 'none') {
      setUpgradeModal('Basic');
      return;
    }

    setActiveSection(id);
  }

  function openSettingsSection(sectionId = null) {
    setActiveSection('settings');
    setProfileOpen(false);

    if (!sectionId) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  const navItem = (id, icon, itemLabel) => {
    const active = activeSection === id;
    const locked = (id !== 'settings' && userPlan === 'none')
      || (id === 'container' && !['pro', 'promax'].includes(userPlan))
      || (id === 'palletbuilder' && userPlan !== 'promax');

    return (
      <button
        key={id}
        className={`nav-item${active ? ' active' : ''}`}
        style={locked ? { opacity: 0.4 } : {}}
        onClick={() => navigate(id)}
      >
        <span className="nav-icon">{icon}</span>
        <span>{itemLabel}</span>
      </button>
    );
  };

  return (
    <div className="app-shell" id="appShell" style={{ display: 'flex' }}>
      <aside className="sidebar">
        <div className="brand">
          <div
            className="brand-icon"
            style={{
              width: 36,
              height: 36,
              background: 'rgba(141,121,102,0.12)',
              color: 'transparent',
            }}
          >
            <ShipMark size={26} />
          </div>
          <div>
            <div className="brand-name">ImportaPro</div>
            <div className="brand-sub">Importacion + Contenedor</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section">Importacion</div>
          {navItem('calc', '+', 'Calculadora')}
          {navItem('products', '[]', 'Mis productos')}
          {navItem('comparator', '<>', 'Comparar productos')}
          {navItem('ncm', '?', 'Buscar NCM')}
          {navItem('simulator', 'o', 'Simulador de precio')}
          {navItem('prices', '$', 'Precios confirmados')}

          <div className="nav-section">Contenedor</div>
          {navItem('container', '3D', 'Cargar contenedor')}
          {navItem('palletbuilder', 'PL', 'Armador de pallets')}
        </nav>

        <div className="sidebar-footer">
          <div ref={profileRef} style={{ position: 'relative', marginTop: 12 }}>
            {profileOpen && (
              <ProfilePanel
                user={user}
                label={label}
                onClose={() => setProfileOpen(false)}
                showToast={showToast}
                onOpenSettings={openSettingsSection}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                onClick={() => setProfileOpen(current => !current)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: profileOpen ? 'var(--accent-dim, rgba(141,121,102,0.1))' : 'var(--bg-3)',
                  border: `1px solid ${profileOpen ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {label.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-3)', transition: 'transform 0.2s', transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>^</span>
              </div>

              <button
                type="button"
                onClick={() => openSettingsSection()}
                aria-label="Abrir configuracion"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: activeSection === 'settings' ? 'var(--accent-dim)' : 'var(--bg-3)',
                  color: activeSection === 'settings' ? 'var(--accent)' : 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.2 1.2a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2A1.2 1.2 0 0 1 13.8 22h-1.6A1.2 1.2 0 0 1 11 20.8v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.2-1.2a1.2 1.2 0 0 1 0-1.7l.1-.1A1 1 0 0 0 6.2 15a1 1 0 0 0-.9-.6h-.2A1.2 1.2 0 0 1 4 13.2v-1.6A1.2 1.2 0 0 1 5.2 10h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l1.2-1.2a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.2A1.2 1.2 0 0 1 12.2 3h1.6A1.2 1.2 0 0 1 15 4.2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.2 1.2a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.2A1.2 1.2 0 0 1 22 11.8v1.6a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        {activeSection === 'home' && <WelcomePanel label={label} userPlan={userPlan} />}
        {activeSection === 'calc' && <Calculator />}
        {activeSection === 'products' && <Products />}
        {activeSection === 'comparator' && <Comparator />}
        {activeSection === 'ncm' && <NcmSearch />}
        {activeSection === 'simulator' && <Simulator />}
        {activeSection === 'prices' && <Prices />}
        {activeSection === 'settings' && <Settings onCheckout={plan => setUpgradeModal(plan)} />}

        <Suspense fallback={<Loader />}>
          {activeSection === 'container' && <ContainerLoader />}
          {activeSection === 'palletbuilder' && <PalletBuilder />}
        </Suspense>
      </div>

      {upgradeModal && (
        <UpgradeModal planName={upgradeModal} onClose={() => setUpgradeModal(null)} />
      )}
    </div>
  );
}

function ProfilePanel({ user, label, onClose, showToast, onOpenSettings }) {
  const [displayName, setDisplayName] = useState(user?.user_metadata?.username || label);
  const [phone, setPhone] = useState(user?.user_metadata?.phone || '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await _sb.auth.updateUser({
        data: { username: displayName.trim(), phone: phone.trim() },
      });
      if (error) throw error;
      useAuthStore.getState().setUser({
        ...user,
        user_metadata: { ...user.user_metadata, username: displayName.trim(), phone: phone.trim() },
      });
      showToast('Perfil actualizado', 'success');
      onClose();
    } catch (e) {
      showToast(`Error al guardar: ${e.message || e}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setResetting(true);
    try {
      const { error } = await _sb.auth.resetPasswordForEmail(user.email, {
        redirectTo: getAppUrl(),
      });
      if (error) throw error;
      showToast(`Email de cambio de contrasena enviado a ${user.email}`, 'success');
      onClose();
    } catch (e) {
      showToast(`Error: ${e.message || e}`, 'error');
    } finally {
      setResetting(false);
    }
  }

  async function handleLogout() {
    await useAuthStore.getState().logout();
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Mi perfil</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>x</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>Email</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nombre</label>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Telefono</label>
        <input
          type="tel"
          value={phone}
          placeholder="+54 11 1234-5678"
          onChange={e => setPhone(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', padding: '8px 0', marginBottom: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'var(--font)' }}
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>

      <button
        onClick={handleResetPassword}
        disabled={resetting}
        style={{ width: '100%', padding: '7px 0', marginBottom: 6, background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1, fontFamily: 'var(--font)' }}
      >
        {resetting ? 'Enviando...' : 'Cambiar contrasena ->'}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => onOpenSettings('settings-tc')}
          style={{ padding: '7px 0', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Tipo de cambio
        </button>
        <button
          onClick={() => onOpenSettings('settings-plan')}
          style={{ padding: '7px 0', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Mi plan
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '7px 0', background: 'transparent', color: 'var(--red, #c0392b)', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
