/**
 * Smoke test de componente (establece el patrón con React Testing Library).
 * Verifica el ciclo de vida del Toast leyendo del appStore (Zustand).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Toast from '../components/Toast.jsx';
import useAppStore from '../stores/appStore.js';

describe('Toast', () => {
  beforeEach(() => useAppStore.setState({ toasts: [] }));
  afterEach(() => useAppStore.setState({ toasts: [] }));

  it('no muestra nada cuando no hay toasts', () => {
    render(<Toast />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('muestra el mensaje cuando se llama showToast', () => {
    render(<Toast />);
    act(() => useAppStore.getState().showToast('Hola mundo', 'success'));
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();
  });

  it('se descarta al hacer click', () => {
    render(<Toast />);
    act(() => useAppStore.getState().showToast('Chau', 'info'));
    fireEvent.click(screen.getByText('Chau'));
    expect(screen.queryByText('Chau')).not.toBeInTheDocument();
  });

  it('se auto-remueve a los 3.2s', () => {
    vi.useFakeTimers();
    try {
      render(<Toast />);
      act(() => useAppStore.getState().showToast('Temporal', 'info'));
      expect(screen.getByText('Temporal')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(3300));
      expect(screen.queryByText('Temporal')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
