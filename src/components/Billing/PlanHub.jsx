import { useTranslation } from 'react-i18next';
import useAuthStore from '../../stores/authStore.js';

// Los precios (ARS) y los nombres de plan (Basic/Pro/Pro Max) son marca/negocio
// y no se traducen; el detalle y la copy de estado sí, vía i18n (billing.*).
const PLAN_BUTTONS = [
  { key: 'basic', label: 'Basic', price: 'ARS 24.999' },
  { key: 'pro', label: 'Pro', price: 'ARS 49.999' },
  { key: 'promax', label: 'Pro Max', price: 'ARS 69.999' },
];

export default function PlanHub({ onCheckout }) {
  const { t } = useTranslation();
  const { user, userPlan } = useAuthStore();
  const planKey = ['basic', 'pro', 'promax'].includes(userPlan) ? userPlan : 'none';
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'usuario';

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-2, #fff)',
          borderRadius: 18,
          padding: 28,
          marginBottom: 24,
          width: '100%',
          boxShadow: '0 12px 36px rgba(26, 18, 8, 0.06)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: 'var(--text)', fontFamily: 'var(--font-head, inherit)' }}>
          {t(`billing.status.${planKey}.title`)}
        </h1>
        <p style={{ margin: '12px auto 0', maxWidth: 760, color: 'var(--text-2, #6f5e4e)', fontSize: 15, lineHeight: 1.7 }}>
          {displayName}, {t(`billing.status.${planKey}.body`)}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 18,
          width: '100%',
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
              <div style={{ color: 'var(--text-2, #6f5e4e)', fontSize: 14 }}>{t(`billing.plans.${plan.key}.detail`)}</div>
              <button
                className={isCurrent ? 'btn-outline' : 'btn-primary'}
                onClick={() => onCheckout(plan.label)}
                style={{ marginTop: 'auto' }}
              >
                {isCurrent ? t('billing.current') : t('billing.choose', { plan: plan.label })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
