/**
 * Valida el wiring de i18n end-to-end: el selector ofrece los 3 idiomas y
 * cambiar la opción cambia el idioma activo de i18next.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import i18n from '../i18n/index.js';

describe('LanguageSwitcher', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('ofrece los 3 idiomas soportados', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Português' })).toBeInTheDocument();
  });

  it('cambiar la opción cambia el idioma activo', async () => {
    render(<LanguageSwitcher />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en'));
  });
});
