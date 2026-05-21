import { Component } from 'react';

export default class ThreeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ThreeCanvas] Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 380, background: 'var(--surface)', borderRadius: 8,
          border: '1px solid var(--border)', gap: 12,
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center', maxWidth: 300 }}>
            No se pudo inicializar la vista 3D.<br />
            Verificá que tu navegador soporte WebGL.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '7px 18px', fontSize: 12, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", borderRadius: 6, border: '1px solid var(--c1)', background: 'transparent', color: 'var(--c1)', cursor: 'pointer' }}>
            Reintentar
          </button>
          {this.props.showDetails && this.state.error && (
            <details style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 320, wordBreak: 'break-all' }}>
              <summary style={{ cursor: 'pointer' }}>Detalles técnicos</summary>
              <pre style={{ marginTop: 4 }}>{this.state.error.message}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
