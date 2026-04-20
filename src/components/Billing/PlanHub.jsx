import useAuthStore from '../../stores/authStore.js';

const PLAN_COPY = {
  none: {
    eyebrow: 'Cuenta creada',
    title: 'Tu cuenta ya esta lista. Falta activar un plan.',
    body: 'Podes entrar a la app, pero para usar cualquier modulo primero tenes que elegir un plan y completar el pago.',
  },
  basic: {
    eyebrow: 'Plan activo',
    title: 'Estas en Basic.',
    body: 'Ya podes usar los modulos de importacion. Para destrabar contenedor 3D o pallets, subi de plan cuando quieras.',
  },
  pro: {
    eyebrow: 'Plan activo',
    title: 'Estas en Pro.',
    body: 'Tenes habilitados importacion, contenedor 3D y catalogo compartido.',
  },
  promax: {
    eyebrow: 'Plan activo',
    title: 'Estas en Pro Max.',
    body: 'Tenes todos los modulos habilitados, incluido el armador de pallets.',
  },
};

const PLAN_BUTTONS = [
  { key: 'basic', label: 'Basic', price: 'ARS 24.999', detail: 'Importacion + NCM + simulador' },
  { key: 'pro', label: 'Pro', price: 'ARS 49.999', detail: 'Suma cargador 3D y catalogo' },
  { key: 'promax', label: 'Pro Max', price: 'ARS 69.999', detail: 'Suma armador de pallets' },
];

export default function PlanHub({ onCheckout }) {
  const { user, userPlan } = useAuthStore();
  const copy = PLAN_COPY[userPlan] || PLAN_COPY.none;
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'usuario';

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div
        style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-2, #fff)',
          borderRadius: 18,
          padding: 28,
          marginBottom: 24,
          boxShadow: '0 12px 36px rgba(26, 18, 8, 0.06)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent, #8D7966)', marginBottom: 10 }}>
          {copy.eyebrow}
        </div>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: 'var(--text)', fontFamily: 'var(--font-head, inherit)' }}>
          {copy.title}
        </h1>
        <p style={{ margin: '12px 0 0', maxWidth: 760, color: 'var(--text-2, #6f5e4e)', fontSize: 15, lineHeight: 1.7 }}>
          {displayName}, {copy.body}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 18,
        }}
      >
        {PLAN_BUTTONS.map(plan => {
          const isCurrent = userPlan === plan.key;
          return (
            <div
              key={plan.key}
              style={{
                border: isCurrent ? '1.5px solid var(--accent, #8D7966)' : '1px solid var(--border)',
                background: isCurrent ? 'rgba(141, 121, 102, 0.08)' : 'var(--bg-2, #fff)',
                borderRadius: 18,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-3, #8D7966)' }}>
                {plan.label}
              </div>
              <div style={{ fontSize: 34, lineHeight: 1, color: 'var(--text)' }}>{plan.price}</div>
              <div style={{ color: 'var(--text-2, #6f5e4e)', fontSize: 14 }}>{plan.detail}</div>
              <button
                className={isCurrent ? 'btn-outline' : 'btn-primary'}
                onClick={() => onCheckout(plan.label)}
                style={{ marginTop: 'auto' }}
              >
                {isCurrent ? 'Ver plan actual' : `Elegir ${plan.label}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
