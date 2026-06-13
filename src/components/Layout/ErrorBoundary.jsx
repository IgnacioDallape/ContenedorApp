import { Component } from 'react';
import { captureError } from '../../lib/telemetry.js';
import i18n from '../../i18n/index.js';

// ErrorBoundary global del shell: aísla errores de cualquier sección activa
// para que un crash en PalletBuilder/ContainerLoader/etc. nunca deje toda la
// app en pantalla en blanco. Muestra un fallback con opción de reintentar.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AppShell ErrorBoundary]', error, info);
    captureError(error, { boundary: 'AppShell', componentStack: info && info.componentStack });
  }

  componentDidUpdate(prevProps) {
    // Resetear el error si el usuario cambió de sección — así no quedan
    // pegados en la pantalla de error después de un crash.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, padding: 32, gap: 14, color: 'var(--text-2)',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          {i18n.t('errors.sectionTitle')}
        </div>
        <div style={{ fontSize: 13, maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
          {i18n.t('errors.sectionBody')}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 18px', fontSize: 12, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
          >
            {i18n.t('errors.retry')}
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 18px', fontSize: 12, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            {i18n.t('errors.reload')}
          </button>
        </div>
        {this.state.error && (
          <details style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)', maxWidth: 520, wordBreak: 'break-word' }} open>
            <summary style={{ cursor: 'pointer' }}>{i18n.t('errors.details')}</summary>
            <pre style={{ marginTop: 6, padding: 10, background: 'var(--bg-3)', borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 10 }}>
              {this.state.error.message || String(this.state.error)}
              {this.state.error.stack ? '\n\n' + this.state.error.stack.split('\n').slice(0, 6).join('\n') : ''}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
