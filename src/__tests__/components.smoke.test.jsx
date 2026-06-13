/**
 * Smoke tests de render: cada componente (excepto los que usan WebGL/3D) debe
 * montar sin tirar. Captura crashes de import o de render (acceso a undefined,
 * claves i18n faltantes, etc.) en toda la app de un saque.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '../i18n/index.js';

import useAuthStore from '../stores/authStore.js';
import useImportaproStore from '../stores/importaproStore.js';

import BrandMark from '../components/Brand/BrandMark.jsx';
import ErrorBoundary from '../components/Layout/ErrorBoundary.jsx';
import PWAInstallPrompt from '../components/PWAInstallPrompt.jsx';
import PlanHub from '../components/Billing/PlanHub.jsx';
import Comparator from '../components/ImportaPro/Comparator.jsx';
import Simulator from '../components/ImportaPro/Simulator.jsx';
import NcmSearch from '../components/ImportaPro/NcmSearch.jsx';
import Products from '../components/ImportaPro/Products.jsx';
import Prices from '../components/ImportaPro/Prices.jsx';
import Settings from '../components/ImportaPro/Settings.jsx';
import Calculator from '../components/ImportaPro/Calculator.jsx';
import LoginPage from '../components/Auth/LoginPage.jsx';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} });
  }
  if (!global.ResizeObserver) {
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

beforeEach(() => {
  useAuthStore.setState({ user: { email: 'demo@demo.com', user_metadata: { username: 'Demo' } }, userPlan: 'promax', loading: false });
  useImportaproStore.setState({ savedProducts: [], publicationPlans: [], publicationOrderDraft: [] });
});

const cases = [
  ['BrandMark', <BrandMark size={24} />],
  ['ErrorBoundary', <ErrorBoundary resetKey="x"><div>ok</div></ErrorBoundary>],
  ['PWAInstallPrompt', <PWAInstallPrompt />],
  ['PlanHub', <PlanHub onCheckout={() => {}} />],
  ['Comparator', <Comparator />],
  ['Simulator', <Simulator />],
  ['NcmSearch', <NcmSearch />],
  ['Products', <Products />],
  ['Prices', <Prices />],
  ['Settings', <Settings onCheckout={() => {}} />],
  ['Calculator', <Calculator />],
  ['LoginPage', <LoginPage />],
];

describe('Smoke — los componentes montan sin tirar', () => {
  for (const [name, ui] of cases) {
    it(`${name} renderiza`, () => {
      const { container } = render(ui);
      expect(container).toBeTruthy();
    });
  }
});

describe('ErrorBoundary — captura un crash y muestra fallback', () => {
  it('un hijo que tira no rompe la app', () => {
    const Boom = () => { throw new Error('boom'); };
    const { container } = render(
      <ErrorBoundary resetKey="x"><Boom /></ErrorBoundary>
    );
    // El fallback se renderiza (no queda en blanco)
    expect(container.textContent.length).toBeGreaterThan(0);
  });
});
