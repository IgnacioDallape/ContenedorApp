import { useEffect, useState, lazy, Suspense } from 'react';
import useAuthStore from '../../stores/authStore.js';
import useAppStore from '../../stores/appStore.js';
import useImportaproStore from '../../stores/importaproStore.js';
import useContainerStore from '../../stores/containerStore.js';

import Calculator from '../ImportaPro/Calculator.jsx';
import Products from '../ImportaPro/Products.jsx';
import NcmSearch from '../ImportaPro/NcmSearch.jsx';
import Simulator from '../ImportaPro/Simulator.jsx';
import Prices from '../ImportaPro/Prices.jsx';
import Settings from '../ImportaPro/Settings.jsx';
import UpgradeModal from './UpgradeModal.jsx';

const ContainerLoader = lazy(() => import('../ContainerLoader/ContainerLoader.jsx'));
const Catalog         = lazy(() => import('../Catalog/Catalog.jsx'));
const PalletBuilder   = lazy(() => import('../PalletBuilder/PalletBuilder.jsx'));

const Loader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
    Cargando...
  </div>
);

const IP_SECTIONS = ['calc','products','ncm','simulator','settings','prices'];
const CL_SECTIONS = ['container','catalog','palletbuilder'];

export default function AppShell() {
  const { user, userPlan, logout } = useAuthStore();
  const { activeSection, setActiveSection, showToast } = useAppStore();
  const { inputs, setInputs, apiKey, setApiKey } = useImportaproStore();
  const { catalog } = useContainerStore();
  const [upgradeModal, setUpgradeModal] = useUpgradeModal();

  const label = user?.user_metadata?.username || user?.email?.split('@')[0] || '—';

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
          {navItem('products',  '◧', 'Mis productos')}
          {navItem('simulator', '⊙', 'Simulador de precio')}
          {navItem('prices',    '🏷', 'Precios a publicar')}
          <div className="nav-section">Contenedor</div>
          {navItem('container',     '🚢',    'Cargar contenedor')}
          {navItem('palletbuilder', '🟫',    'Armador de pallets')}
        </nav>
        <div className="sidebar-footer">
          <div className="tc-label">Tipo de cambio</div>
          <div className="tc-row">
            <input
              type="number" id="global-tc" value={inputs.globalTC} min="1"
              onChange={e => setInputs({ globalTC: parseFloat(e.target.value) || 1450 })}
            />
            <span className="tc-badge">USD/ARS</span>
          </div>
          <div className="tc-row" style={{ marginTop: 6 }}>
            <input
              type="number" id="global-cny" value={inputs.cny} step="0.001" min="0.001"
              onChange={e => { const v = parseFloat(e.target.value) || 0.138; setInputs({ cny: v, fob: inputs.currencyMode === 'cny' ? +((parseFloat(inputs.fobCny)||0)*v).toFixed(3) : inputs.fob }); }}
            />
            <span className="tc-badge">CNY/USD</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {label.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{label}</span>
            </div>
            <button onClick={logout} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = 'var(--red)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-3)'}
            >Salir</button>
          </div>
        </div>
      </aside>

      <div className="main">
        {activeSection === 'calc'          && <Calculator />}
        {activeSection === 'products'      && <Products />}
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

function useUpgradeModal() {
  return useState(null);
}
