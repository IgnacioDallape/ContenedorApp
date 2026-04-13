import { useState } from 'react';
import { _sb } from '../../lib/supabase.js';

export default function LoginPage({ initialMode = 'login' }) {
  const [panel, setPanel] = useState(initialMode === 'recovery' ? 'reset' : 'login');
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass,  setLoginPass]  = useState('');
  const [loginError, setLoginError] = useState('');

  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotError,   setForgotError]   = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const [resetPass,    setResetPass]    = useState('');
  const [resetPass2,   setResetPass2]   = useState('');
  const [resetError,   setResetError]   = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const [shake, setShake] = useState(false);

  function doShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  async function doLogin() {
  if (!loginEmail || !loginPass) { setLoginError('Completá el e-mail y la contraseña.'); return; }
    setLoading(true); setLoginError('');
    try {
      const { error } = await _sb.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error) {
        const msg = error.message.includes('Invalid login') ? 'E-mail o contraseña incorrectos.' : 'Error al ingresar — verificá tu conexión.';
        setLoginError(msg); setLoginPass(''); doShake();
      }
    } catch { setLoginError('Sin conexión — verificá tu internet.'); doShake(); }
    finally { setLoading(false); }
  }

  async function doForgot() {
    if (!forgotEmail) { alert('Ingresá tu e-mail.'); return; }
    setLoading(true); setForgotError(''); setForgotSuccess('');
    try {
      const { error } = await _sb.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: 'https://ignaciodallape.github.io/ContenedorApp/'
      });
      if (error) { setForgotError('Error: ' + error.message); }
      else {
        setForgotSuccess('✓ Link enviado a ' + forgotEmail + '. Revisá tu bandeja.');
        setForgotEmail('');
        setTimeout(() => setPanel('login'), 3000);
      }
    } catch { setForgotError('Sin conexión — verificá tu internet.'); }
    finally { setLoading(false); }
  }

  async function doReset() {
    if (resetPass.length < 6) { setResetError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (resetPass !== resetPass2) { setResetError('Las contraseñas no coinciden.'); return; }
    setLoading(true); setResetError(''); setResetSuccess('');
    try {
      const { error } = await _sb.auth.updateUser({ password: resetPass });
      if (error) { setResetError(error.message); }
      else {
        setResetSuccess('✓ Contraseña guardada. Ingresando…');
        window.location.hash = '';
        setTimeout(() => setPanel('login'), 2000);
      }
    } catch { setResetError('Sin conexión — verificá tu internet.'); }
    finally { setLoading(false); }
  }

  return (
    <div id="loginPage">
      <div className="login-container">
        <div className="login-panel">
          <div className="login-brand">
            <div className="login-icon">🚢</div>
            <h1>Container Loader</h1>
            <p>Sistema de gestión de carga</p>
          </div>
          <div className="login-tagline">
            Optimizá la distribución de tu mercadería en contenedores de 20', 40' y 40' HC con visualización 3D en tiempo real.
          </div>
        </div>

        <div className={`login-form-panel${shake ? ' login-shake' : ''}`}>

          {panel === 'login' && (
            <div className="auth-panel active">
              <div className="login-form-title">Bienvenido</div>
              <div className="login-form-sub">Ingresá tus credenciales</div>
              <div className="login-field">
                <label>E-mail</label>
                <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="correo@ejemplo.com" autoComplete="email"
                  onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </div>
              <div className="login-field">
                <label>Contraseña</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doLogin}>
                {loading ? 'Cargando…' : 'Ingresar →'}
              </button>
              {loginError && <div className="login-error visible">{loginError}</div>}
              <button className="login-link" onClick={() => { setPanel('forgot'); setLoginError(''); }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {panel === 'forgot' && (
            <div className="auth-panel active">
              <div className="login-form-title">Recuperar acceso</div>
              <div className="login-form-sub">Te enviamos un link por mail</div>
              <div className="login-field">
                <label>E-mail</label>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  onKeyDown={e => e.key === 'Enter' && doForgot()} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doForgot}>
                {loading ? 'Cargando…' : 'Enviar link →'}
              </button>
              {forgotError   && <div className="login-error visible">{forgotError}</div>}
              {forgotSuccess && <div className="login-success visible">{forgotSuccess}</div>}
              <button className="login-link" onClick={() => setPanel('login')}>← Volver al login</button>
            </div>
          )}

          {panel === 'reset' && (
            <div className="auth-panel active">
              <div className="login-form-title">Crear contraseña</div>
              <div className="login-form-sub">Elegí una contraseña segura</div>
              <div className="login-field">
                <label>Nueva contraseña</label>
                <input type="password" value={resetPass} onChange={e => setResetPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  onKeyDown={e => e.key === 'Enter' && doReset()} />
              </div>
              <div className="login-field">
                <label>Repetir contraseña</label>
                <input type="password" value={resetPass2} onChange={e => setResetPass2(e.target.value)}
                  placeholder="Repetí la contraseña"
                  onKeyDown={e => e.key === 'Enter' && doReset()} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doReset}>
                {loading ? 'Cargando…' : 'Guardar contraseña →'}
              </button>
              {resetError   && <div className="login-error visible">{resetError}</div>}
              {resetSuccess && <div className="login-success visible">{resetSuccess}</div>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
