import { create } from 'zustand';
import { _sb } from '../lib/supabase.js';
import { parseAuthHash } from '../lib/appUrl.js';

const useAuthStore = create((set, get) => ({
  user:     null,
  userPlan: 'none',
  loading:  true,

  setUser: (user) => set({ user }),
  setUserPlan: (userPlan) => set({ userPlan }),
  setLoading: (loading) => set({ loading }),

  async init() {
    const { mode, message } = parseAuthHash();
    if (mode === 'recovery') {
      set({ loading: false, user: null });
      return 'recovery';
    }
    if (mode === 'forgot' && message) {
      set({ loading: false, user: null });
      return { mode: 'forgot', message };
    }
    try {
      const { data: { session } } = await _sb.auth.getSession();
      if (session) {
        await get().enterApp(session.user);
      }
    } catch(e) {
      console.error('Error al verificar sesión:', e);
    }
    set({ loading: false });
    return null;
  },

  async enterApp(user) {
    set({ user });
    try {
      const { data } = await _sb
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', user.id)
        .single();
      set({ userPlan: (data && data.status === 'active') ? data.plan : 'none' });
    } catch(e) {
      set({ userPlan: 'none' });
    }
  },

  async logout() {
    try { await _sb.auth.signOut(); } catch(e) {}
    set({ user: null, userPlan: 'none' });
  },
}));

_sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    useAuthStore.getState().enterApp(session.user);
  }
  if (event === 'SIGNED_OUT') {
    useAuthStore.setState({ user: null, userPlan: 'none' });
  }
});

export default useAuthStore;
