import { useEffect, useState } from 'react';
import { _sb } from '../../lib/supabase.js';
import { getAppUrl } from '../../lib/appUrl.js';

export default function LoginPage({ initialMode = 'login', initialMessage = '' }) {
  const [panel, setPanel] = useState(initialMode === 'recovery' ? 'reset' : initialMode === 'forgot' ? 'forgot' : 'login');
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
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
      }
    } catch {
      setLoginError('Sin conexion - verifica tu internet.');
      doShake();
    } finally {
      setLoading(false);
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
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--muted)',
        fontSize: 14,
        padding: 0,
        lineHeight: 1,
      }}
      tabIndex={-1}
    >
      {show ? '[ocultar]' : '[ver]'}
    </button>
  );

  const GoogleButton = ({ label }) => (
    <button
      className="login-btn"
      disabled={loading}
      onClick={doGoogleAuth}
      style={{ marginTop: 10, background: '#fff', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {label}
    </button>
  );

  return (
    <div id="loginPage">
      <div className="login-container">
        <div className="login-panel">
          <div className="login-brand">
            <div className="login-icon">IP</div>
            <h1>ImportaPro</h1>
            <p>Sistema de gestion de carga</p>
          </div>
          <div className="login-tagline">
            Calcula costos de importacion, optimiza contenedores 3D y activa tu plan cuando quieras.
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
              <button className="login-btn" disabled={loading} onClick={doLogin}>
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
              <button className="login-btn" disabled={loading} onClick={doRegister}>
                {loading ? 'Creando cuenta...' : 'Registrarse ->'}
              </button>
              <GoogleButton label="Registrarme con Google" />
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
              <button className="login-btn" disabled={loading} onClick={doForgot}>
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
              <button className="login-btn" disabled={loading} onClick={doReset}>
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
