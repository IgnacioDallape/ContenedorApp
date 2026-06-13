// Cron keepalive (Vercel → vercel.json). Pega a Supabase REST cada 5 días para
// que el proyecto no se pause por inactividad. Endurecido: valida env, aplica
// timeout y captura errores en vez de tirar un 500 sin contexto.
export default async function handler(req, res) {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'SUPABASE_ANON_KEY no configurada' });
    return;
  }

  const base = process.env.SUPABASE_URL || 'https://yxfpkxvrzypueusyueuh.supabase.co';
  const url = `${base}/rest/v1/shipments?select=id&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    res.status(200).json({ ok: r.ok, supabase_status: r.status });
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : 'fetch_failed';
    res.status(502).json({ ok: false, error: reason });
  } finally {
    clearTimeout(timeout);
  }
}
