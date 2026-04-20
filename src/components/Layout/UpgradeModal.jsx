import useAuthStore from '../../stores/authStore.js';

const VARIANT_BY_PLAN = {
  basic: '8877107b-9b88-497f-9723-b9cb0ff7fbd9',
  pro: '8d615e34-1fb7-4c20-b8fd-4507f7d55505',
  promax: '936ab541-dc30-4384-bf0d-651d06eda7cc',
};

export default function UpgradeModal({ planName, onClose }) {
  const normalizedPlan = String(planName || '').toLowerCase();
  const { user } = useAuthStore();
  const variantId = VARIANT_BY_PLAN[normalizedPlan];
  const email = user?.email || '';
  const name = user?.user_metadata?.username || user?.email?.split('@')[0] || '';
  const query = new URLSearchParams();

  if (email) query.append('checkout[email]', email);
  if (name) query.append('checkout[name]', name);
  if (user?.id) query.append('checkout[custom][user_id]', user.id);
  if (normalizedPlan) query.append('checkout[custom][target_plan]', normalizedPlan);

  const checkoutUrl = variantId
    ? `https://containerloader.lemonsqueezy.com/checkout/buy/${variantId}?${query.toString()}`
    : 'https://containerloader-landing.vercel.app/#precios';

  return (
    <div
      className="cap-overlay open"
      style={{ zIndex: 400 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="cap-modal" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 24, marginBottom: 16, fontWeight: 700 }}>Plan</div>
        <div className="cap-title">Plan {planName} requerido</div>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0 24px' }}>
          Esta funcion esta disponible en el plan {planName} o superior. El checkout se abrira con tu cuenta ya identificada.
        </p>
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            background: 'var(--c1)',
            color: 'var(--c5)',
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Ir al checkout
        </a>
        <br /><br />
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
