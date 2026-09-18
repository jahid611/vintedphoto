import { createClient } from '@supabase/supabase-js'
import { SUPABASE_SCHEMA, SUPABASE_URL } from './config'

/**
 * Client service_role : contourne les RLS. Réservé aux routes serveur qui
 * créditent un compte ou enregistrent un achat. Ne jamais l'importer côté
 * client — la clé n'est pas préfixée NEXT_PUBLIC_, donc elle n'est pas bundlée.
 */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !key) return null
  return createClient(SUPABASE_URL, key, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
