import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n/index.js';

// Selector de idioma. Persiste en localStorage (vía el detector de i18n) y
// actualiza <html lang>. Reutilizable: `compact` oculta el label.
export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation();
  const current = String(i18n.resolvedLanguage || i18n.language || 'es').split('-')[0];

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--text-2)',
        fontFamily: 'var(--font)',
      }}
    >
      {!compact && <span>{t('language.label')}</span>}
      <select
        aria-label={t('language.label')}
        value={current}
        onChange={e => i18n.changeLanguage(e.target.value)}
        style={{
          padding: '6px 10px',
          fontSize: 12,
          background: 'var(--bg-3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--text)',
          fontFamily: 'var(--font)',
          cursor: 'pointer',
        }}
      >
        {SUPPORTED_LANGS.map(l => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
