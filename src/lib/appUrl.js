export function getAppBasePath() {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname || '/';
  if (path.startsWith('/ContenedorApp/')) return '/ContenedorApp/';
  if (path === '/ContenedorApp') return '/ContenedorApp/';
  return '/';
}

export function getAppUrl() {
  if (typeof window === 'undefined') return 'https://ignaciodallape.github.io/ContenedorApp/';
  return `${window.location.origin}${getAppBasePath()}`;
}

export function parseAuthHash() {
  if (typeof window === 'undefined') return { mode: 'login', message: '' };
  const hash = window.location.hash || '';
  if (!hash) return { mode: 'login', message: '' };

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const error = params.get('error');
  const errorCode = params.get('error_code');
  const description = params.get('error_description');
  const type = params.get('type');

  if (type === 'recovery' || type === 'invite') {
    return { mode: 'recovery', message: '' };
  }

  if (error || errorCode || description) {
    let message = 'El link no es válido o ya expiró. Pedí uno nuevo para continuar.';
    if (errorCode === 'otp_expired') {
      message = 'El link de recuperación expiró o ya fue usado. Pedí uno nuevo.';
    } else if (description) {
      message = decodeURIComponent(description.replace(/\+/g, ' '));
    }
    return { mode: 'forgot', message };
  }

  return { mode: 'login', message: '' };
}
