import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import useAuthStore from '../../stores/authStore.js';
import useAppStore from '../../stores/appStore.js';
import useImportaproStore from '../../stores/importaproStore.js';
import useContainerStore from '../../stores/containerStore.js';
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
const Catalog         = lazy(() => import('../Catalog/Catalog.jsx'));
const PalletBuilder   = lazy(() => import('../PalletBuilder/PalletBuilder.jsx'));

const Loader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
    Cargando...
  </div>
);

const IP_SECTIONS = ['calc','products','ncm','simulator','settings','prices','comparator'];
const CL_SECTIONS = ['container','catalog','palletbuilder'];

export default function AppShell() {
  const { user, userPlan, logout } = useAuthStore();
  const { activeSection, setActiveSection, showToast } = useAppStore();
  const { inputs, setInputs, apiKey, setApiKey } = useImportaproStore();
  const { catalog } = useContainerStore();
  const [upgradeModal, setUpgradeModal] = useUpgradeModal();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const label = user?.user_metadata?.username || user?.email?.split('@')[0] || '—';

  // Cerrar panel al clickear fuera
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
    const proSections    = ['container', 'catalog'];
    const promaxSections = ['palletbuilder'];
    if (proSections.includes(id) && !['pro', 'promax'].includes(userPlan)) {
      setUpgradeModal('Pro'); return;
    }
    if (promaxSections.includes(id) && userPlan !== 'promax') {
      setUpgradeModal('Pro Max'); return;
    }
    setActiveSection(id);
  }

  const navItem = (id, icon, label) => {
    const active = activeSection === id;
    const locked = ((['container','catalog'].includes(id) && !['pro','promax'].includes(userPlan))
                 || (id === 'palletbuilder' && userPlan !== 'promax'));
    return (
      <button
        key={id}
        className={`nav-item${active ? ' active' : ''}`}
        style={locked ? { opacity: 0.4 } : {}}
        onClick={() => navigate(id)}
      >
        <span className="nav-icon">{icon}</span>
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="app-shell" id="appShell" style={{ display:'flex' }}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🚢</div>
          <div>
            <div className="brand-name">ImportaPro</div>
            <div className="brand-sub">Importación + Contenedor</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Importación</div>
          {navItem('calc',      '⊞', 'Calculadora')}
          {navItem('products',   '◧', 'Mis productos')}
          {navItem('comparator','⇄', 'Comparar productos')}
          {navItem('ncm',       '🔍', 'Buscar NCM')}
          {navItem('simulator', '⊙', 'Simulador de precio')}
          {navItem('prices',    '🏷', 'Precios confirmados')}
          <div className="nav-section">Contenedor</div>
          {navItem('container',     '🚢',    'Cargar contenedor')}
          {navItem('palletbuilder', '🟫',    'Armador de pallets')}
        </nav>
        <div className="sidebar-footer">
          <div className="tc-label">Tipo de cambio</div>
          <div className="tc-row">
            <input
              type="number" id="global-tc" value={inputs.globalTC} min="1"
              onChange={e => setInputs({ globalTC: parseFloat(e.target.value) || 1359 })}
            />
            <span className="tc-badge">USD/ARS</span>
          </div>
          <div className="tc-row" style={{ marginTop: 6 }}>
            <input
              type="number" id="global-cny" value={inputs.cny} step="0.001" min="0.001"
              onChange={e => { const v = parseFloat(e.target.value) || 0.1466; setInputs({ cny: v, fob: inputs.currencyMode === 'cny' ? +((parseFloat(inputs.fobCny)||0)*v).toFixed(3) : inputs.fob }); }}
            />
            <span className="tc-badge">CNY/USD</span>
          </div>

          {/* ── User row ── */}
          <div ref={profileRef} style={{ position: 'relative', marginTop: 12 }}>
            {/* Profile panel */}
            {profileOpen && (
              <ProfilePanel
                user={user}
                label={label}
                onClose={() => setProfileOpen(false)}
                showToast={showToast}
              />
            )}
            <div
              onClick={() => setProfileOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: profileOpen ? 'var(--accent-dim, rgba(141,121,102,0.1))' : 'var(--bg-3)', border: `1px solid ${profileOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {label.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)', transition: 'transform 0.2s', transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▲</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        {activeSection === 'calc'          && <Calculator />}
        {activeSection === 'products'      && <Products />}
        {activeSection === 'comparator'    && <Comparator />}
        {activeSection === 'ncm'           && <NcmSearch />}
        {activeSection === 'simulator'     && <Simulator />}
        {activeSection === 'prices'        && <Prices />}
        {activeSection === 'settings'      && <Settings />}
        <Suspense fallback={<Loader />}>
          {activeSection === 'container'     && <ContainerLoader />}
          {activeSection === 'catalog'       && <Catalog />}
          {activeSection === 'palletbuilder' && <PalletBuilder />}
        </Suspense>
      </div>

      {upgradeModal && (
        <UpgradeModal planName={upgradeModal} onClose={() => setUpgradeModal(null)} />
      )}
    </div>
  );
}

function ProfilePanel({ user, label, onClose, showToast }) {
  const [displayName, setDisplayName] = useState(user?.user_metadata?.username || label);
  const [phone, setPhone]             = useState(user?.user_metadata?.phone || '');
  const [saving, setSaving]           = useState(false);
  const [resetting, setResetting]     = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await _sb.auth.updateUser({
        data: { username: displayName.trim(), phone: phone.trim() },
      });
      if (error) throw error;
      useAuthStore.getState().setUser({ ...user, user_metadata: { ...user.user_metadata, username: displayName.trim(), phone: phone.trim() } });
      showToast('Perfil actualizado', 'success');
      onClose();
    } catch (e) {
      showToast('Error al guardar: ' + (e.message || e), 'error');
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
      showToast('Email de cambio de contraseña enviado a ' + user.email, 'success');
      onClose();
    } catch (e) {
      showToast('Error: ' + (e.message || e), 'error');
    } finally {
      setResetting(false);
    }
  }

  async function handleLogout() {
    await useAuthStore.getState().logout();
  }

  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      padding: '16px', zIndex: 100,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Mi perfil</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>×</button>
      </div>

      {/* Email — solo lectura */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>Email</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
      </div>

      {/* Nombre */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nombre</label>
        <input
          type="text" value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
        />
      </div>

      {/* Teléfono */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Teléfono</label>
        <input
          type="tel" value={phone} placeholder="+54 11 1234-5678"
          onChange={e => setPhone(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
        />
      </div>

      {/* Botones */}
      <button
        onClick={handleSave} disabled={saving}
        style={{ width: '100%', padding: '8px 0', marginBottom: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'var(--font)' }}
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>

      <button
        onClick={handleResetPassword} disabled={resetting}
        style={{ width: '100%', padding: '7px 0', marginBottom: 6, background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 11, cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1, fontFamily: 'var(--font)' }}
      >
        {resetting ? 'Enviando...' : 'Cambiar contraseña →'}
      </button>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '7px 0', background: 'transparent', color: 'var(--red, #c0392b)', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function useUpgradeModal() {
  return useState(null);
}
