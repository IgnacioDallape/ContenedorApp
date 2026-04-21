import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  activeSection: 'home',
  toasts: [],

  setActiveSection: (id) => set({ activeSection: id }),

  showToast(msg, type = '') {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3200);
  },

  removeToast(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));

export default useAppStore;
