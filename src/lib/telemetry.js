// Abstracción de observabilidad (errores + eventos). No-op por defecto para no
// acoplar la app a un proveedor concreto. Se "enciende" inyectando un reporter
// real (ej. Sentry) vía initTelemetry(), o queda listo para integrarlo cuando
// se configure VITE_SENTRY_DSN. Nunca debe romper la app.

const DSN = (import.meta.env && import.meta.env.VITE_SENTRY_DSN) || '';
const IS_DEV = Boolean(import.meta.env && import.meta.env.DEV);

let reporter = null;

/** Inyecta un proveedor real de telemetría. `reporter` = { captureError?, captureEvent? }. */
export function initTelemetry(customReporter) {
  if (customReporter) reporter = customReporter;
}

/** Reporta un error capturado (ErrorBoundary, catch, etc.). */
export function captureError(error, context = {}) {
  try {
    if (reporter && typeof reporter.captureError === 'function') {
      reporter.captureError(error, context);
    } else if (IS_DEV) {
      console.error('[telemetry] error', error, context);
    }
  } catch {
    /* la telemetría nunca debe tirar */
  }
}

/** Reporta un evento de producto (uso de features, conversiones, etc.). */
export function captureEvent(name, props = {}) {
  try {
    if (reporter && typeof reporter.captureEvent === 'function') {
      reporter.captureEvent(name, props);
    }
  } catch {
    /* no-op */
  }
}

/** true si hay un DSN/proveedor configurado (para gating opcional en la UI). */
export const telemetryEnabled = Boolean(DSN);
