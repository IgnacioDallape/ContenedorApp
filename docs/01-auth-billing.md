# 01 — Auth + Billing + Pagos (verificado)

> ⚠️ **El `CLAUDE.md` viejo dice "No hay integración de pagos". Es FALSO.**
> Hay una integración completa de **Lemon Squeezy**: checkout en el cliente +
> webhook server-side que provisiona la suscripción automáticamente.

## Auth flow

Cliente único: `_sb` en [supabase.js:3-6](../src/lib/supabase.js) — URL del proyecto
+ key **publishable** (`sb_publishable_*`, segura de exponer, protegida por RLS).

`init()` se llama en [App.jsx:34](../src/App.jsx) (salvo en rutas `/share/...`).

**`authStore.init()`** ([authStore.js:16-36](../src/stores/authStore.js)):
1. `parseAuthHash()` ([appUrl.js:5-31](../src/lib/appUrl.js)) lee `window.location.hash`:
   - `type=recovery|invite` → `{mode:'recovery'}` → setea `recoveryFlow:true`, devuelve `'recovery'`.
   - `error_code=otp_expired` u otros errores → `{mode:'forgot', message}`.
2. Si no es recovery/forgot → `_sb.auth.getSession()`; con sesión → `enterApp(user)`.

**`enterApp(user)`** ([authStore.js:38-51](../src/stores/authStore.js)):
- Early-return si `recoveryFlow` activo (evita loguear con el link de recuperación).
- Query: `_sb.from('subscriptions').select('plan, status').eq('user_id', user.id).single()`.
- `userPlan = ['active','on_trial','trialing'].includes(status) ? plan : 'none'`.
- Cualquier error / no-row → `userPlan: 'none'` (usa `.single()` que tira error si no hay fila).

`onAuthStateChange` ([authStore.js:59-70](../src/stores/authStore.js)): en `SIGNED_IN`,
si `recoveryFlow` fuerza `user:null`; si no, `enterApp`. `SIGNED_OUT` limpia todo.

LoginPage ([LoginPage.jsx](../src/components/Auth/LoginPage.jsx)): 4 paneles
(login `signInWithPassword`, registro `signUp` con metadata `username`, forgot
`resetPasswordForEmail`, reset `updateUser`) + Google OAuth. Todos los redirects
usan `getAppUrl()` → hardcodeado `https://fleetloader.vercel.app/` ([appUrl.js:1-3](../src/lib/appUrl.js)).

## Planes y lock

Tiers y precios ([PlanHub.jsx:26-30](../src/components/Billing/PlanHub.jsx)):

| key | label | precio ARS | desbloquea |
|-----|-------|-----------:|------------|
| `none` | — | — | sólo Settings/PlanHub |
| `basic` | Basic | 24.999 | Importación + NCM + Simulador + Productos + Comparador + Prices |
| `pro` | Pro | 49.999 | + Cargador 3D de contenedores |
| `promax` | Pro Max | 69.999 | + Armador de pallets |

**Expresión de lock** — literal de [AppShell.jsx:223-225](../src/components/Layout/AppShell.jsx)
(duplicada en `:242-244` para móvil):

```js
const locked = (id !== 'settings' && userPlan === 'none')
  || (id === 'container' && !['pro', 'promax'].includes(userPlan))
  || (id === 'palletbuilder' && userPlan !== 'promax');
```

**El gating es sólo de navegación** ([AppShell.jsx:185-207](../src/components/Layout/AppShell.jsx),
función `navigate`), no de render. El render sólo mira `activeSection`. La autorización
real depende **100% de las RLS de Supabase** — el lock del cliente es cosmético.

## Pagos — Lemon Squeezy (REAL)

### Checkout en el cliente — [UpgradeModal.jsx:3-24](../src/components/Layout/UpgradeModal.jsx)

```js
const VARIANT_BY_PLAN = {
  basic:  '8877107b-9b88-497f-9723-b9cb0ff7fbd9',
  pro:    '8d615e34-1fb7-4c20-b8fd-4507f7d55505',
  promax: '936ab541-dc30-4384-bf0d-651d06eda7cc',
};
// → https://containerloader.lemonsqueezy.com/checkout/buy/{variantId}?...
```

Prefill clave: `checkout[custom][user_id]` y `checkout[custom][target_plan]` — así el
webhook mapea la compra al usuario de Supabase. Abre en nueva pestaña. PlanHub "Elegir"
→ `onCheckout(plan.label)` → AppShell `setUpgradeModal` → este modal.

### Webhook server-side — [lemon-webhook/index.ts](../supabase/functions/lemon-webhook/index.ts) (Deno edge function)

- **Env/secrets** (`:31-33`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEMON_WEBHOOK_SECRET` (leídos de `Deno.env`, nunca commiteados).
- **Verifica firma** HMAC-SHA256 del body crudo vs header `x-signature` (`:69-85`).
- **Eventos** (`:150-152`): sólo `event_name` que arranca con `subscription_`.
- **Plan** (`inferPlanFromPayload` `:54-67`): `custom_data.target_plan` → `product_name` → map de product-id (`956510→basic, 956519→pro, 956525→promax`).
- **Usuario** (`findUserId` `:100-120`): `custom_data.user_id`, si no pagina `auth.admin.listUsers` (hasta 2000) matcheando email.
- **Status** (`:35-36`): `{active,on_trial,trialing}` → `'active'`; `{cancelled,expired,unpaid,paused,past_due}` se guardan tal cual.
- **Escribe** en tabla `subscriptions` (upsert manual select+update/insert): `{user_id, plan, status, lemon_customer_id, lemon_subscription_id}`.
- `config.toml`: `verify_jwt = false` para esta función (correcto — los webhooks son anónimos y se validan por HMAC).

El set de status activos del webhook (`:35`) coincide exactamente con el gate de `enterApp` ([authStore.js:47](../src/stores/authStore.js)).

## Schema inferido (tabla `subscriptions`)

⚠️ **No hay migración committeada** para esta tabla (la de `pallets` sí). Schema
inferido de `authStore` + webhook:

| columna | tipo | notas |
|---|---|---|
| `id` | uuid pk | webhook update/insert por `id` |
| `user_id` | uuid → auth.users | |
| `plan` | text | `basic`/`pro`/`promax` |
| `status` | text | `active`/`on_trial`/`trialing`/`cancelled`/... |
| `lemon_customer_id` | text null | |
| `lemon_subscription_id` | text null | |

## Riesgos (ver `07-audit-findings.md` para la lista priorizada)

- **RLS de `subscriptions` sin verificar en el repo.** Si el cliente puede escribir
  esa tabla, un usuario podría auto-asignarse `promax`. Control crítico no auditable
  desde el código — revisar en el dashboard de Supabase.
- Comparación de firma HMAC no constante en tiempo (`expected === signature`, `:84`).
- Upsert manual sin `onConflict` → carrera con eventos concurrentes.
- Sin idempotencia / orden de eventos → un `subscription_updated` tardío podría
  reactivar un plan cancelado.
- `.single()` en `enterApp` tira error en usuario nuevo sin fila (lo captura, pero
  `.maybeSingle()` sería más limpio — el webhook ya usa `.maybeSingle()`).
