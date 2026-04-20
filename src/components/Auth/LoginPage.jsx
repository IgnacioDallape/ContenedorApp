import { useState } from 'react';
import { _sb } from '../../lib/supabase.js';
import { getAppUrl } from '../../lib/appUrl.js';

export default function LoginPage({ initialMode = 'login', initialMessage = '' }) {
  const [panel, setPanel] = useState(initialMode === 'recovery' ? 'reset' : initialMode === 'forgot' ? 'forgot' : 'login');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass,  setLoginPass]  = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Registro
  const [regUsername, setRegUsername] = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPass,     setRegPass]     = useState('');
  const [regPass2,    setRegPass2]    = useState('');
  const [regError,    setRegError]    = useState('');
  const [regSuccess,  setRegSuccess]  = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  // Forgot
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotError,   setForgotError]   = useState(initialMode === 'forgot' ? initialMessage : '');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Reset
  const [resetPass,    setResetPass]    = useState('');
  const [resetPass2,   setResetPass2]   = useState('');
  const [resetError,   setResetError]   = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);

  function doShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function goTo(p) {
    setLoginError(''); setRegError(''); setRegSuccess('');
    setForgotError(''); setForgotSuccess('');
    setPanel(p);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function doLogin() {
    if (!loginEmail || !loginPass) {
      setLoginError('Completá el e-mail y la contraseña.'); return;
    }
    setLoading(true); setLoginError('');
    try {
      const { error } = await _sb.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error) {
        const msg = error.message.includes('Invalid login')
          ? 'E-mail o contraseña incorrectos.'
          : 'Error al ingresar — verificá tu conexión.';
        setLoginError(msg); setLoginPass(''); doShake();
      }
    } catch { setLoginError('Sin conexión — verificá tu internet.'); doShake(); }
    finally { setLoading(false); }
  }

  // ── Registro ───────────────────────────────────────────────────────────────
  async function doRegister() {
    setRegError('');
    if (!regUsername.trim()) { setRegError('Elegí un nombre de usuario.'); return; }
    if (regUsername.trim().length < 3) { setRegError('El usuario debe tener al menos 3 caracteres.'); return; }
    if (!regEmail) { setRegError('Ingresá tu e-mail.'); return; }
    if (regPass.length < 6) { setRegError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (regPass !== regPass2) { setRegError('Las contraseñas no coinciden.'); doShake(); return; }

    setLoading(true);
    try {
      const { error } = await _sb.auth.signUp({
        email: regEmail,
        password: regPass,
        options: {
          data: { username: regUsername.trim() },
          emailRedirectTo: getAppUrl(),
        },
      });
      if (error) {
        const msg = error.message.includes('already registered')
          ? 'Ese e-mail ya tiene una cuenta. ¿Querés ingresar?'
          : error.message;
        setRegError(msg); doShake();
      } else {
        setRegSuccess('✓ Cuenta creada. Revisá tu e-mail para confirmar el registro.');
        setRegUsername(''); setRegEmail(''); setRegPass(''); setRegPass2('');
        setTimeout(() => goTo('login'), 4000);
      }
    } catch { setRegError('Sin conexión — verificá tu internet.'); doShake(); }
    finally { setLoading(false); }
  }

  // ── Forgot ─────────────────────────────────────────────────────────────────
  async function doForgot() {
    if (!forgotEmail) { setForgotError('Ingresá tu e-mail.'); return; }
    setLoading(true); setForgotError(''); setForgotSuccess('');
    try {
      const { error } = await _sb.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: getAppUrl(),
      });
      if (error) { setForgotError('Error: ' + error.message); }
      else {
        setForgotSuccess('✓ Link enviado a ' + forgotEmail + '. Revisá tu bandeja.');
        setForgotEmail('');
        setTimeout(() => goTo('login'), 3000);
      }
    } catch { setForgotError('Sin conexión — verificá tu internet.'); }
    finally { setLoading(false); }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
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
        setTimeout(() => goTo('login'), 2000);
      }
    } catch { setResetError('Sin conexión — verificá tu internet.'); }
    finally { setLoading(false); }
  }

  const EyeIcon = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1,
      }}
      tabIndex={-1}
    >
      {show ? '🙈' : '👁'}
    </button>
  );

  return (
    <div id="loginPage">
      <div className="login-container">
        <div className="login-panel">
          <div className="login-brand">
            <div className="login-icon">🚢</div>
            <h1>ImportaPro</h1>
            <p>Sistema de gestión de carga</p>
          </div>
          <div className="login-tagline">
            Calculá costos de importación, optimizá contenedores 3D y armá pallets con el motor BFD de precisión.
          </div>
        </div>

        <div className={`login-form-panel${shake ? ' login-shake' : ''}`}>

          {/* ── LOGIN ── */}
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
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Contraseña</label>
                <input type={showLoginPass ? 'text' : 'password'} value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => e.key === 'Enter' && doLogin()}
                  style={{ paddingRight: 36 }} />
                <EyeIcon show={showLoginPass} onToggle={() => setShowLoginPass(v => !v)} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doLogin}>
                {loading ? 'Cargando…' : 'Ingresar →'}
              </button>
              {loginError && <div className="login-error visible">{loginError}</div>}
              <div className="login-links-row" style={{ marginTop: 18 }}>
                <button className="login-link" style={{ margin: 0 }}
                  onClick={() => goTo('forgot')}>
                  ¿Olvidaste tu contraseña?
                </button>
                <button className="login-link" style={{ margin: 0 }}
                  onClick={() => goTo('register')}>
                  Crear cuenta
                </button>
              </div>
            </div>
          )}

          {/* ── REGISTRO ── */}
          {panel === 'register' && (
            <div className="auth-panel active">
              <div className="login-form-title">Crear cuenta</div>
              <div className="login-form-sub">Registrate gratis</div>
              <div className="login-field">
                <label>Nombre de usuario</label>
                <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)}
                  placeholder="Ej: juan123" autoComplete="username"
                  onKeyDown={e => e.key === 'Enter' && doRegister()} />
              </div>
              <div className="login-field">
                <label>E-mail</label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                  placeholder="correo@ejemplo.com" autoComplete="email"
                  onKeyDown={e => e.key === 'Enter' && doRegister()} />
              </div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Contraseña</label>
                <input type={showRegPass ? 'text' : 'password'} value={regPass}
                  onChange={e => setRegPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                  style={{ paddingRight: 36 }} />
                <EyeIcon show={showRegPass} onToggle={() => setShowRegPass(v => !v)} />
              </div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Repetir contraseña</label>
                <input type={showRegPass ? 'text' : 'password'} value={regPass2}
                  onChange={e => setRegPass2(e.target.value)}
                  placeholder="Repetí la contraseña" autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                  style={{ paddingRight: 36 }} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doRegister}>
                {loading ? 'Creando cuenta…' : 'Registrarse →'}
              </button>
              {regError   && <div className="login-error visible">{regError}</div>}
              {regSuccess && <div className="login-success visible">{regSuccess}</div>}
              <button className="login-link" onClick={() => goTo('login')}>
                ← Ya tengo cuenta
              </button>
            </div>
          )}

          {/* ── FORGOT ── */}
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
              <button className="login-link" onClick={() => goTo('login')}>← Volver al login</button>
            </div>
          )}

          {/* ── RESET ── */}
          {panel === 'reset' && (
            <div className="auth-panel active">
              <div className="login-form-title">Crear contraseña</div>
              <div className="login-form-sub">Elegí una contraseña segura</div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Nueva contraseña</label>
                <input type={showResetPass ? 'text' : 'password'} value={resetPass}
                  onChange={e => setResetPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  onKeyDown={e => e.key === 'Enter' && doReset()}
                  style={{ paddingRight: 36 }} />
                <EyeIcon show={showResetPass} onToggle={() => setShowResetPass(v => !v)} />
              </div>
              <div className="login-field">
                <label>Repetir contraseña</label>
                <input type={showResetPass ? 'text' : 'password'} value={resetPass2}
                  onChange={e => setResetPass2(e.target.value)}
                  placeholder="Repetí la contraseña"
                  onKeyDown={e => e.key === 'Enter' && doReset()} />
              </div>
              <button className="login-btn" disabled={loading} onClick={doReset}>
                {loading ? 'Guardando…' : 'Guardar contraseña →'}
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
