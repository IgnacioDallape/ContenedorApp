export default async function handler(req, res) {
  const url = 'https://yxfpkxvrzypueusyueuh.supabase.co/rest/v1/shipments?limit=1';
  const key = process.env.SUPABASE_ANON_KEY;

  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  res.status(200).json({ ok: true, supabase_status: r.status });
}
