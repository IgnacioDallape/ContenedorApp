import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Json = Record<string, unknown>;

type LemonPayload = {
  data?: {
    id?: string | number;
    attributes?: {
      status?: string;
      user_email?: string;
      user_name?: string;
      customer_id?: string | number;
      product_id?: string | number;
      product_name?: string;
    };
  };
  meta?: {
    event_name?: string;
    custom_data?: {
      user_id?: string;
      target_plan?: string;
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LEMON_WEBHOOK_SECRET = Deno.env.get('LEMON_WEBHOOK_SECRET') ?? '';

const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'trialing']);
const INACTIVE_STATUSES = new Set(['cancelled', 'expired', 'unpaid', 'paused', 'past_due']);

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePlan(plan?: string | null) {
  const value = String(plan ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('promax') || value.includes('pro max')) return 'promax';
  if (value.includes('pro')) return 'pro';
  if (value.includes('basic') || value.includes('basico') || value.includes('básico')) return 'basic';
  return null;
}

function inferPlanFromPayload(payload: LemonPayload) {
  const targetPlan = normalizePlan(payload.meta?.custom_data?.target_plan);
  if (targetPlan) return targetPlan;

  const productName = normalizePlan(payload.data?.attributes?.product_name);
  if (productName) return productName;

  const productId = String(payload.data?.attributes?.product_id ?? '');
  if (productId === '956510') return 'basic';
  if (productId === '956519') return 'pro';
  if (productId === '956525') return 'promax';

  return null;
}

async function verifySignature(rawBody: string, signature: string | null) {
  if (!LEMON_WEBHOOK_SECRET) {
    throw new Error('Missing LEMON_WEBHOOK_SECRET');
  }
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LEMON_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

function getAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL secret');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY secret');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserId(supabase: ReturnType<typeof getAdminClient>, payload: LemonPayload) {
  const explicitUserId = payload.meta?.custom_data?.user_id;
  if (explicitUserId) return explicitUserId;

  const email = payload.data?.attributes?.user_email?.trim().toLowerCase();
  if (!email) return null;

  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const match = data.users.find(user => user.email?.trim().toLowerCase() === email);
    if (match) return match.id;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-signature');
    const signatureOk = await verifySignature(rawBody, signature);
    if (!signatureOk) {
      console.error('[lemon-webhook] Invalid webhook signature');
      return json({ error: 'Invalid webhook signature' }, 401);
    }

    const payload = JSON.parse(rawBody) as LemonPayload;
    const eventName = payload.meta?.event_name ?? '';
    console.log('[lemon-webhook] Event received', {
      eventName,
      email: payload.data?.attributes?.user_email ?? null,
      subscriptionId: payload.data?.id ?? null,
      productId: payload.data?.attributes?.product_id ?? null,
      targetPlan: payload.meta?.custom_data?.target_plan ?? null,
      customUserId: payload.meta?.custom_data?.user_id ?? null,
    });
    if (!eventName.startsWith('subscription_')) {
      return json({ ok: true, skipped: true, reason: 'Unsupported event' });
    }

    const supabase = getAdminClient();
    const userId = await findUserId(supabase, payload);
    if (!userId) {
      console.error('[lemon-webhook] User not found', {
        email: payload.data?.attributes?.user_email ?? null,
        customUserId: payload.meta?.custom_data?.user_id ?? null,
      });
      return json({
        error: 'User not found for webhook',
        email: payload.data?.attributes?.user_email ?? null,
        user_id: payload.meta?.custom_data?.user_id ?? null,
      }, 404);
    }

    const plan = inferPlanFromPayload(payload);
    if (!plan) {
      console.error('[lemon-webhook] Could not infer plan', {
        productId: payload.data?.attributes?.product_id ?? null,
        productName: payload.data?.attributes?.product_name ?? null,
        targetPlan: payload.meta?.custom_data?.target_plan ?? null,
      });
      return json({ error: 'Could not infer plan from webhook payload' }, 422);
    }

    const rawStatus = String(payload.data?.attributes?.status ?? '').toLowerCase();
    const normalizedStatus =
      ACTIVE_STATUSES.has(rawStatus) ? 'active' :
      INACTIVE_STATUSES.has(rawStatus) ? rawStatus :
      rawStatus || 'active';

    const lemonCustomerId = String(payload.data?.attributes?.customer_id ?? '');
    const lemonSubscriptionId = String(payload.data?.id ?? '');

    const { data: existing, error: existingError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const record = {
      user_id: userId,
      plan,
      status: normalizedStatus,
      lemon_customer_id: lemonCustomerId || null,
      lemon_subscription_id: lemonSubscriptionId || null,
    };

    const mutation = existing?.id
      ? supabase.from('subscriptions').update(record).eq('id', existing.id)
      : supabase.from('subscriptions').insert(record);

    const { error: writeError } = await mutation;
    if (writeError) {
      console.error('[lemon-webhook] Failed writing subscription', {
        userId,
        plan,
        status: normalizedStatus,
        message: writeError.message,
        details: writeError.details,
        hint: writeError.hint,
      });
      throw writeError;
    }

    console.log('[lemon-webhook] Subscription upserted', {
      userId,
      plan,
      status: normalizedStatus,
      lemonCustomerId,
      lemonSubscriptionId,
    });

    return json({
      ok: true,
      event: eventName,
      user_id: userId,
      plan,
      status: normalizedStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    console.error('[lemon-webhook] Fatal error', message);
    return json({ error: message }, 500);
  }
});
