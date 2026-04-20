const CHECKOUT_BY_PLAN = {
  basic: 'https://app.lemonsqueezy.com/share/956510',
  pro: 'https://app.lemonsqueezy.com/share/956519',
  promax: 'https://app.lemonsqueezy.com/share/956525',
};

export default function UpgradeModal({ planName, onClose }) {
  const normalizedPlan = String(planName || '').toLowerCase();
  const checkoutUrl = CHECKOUT_BY_PLAN[normalizedPlan] || 'https://containerloader-landing.vercel.app/#precios';

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
          Esta funcion esta disponible en el plan {planName} o superior.
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
          Ver planes -
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
