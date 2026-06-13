import { createClient } from '@supabase/supabase-js';

// Configurable por entorno (ver .env.example). Si no hay variables, cae al
// proyecto actual hardcodeado: ambas claves son PÚBLICAS (publishable/anon,
// protegidas por RLS), seguras de exponer en el bundle del cliente.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://yxfpkxvrzypueusyueuh.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4Fn3E1cA-quyFvsMHnMfVw_xzrRSbSp';

export const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
