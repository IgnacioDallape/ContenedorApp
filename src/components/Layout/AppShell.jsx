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
import BrandMark from '../Brand/BrandMark.jsx';
import UpgradeModal from './UpgradeModal.jsx';

const ContainerLoader = lazy(() => import('../ContainerLoader/ContainerLoader.jsx'));
const PalletBuilder = lazy(() => import('../PalletBuilder/PalletBuilder.jsx'));

const Loader = () => (
  <div className="shell-loader">
    Cargando...
  </div>
);

function NavSvg({ children, strokeWidth = 1.8 }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

const NAV_ICONS = {
  home: (
    <NavSvg>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5h4v5" />
    </NavSvg>
  ),
  calc: (
    <NavSvg>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 7.5h7" />
      <path d="M8.5 11.5h2" />
      <path d="M13.5 11.5h2" />
      <path d="M8.5 15.5h2" />
      <path d="M13.5 15.5h2" />
    </NavSvg>
  ),
  products: (
    <NavSvg>
      <path d="M12 3.8 19 7.5v9L12 20.2 5 16.5v-9L12 3.8Z" />
      <path d="M12 12.1 19 7.5" />
      <path d="M12 12.1 5 7.5" />
      <path d="M12 12.1v8.1" />
    </NavSvg>
  ),
  comparator: (
    <NavSvg>
      <path d="M7 6h10" />
      <path d="M7 12h7" />
      <path d="M7 18h4" />
      <path d="m15 10 2 2-2 2" />
    </NavSvg>
  ),
  ncm: (
    <NavSvg>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.2 15.2 3.3 3.3" />
    </NavSvg>
  ),
  simulator: (
    <NavSvg>
      <path d="M5 18h14" />
      <path d="M8 18v-4" />
      <path d="M12 18v-7" />
      <path d="M16 18V8" />
      <path d="m7 9 3-2.5 3 1.5 4-3" />
    </NavSvg>
  ),
  prices: (
    <NavSvg>
      <path d="M12 4v16" />
      <path d="M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.6 2.6 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3" />
    </NavSvg>
  ),
  container: (
    <NavSvg>
      <rect x="3.5" y="7" width="17" height="10" rx="2" />
      <path d="M7.5 7v10" />
      <path d="M12 7v10" />
      <path d="M16.5 7v10" />
    </NavSvg>
  ),
  palletbuilder: (
    <NavSvg>
      <path d="M5 9.5h14" />
      <path d="M6.5 9.5v4.5" />
      <path d="M12 9.5v4.5" />
      <path d="M17.5 9.5v4.5" />
      <path d="M4.5 14h15" />
      <path d="M7 18h10" />
    </NavSvg>
  ),
  settings: (
    <NavSvg strokeWidth={1.6}>
      <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.2 1.2a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2A1.2 1.2 0 0 1 13.8 22h-1.6A1.2 1.2 0 0 1 11 20.8v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.2-1.2a1.2 1.2 0 0 1 0-1.7l.1-.1A1 1 0 0 0 6.2 15a1 1 0 0 0-.9-.6h-.2A1.2 1.2 0 0 1 4 13.2v-1.6A1.2 1.2 0 0 1 5.2 10h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l1.2-1.2a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.2A1.2 1.2 0 0 1 12.2 3h1.6A1.2 1.2 0 0 1 15 4.2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.2 1.2a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.2A1.2 1.2 0 0 1 22 11.8v1.6a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.4Z" />
    </NavSvg>
  ),
};

function WelcomePanel({ label, userPlan }) {
  const planLabel = userPlan === 'promax' ? 'Pro Max' : userPlan === 'pro' ? 'Pro' : userPlan === 'basic' ? 'Basic' : 'sin plan';

  return (
    <div className="welcome-shell">
      <div className="welcome-card">
        <div className="welcome-mark-wrap">
          <div className="welcome-mark">
            <BrandMark size={64} />
          </div>
        </div>
        <h1 className="welcome-title">
          Bienvenido {label}
        </h1>
        <p className="welcome-copy">
          ¿Listo para empezar a importar?
        </p>
        <div className="welcome-pill">
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileDesktopRef = useRef(null);
  const profileMobileRef = useRef(null);

  const label = user?.user_metadata?.username || user?.email?.split('@')[0] || '-';
  const sectionNames = {
    home: 'Inicio',
    calc: 'Calculadora',
    products: 'Mis productos',
    comparator: 'Comparar productos',
    ncm: 'Buscar NCM',
    simulator: 'Simulador',
    prices: 'Precios confirmados',
    settings: 'Configuración',
    container: 'Cargar contenedor',
    palletbuilder: 'Armador de pallets',
  };

  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e) {
      const insideDesktop = profileDesktopRef.current?.contains(e.target);
      const insideMobile = profileMobileRef.current?.contains(e.target);
      if (!insideDesktop && !insideMobile) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeSection]);

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

  const mobileNavButton = (id, icon, itemLabel) => {
    const active = activeSection === id;
    const locked = (id !== 'settings' && userPlan === 'none')
      || (id === 'container' && !['pro', 'promax'].includes(userPlan))
      || (id === 'palletbuilder' && userPlan !== 'promax');

    return (
      <button
        key={id}
        type="button"
        className={`mnav-btn${active ? ' active' : ''}`}
        style={locked ? { opacity: 0.42 } : undefined}
        onClick={() => navigate(id)}
        title={locked ? 'Requiere plan superior' : itemLabel}
      >
        <span className="mnav-icon" style={{ position: 'relative', display: 'inline-block' }}>
          {icon}
          {locked && (
            <span style={{ position: 'absolute', top: -4, right: -6, fontSize: 9, lineHeight: 1 }}>🔒</span>
          )}
        </span>
        <span>{itemLabel}</span>
      </button>
    );
  };

  return (
    <div className="app-shell" id="appShell" style={{ display: 'flex' }}>
      <div className="mobile-topbar">
        <button type="button" className="mobile-topbar-menu" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M4 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M4 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>Menu</span>
        </button>
        <div className="mobile-topbar-brand">
          <div className="mobile-topbar-mark"><BrandMark size={22} /></div>
          <div>
            <div className="mobile-topbar-title">ImportaPro</div>
            <div className="mobile-topbar-sub">{sectionNames[activeSection] || 'Inicio'}</div>
          </div>
        </div>
        <div ref={profileMobileRef} style={{ position: 'relative' }}>
          {profileOpen && (
            <div className="mobile-profile-popover">
              <ProfilePanel
                user={user}
                label={label}
                onClose={() => setProfileOpen(false)}
                showToast={showToast}
                onOpenSettings={openSettingsSection}
              />
            </div>
          )}
          <button type="button" className="mobile-topbar-btn" onClick={() => setProfileOpen(current => !current)} aria-label="Abrir perfil">
            {label.charAt(0).toUpperCase()}
          </button>
        </div>
      </div>

      <div className={`mobile-drawer-backdrop${mobileMenuOpen ? ' open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`mobile-drawer${mobileMenuOpen ? ' open' : ''}`}>
        <div className="mobile-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="mobile-topbar-mark"><BrandMark size={22} /></div>
            <div>
              <div className="mobile-topbar-title">ImportaPro</div>
              <div className="mobile-topbar-sub">Menu principal</div>
            </div>
          </div>
          <button type="button" className="mobile-topbar-btn" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menu">×</button>
        </div>
        <div className="mobile-drawer-section">Importacion</div>
        <div className="mobile-drawer-items">
          {navItem('home', NAV_ICONS.home, 'Inicio')}
          {navItem('calc', NAV_ICONS.calc, 'Calculadora')}
          {navItem('products', NAV_ICONS.products, 'Mis productos')}
          {navItem('comparator', NAV_ICONS.comparator, 'Comparar productos')}
          {navItem('ncm', NAV_ICONS.ncm, 'Buscar NCM')}
          {navItem('simulator', NAV_ICONS.simulator, 'Simulador de precio')}
          {navItem('prices', NAV_ICONS.prices, 'Precios confirmados')}
        </div>
        <div className="mobile-drawer-section">Contenedor</div>
        <div className="mobile-drawer-items">
          {navItem('container', NAV_ICONS.container, 'Cargar contenedor')}
          {navItem('palletbuilder', NAV_ICONS.palletbuilder, 'Armador de pallets')}
          {navItem('settings', NAV_ICONS.settings, 'Configuración')}
        </div>
      </aside>

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
            <BrandMark size={26} />
          </div>
          <div>
            <div className="brand-name">ImportaPro</div>
            <div className="brand-sub">Importacion + Contenedor</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section">Importacion</div>
          {navItem('calc', NAV_ICONS.calc, 'Calculadora')}
          {navItem('products', NAV_ICONS.products, 'Mis productos')}
          {navItem('comparator', NAV_ICONS.comparator, 'Comparar productos')}
          {navItem('ncm', NAV_ICONS.ncm, 'Buscar NCM')}
          {navItem('simulator', NAV_ICONS.simulator, 'Simulador de precio')}
          {navItem('prices', NAV_ICONS.prices, 'Precios confirmados')}

          <div className="nav-section">Contenedor</div>
          {navItem('container', NAV_ICONS.container, 'Cargar contenedor')}
          {navItem('palletbuilder', NAV_ICONS.palletbuilder, 'Armador de pallets')}
        </nav>

        <div className="sidebar-footer">
          <div ref={profileDesktopRef} style={{ position: 'relative', marginTop: 12 }}>
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

      <div className="mobile-nav">
        <div className="mobile-nav-inner">
          {mobileNavButton('home', NAV_ICONS.home, 'Inicio')}
          {mobileNavButton('calc', NAV_ICONS.calc, 'Calc')}
          {mobileNavButton('prices', NAV_ICONS.prices, 'Precios')}
          {mobileNavButton('container', NAV_ICONS.container, 'Cont')}
          {mobileNavButton('palletbuilder', NAV_ICONS.palletbuilder, 'Pallet')}
        </div>
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
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fieldInputStyle = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 12,
    background: 'var(--bg-3)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    boxSizing: 'border-box',
  };

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

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      showToast('La contrasena nueva debe tener al menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== newPassword2) {
      showToast('Las contrasenas no coinciden', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await _sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setNewPassword2('');
      setShowPasswords(false);
      showToast('Contrasena actualizada', 'success');
    } catch (e) {
      showToast(`Error al cambiar contrasena: ${e.message || e}`, 'error');
    } finally {
      setChangingPassword(false);
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
          style={fieldInputStyle}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Telefono</label>
        <input
          type="tel"
          value={phone}
          placeholder="+54 11 1234-5678"
          onChange={e => setPhone(e.target.value)}
          style={fieldInputStyle}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', padding: '8px 0', marginBottom: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'var(--font)' }}
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>

      <div style={{ marginBottom: 10, padding: '10px 10px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Cambiar contrasena
          </span>
          <button
            type="button"
            onClick={() => setShowPasswords(current => !current)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            {showPasswords ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            placeholder="Nueva contrasena"
            onChange={e => setNewPassword(e.target.value)}
            style={fieldInputStyle}
          />
          <input
            type={showPasswords ? 'text' : 'password'}
            value={newPassword2}
            placeholder="Confirmar contrasena"
            onChange={e => setNewPassword2(e.target.value)}
            style={fieldInputStyle}
          />
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={changingPassword}
            style={{ width: '100%', padding: '7px 0', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: changingPassword ? 'default' : 'pointer', opacity: changingPassword ? 0.6 : 1, fontFamily: 'var(--font)' }}
          >
            {changingPassword ? 'Guardando...' : 'Actualizar contrasena'}
          </button>
        </div>
      </div>

      <button
        onClick={handleResetPassword}
        disabled={resetting}
        style={{ width: '100%', padding: '7px 0', marginBottom: 6, background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1, fontFamily: 'var(--font)' }}
      >
        {resetting ? 'Enviando...' : 'Mandar email de recuperacion'}
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
