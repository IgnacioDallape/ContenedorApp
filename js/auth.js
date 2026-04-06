const { createClient } = supabase;
const _sb = createClient(
  'https://yxfpkxvrzypueusyueuh.supabase.co',
  'sb_publishable_4Fn3E1cA-quyFvsMHnMfVw_xzrRSbSp'
);

let currentUser = null;
window.currentUser = null;

// Detect invite/recovery redirect from email link
(async function checkAuthRedirect() {
  const hash = window.location.hash;
  if (hash.includes('type=recovery') || hash.includes('type=invite')) {
    switchPanel('panelReset');
    showLoginPage();
  } else {
    const { data: { session } } = await _sb.auth.getSession();
    if (session) enterApp(session.user);
    else showLoginPage();
  }
})();

_sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) enterApp(session.user);
  if (event === 'SIGNED_OUT') showLoginPage();
  if (event === 'PASSWORD_RECOVERY') { switchPanel('panelReset'); showLoginPage(); }
});

function enterApp(user) {
  currentUser = user;
  window.currentUser = user;
  const label = user.user_metadata?.username || user.email.split('@')[0];
  const el = document.getElementById('headerUserName');
  if (el) el.textContent = label;
  const lp = document.getElementById('loginPage');
  lp.classList.add('hidden');
  setTimeout(() => lp.style.display = 'none', 500);
}

function showLoginPage() {
  const shell = document.getElementById('appShell');
  if (shell) shell.style.display = 'none';
  const lp = document.getElementById('loginPage');
  lp.style.display = 'flex';
  void lp.offsetWidth;
  lp.classList.remove('hidden');
}

function switchPanel(id) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  ['loginError','forgotError','forgotSuccess','resetError','resetSuccess']
    .forEach(i => { const el=document.getElementById(i); if(el){ el.classList.remove('visible'); el.textContent=''; }});
}

function showErr(id, msg) { const e=document.getElementById(id); if(e){e.textContent=msg; e.classList.add('visible');} }
function showOk(id, msg)  { const e=document.getElementById(id); if(e){e.textContent=msg; e.classList.add('visible');} }
function setLoading(id, on, label) { const b=document.getElementById(id); if(!b)return; b.disabled=on; b.textContent=on?'Cargando…':label; }
function shakePanel() { const fc=document.querySelector('.login-form-panel'); fc.classList.remove('login-shake'); void fc.offsetWidth; fc.classList.add('login-shake'); }

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) return showErr('loginError', 'Completá el e-mail y la contraseña.');
  setLoading('loginBtn', true, 'Ingresar →');
  const { error } = await _sb.auth.signInWithPassword({ email, password: pass });
  setLoading('loginBtn', false, 'Ingresar →');
  if (error) {
    const msg = error.message.includes('Invalid login') ? 'E-mail o contraseña incorrectos.' : error.message;
    showErr('loginError', msg); shakePanel();
    document.getElementById('loginPass').value = '';
  }
}

async function doLogout() {
  await _sb.auth.signOut();
  currentUser = null;
  window.currentUser = null;
  switchPanel('panelLogin');
  showLoginPage();
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) { alert('Ingresá tu e-mail.'); return; }
  setLoading('forgotBtn', true, 'Enviar link →');
  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://ignaciodallape.github.io/ContenedorApp/'
  });
  setLoading('forgotBtn', false, 'Enviar link →');
  if (error) { alert('Error: ' + error.message); return; }
  alert('✓ Link enviado a ' + email + '. Revisá tu bandeja.');
  document.getElementById('forgotEmail').value = '';
  switchPanel("panelLogin");
}

async function doReset() {
  const pass  = document.getElementById('resetPass').value;
  const pass2 = document.getElementById('resetPass2').value;
  if (pass.length < 6) return showErr('resetError', 'La contraseña debe tener al menos 6 caracteres.');
  if (pass !== pass2)  return showErr('resetError', 'Las contraseñas no coinciden.');
  setLoading('resetBtn', true, 'Guardar contraseña →');
  const { error } = await _sb.auth.updateUser({ password: pass });
  setLoading('resetBtn', false, 'Guardar contraseña →');
  if (error) { showErr('resetError', error.message); return; }
  showOk('resetSuccess', '✓ Contraseña guardada. Ingresando…');
  window.location.hash = '';
  setTimeout(() => switchPanel('panelLogin'), 2000);
}

