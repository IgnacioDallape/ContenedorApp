import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useImportaproStore from '../../stores/importaproStore.js';
import useAppStore from '../../stores/appStore.js';
import PlanHub from '../Billing/PlanHub.jsx';
import LanguageSwitcher from '../LanguageSwitcher.jsx';

export default function Settings({ onCheckout }) {
  const { t, i18n } = useTranslation();
  const { inputs, updateGlobalTC, tcUpdatedAt } = useImportaproStore();
  const { setActiveSection } = useAppStore();
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  async function handleFetchTC() {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch('https://api.bluelytics.com.ar/v2/latest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const value = Math.round(data.blue.value_avg);
      updateGlobalTC(value);
    } catch (e) {
      setFetchError(e.message || t('settings.fetchError'));
    } finally {
      setFetching(false);
    }
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="ip-section active" id="section-settings">
      <section className="tab" style={{ display: 'block' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="page-header" style={{ width: '100%', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{t('settings.title')}</h1>
              <button
                onClick={() => setActiveSection('calc')}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {t('settings.backToCalc')}
              </button>
            </div>
            <p className="page-sub">{t('settings.subtitle')}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
            <button className="btn-outline" onClick={() => scrollToSection('settings-tc')}>
              {t('settings.exchangeRate')}
            </button>
            <button className="btn-outline" onClick={() => scrollToSection('settings-plan')}>
              {t('settings.myPlan')}
            </button>
            <LanguageSwitcher />
          </div>

          <div id="settings-tc" className="card" style={{ marginBottom: '1.75rem', maxWidth: 520, width: '100%' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ textAlign: 'center' }}>USD / ARS</label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  value={inputs.globalTC}
                  min="1"
                  style={{ flex: '0 1 210px', minWidth: 180 }}
                  onChange={e => updateGlobalTC(parseFloat(e.target.value) || 1450)}
                />
                <span className="tc-badge">USD/ARS</span>
                <button
                  onClick={handleFetchTC}
                  disabled={fetching}
                  style={{ padding: '0 12px', height: 38, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', cursor: fetching ? 'not-allowed' : 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, opacity: fetching ? 0.6 : 1, whiteSpace: 'nowrap' }}
                >
                  {fetching ? '...' : t('settings.updateBlue')}
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, textAlign: 'center' }}>
                {tcUpdatedAt
                  ? <span style={{ color: 'var(--green)' }}>{t('settings.updatedAt', { date: new Date(tcUpdatedAt).toLocaleString(i18n.language) })}</span>
                  : <span style={{ color: 'var(--amber, #e6a817)' }}>{t('settings.notUpdated')}</span>}
                {fetchError && <span style={{ color: 'var(--red)', marginLeft: 10 }}>{fetchError}</span>}
              </div>
            </div>
          </div>

          <div id="settings-plan" style={{ width: '100%' }}>
            <PlanHub onCheckout={onCheckout} />
          </div>
        </div>
      </section>
    </div>
  );
}
