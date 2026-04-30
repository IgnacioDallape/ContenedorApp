import { useEffect, useState } from 'react';
import { _sb } from '../../lib/supabase.js';
import { getAppUrl } from '../../lib/appUrl.js';
import BrandMark from '../Brand/BrandMark.jsx';

export default function LoginPage({ initialMode = 'login', initialMessage = '' }) {
  const [panel, setPanel] = useState(initialMode === 'recovery' ? 'reset' : initialMode === 'forgot' ? 'forgot' : 'login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState(initialMode === 'forgot' ? initialMessage : '');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const [resetPass, setResetPass] = useState('');
  const [resetPass2, setResetPass2] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);

  useEffect(() => {
    if (initialMode === 'recovery') {
      setPanel('reset');
      setForgotError('');
      return;
    }
    if (initialMode === 'forgot') {
      setPanel('forgot');
      setForgotError(initialMessage || '');
    }
  }, [initialMode, initialMessage]);

  function doShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function goTo(nextPanel) {
    setLoginError('');
    setRegError('');
    setRegSuccess('');
    setForgotError('');
    setForgotSuccess('');
    setPanel(nextPanel);
  }

  async function doGoogleAuth() {
    if (googleLoading) return;

    setGoogleLoading(true);
    setLoginError('');
    setRegError('');

    try {
      const { error } = await _sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAppUrl(),
        },
      });

      if (error) {
        setLoginError('No se pudo iniciar con Google. Verifica la configuracion en Supabase.');
        doShake();
        setGoogleLoading(false);
      }
    } catch {
      setLoginError('Sin conexion - verifica tu internet.');
      doShake();
      setGoogleLoading(false);
    }
  }

  async function doLogin() {
    if (!loginEmail || !loginPass) {
      setLoginError('Completa el e-mail y la contrasena.');
      return;
    }

    setLoading(true);
    setLoginError('');
    try {
      const { error } = await _sb.auth.signInWithPassword({ email: loginEmail, password: loginPass });
      if (error) {
        const msg = error.message.includes('Invalid login')
          ? 'E-mail o contrasena incorrectos.'
          : 'Error al ingresar. Verifica tu conexion.';
        setLoginError(msg);
        setLoginPass('');
        doShake();
      }
    } catch {
      setLoginError('Sin conexion. Verifica tu internet.');
      doShake();
    } finally {
      setLoading(false);
    }
  }

  async function doRegister() {
    setRegError('');

    if (!regUsername.trim()) {
      setRegError('Elegi un nombre de usuario.');
      return;
    }
    if (regUsername.trim().length < 3) {
      setRegError('El usuario debe tener al menos 3 caracteres.');
      return;
    }
    if (!regEmail) {
      setRegError('Ingresa tu e-mail.');
      return;
    }
    if (regPass.length < 6) {
      setRegError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (regPass !== regPass2) {
      setRegError('Las contrasenas no coinciden.');
      doShake();
      return;
    }

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
          ? 'Ese e-mail ya tiene una cuenta. Podes ingresar directamente.'
          : error.message;
        setRegError(msg);
        doShake();
      } else {
        setRegSuccess('Cuenta creada. Revisa tu e-mail para confirmar el registro.');
        setRegUsername('');
        setRegEmail('');
        setRegPass('');
        setRegPass2('');
        setTimeout(() => goTo('login'), 3500);
      }
    } catch {
      setRegError('Sin conexion. Verifica tu internet.');
      doShake();
    } finally {
      setLoading(false);
    }
  }

  async function doForgot() {
    if (!forgotEmail) {
      setForgotError('Ingresa tu e-mail.');
      return;
    }

    setLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const { error } = await _sb.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: getAppUrl(),
      });
      if (error) {
        setForgotError(`Error: ${error.message}`);
      } else {
        setForgotSuccess(`Link enviado a ${forgotEmail}. Revisa tu bandeja.`);
        setForgotEmail('');
        setTimeout(() => goTo('login'), 3000);
      }
    } catch {
      setForgotError('Sin conexion. Verifica tu internet.');
    } finally {
      setLoading(false);
    }
  }

  async function doReset() {
    if (resetPass.length < 6) {
      setResetError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (resetPass !== resetPass2) {
      setResetError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    setResetError('');
    setResetSuccess('');
    try {
      const { error } = await _sb.auth.updateUser({ password: resetPass });
      if (error) {
        setResetError(error.message);
      } else {
        setResetSuccess('Contrasena guardada. Ingresando...');
        window.location.hash = '';
        setTimeout(() => goTo('login'), 1800);
      }
    } catch {
      setResetError('Sin conexion. Verifica tu internet.');
    } finally {
      setLoading(false);
    }
  }

  const EyeIcon = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Ocultar contrasena' : 'Mostrar contrasena'}
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--muted)',
        width: 26,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
      }}
      tabIndex={-1}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12C4.9 7.4 8.1 5 12 5C15.9 5 19.1 7.4 22 12C19.1 16.6 15.9 19 12 19C8.1 19 4.9 16.6 2 12Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        {show && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      </svg>
    </button>
  );

  const GoogleButton = ({ label }) => (
    <button
      type="button"
      className="login-btn"
      disabled={loading || googleLoading}
      onClick={doGoogleAuth}
      style={{
        marginTop: 10,
        background: '#fff',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 3l3 2.3c1.8-1.7 2.8-4.1 2.8-6.9 0-.7-.1-1.5-.2-2.2H12Z" />
        <path fill="#34A853" d="M12 21c2.6 0 4.8-.8 6.4-2.3l-3-2.3c-.8.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4l-3.1 2.4C5.3 18.8 8.4 21 12 21Z" />
        <path fill="#4A90E2" d="M6.6 13.3c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8l-3.1-2.4C2.9 8.6 2.5 10 2.5 11.5s.4 2.9 1 4.2l3.1-2.4Z" />
        <path fill="#FBBC05" d="M12 5.7c1.4 0 2.7.5 3.7 1.5l2.7-2.7C16.8 2.9 14.6 2 12 2 8.4 2 5.3 4.2 3.5 7.3l3.1 2.4c.8-2.3 2.9-4 5.4-4Z" />
      </svg>
      {googleLoading ? 'Abriendo Google...' : label}
    </button>
  );

  return (
    <div id="loginPage">
      <div className="login-container">
        <div className="login-panel">
          <div className="login-brand">
            <div
              className="login-icon"
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BrandMark size={58} />
            </div>
            <h1>ImportaPro</h1>
            <p>Sistema de gestion de carga</p>
          </div>
          <div className="login-tagline">
            Calcula costos de importacion, optimiza contenedores 3D y arma pallets con el motor BFD de precision.
          </div>
        </div>

        <div className={`login-form-panel${shake ? ' login-shake' : ''}`}>
          {panel === 'login' && (
            <div className="auth-panel active">
              <div className="login-form-title">Bienvenido</div>
              <div className="login-form-sub">Ingresa tus credenciales</div>
              <div className="login-field">
                <label>E-mail</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  onKeyDown={e => e.key === 'Enter' && doLogin()}
                />
              </div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Contrasena</label>
                <input
                  type={showLoginPass ? 'text' : 'password'}
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  autoComplete="current-password"
                  onKeyDown={e => e.key === 'Enter' && doLogin()}
                  style={{ paddingRight: 72 }}
                />
                <EyeIcon show={showLoginPass} onToggle={() => setShowLoginPass(v => !v)} />
              </div>
              <button className="login-btn" disabled={loading || googleLoading} onClick={doLogin}>
                {loading ? 'Cargando...' : 'Ingresar ->'}
              </button>
              <GoogleButton label="Continuar con Google" />
              {loginError && <div className="login-error visible">{loginError}</div>}
              <div className="login-links-row" style={{ marginTop: 18 }}>
                <button className="login-link" style={{ margin: 0 }} onClick={() => goTo('forgot')}>
                  Olvide mi contrasena
                </button>
                <button className="login-link" style={{ margin: 0 }} onClick={() => goTo('register')}>
                  Crear cuenta
                </button>
              </div>
            </div>
          )}

          {panel === 'register' && (
            <div className="auth-panel active">
              <div className="login-form-title">Crear cuenta</div>
              <div className="login-form-sub">Registrate gratis</div>
              <div className="login-field">
                <label>Nombre de usuario</label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  placeholder="Ej: juan123"
                  autoComplete="username"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                />
              </div>
              <div className="login-field">
                <label>E-mail</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                />
              </div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Contrasena</label>
                <input
                  type={showRegPass ? 'text' : 'password'}
                  value={regPass}
                  onChange={e => setRegPass(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                  style={{ paddingRight: 72 }}
                />
                <EyeIcon show={showRegPass} onToggle={() => setShowRegPass(v => !v)} />
              </div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Repetir contrasena</label>
                <input
                  type={showRegPass ? 'text' : 'password'}
                  value={regPass2}
                  onChange={e => setRegPass2(e.target.value)}
                  placeholder="Repeti la contrasena"
                  autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && doRegister()}
                  style={{ paddingRight: 72 }}
                />
              </div>
              <button className="login-btn" disabled={loading || googleLoading} onClick={doRegister}>
                {loading ? 'Creando cuenta...' : 'Registrarse ->'}
              </button>
              <GoogleButton label="Continuar con Google" />
              {regError && <div className="login-error visible">{regError}</div>}
              {regSuccess && <div className="login-success visible">{regSuccess}</div>}
              <button className="login-link" onClick={() => goTo('login')}>
                Volver al login
              </button>
            </div>
          )}

          {panel === 'forgot' && (
            <div className="auth-panel active">
              <div className="login-form-title">Recuperar acceso</div>
              <div className="login-form-sub">Te enviamos un link por mail</div>
              <div className="login-field">
                <label>E-mail</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  onKeyDown={e => e.key === 'Enter' && doForgot()}
                />
              </div>
              <button className="login-btn" disabled={loading || googleLoading} onClick={doForgot}>
                {loading ? 'Cargando...' : 'Enviar link ->'}
              </button>
              {forgotError && <div className="login-error visible">{forgotError}</div>}
              {forgotSuccess && <div className="login-success visible">{forgotSuccess}</div>}
              <button className="login-link" onClick={() => goTo('login')}>
                Volver al login
              </button>
            </div>
          )}

          {panel === 'reset' && (
            <div className="auth-panel active">
              <div className="login-form-title">Crear contrasena</div>
              <div className="login-form-sub">Elegi una contrasena segura</div>
              <div className="login-field" style={{ position: 'relative' }}>
                <label>Nueva contrasena</label>
                <input
                  type={showResetPass ? 'text' : 'password'}
                  value={resetPass}
                  onChange={e => setResetPass(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  onKeyDown={e => e.key === 'Enter' && doReset()}
                  style={{ paddingRight: 72 }}
                />
                <EyeIcon show={showResetPass} onToggle={() => setShowResetPass(v => !v)} />
              </div>
              <div className="login-field">
                <label>Repetir contrasena</label>
                <input
                  type={showResetPass ? 'text' : 'password'}
                  value={resetPass2}
                  onChange={e => setResetPass2(e.target.value)}
                  placeholder="Repeti la contrasena"
                  onKeyDown={e => e.key === 'Enter' && doReset()}
                />
              </div>
              <button className="login-btn" disabled={loading || googleLoading} onClick={doReset}>
                {loading ? 'Guardando...' : 'Guardar contrasena ->'}
              </button>
              {resetError && <div className="login-error visible">{resetError}</div>}
              {resetSuccess && <div className="login-success visible">{resetSuccess}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
