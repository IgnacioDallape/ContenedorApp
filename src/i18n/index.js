import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';

// Idiomas soportados. `es` es el default y fallback (cobertura 100%), así los
// usuarios actuales no ven ningún cambio. `en`/`pt` cubren el chrome para
// escalar a mercados internacionales; el detector auto-elige según el navegador.
export const SUPPORTED_LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en', 'pt'],
    nonExplicitSupportedLngs: true, // es-AR / pt-BR / en-US → es / pt / en
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app-lang',
      caches: ['localStorage'],
    },
  });

// Mantener <html lang> sincronizado con el idioma activo (a11y + SEO).
const applyHtmlLang = lng => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = String(lng || 'es').split('-')[0];
  }
};
applyHtmlLang(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
