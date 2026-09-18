'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, supabaseEnabled } from './config'

// Le type est inféré depuis l'appel : annoter `SupabaseClient` fige le schéma
// sur `public`, alors que tout Dripshot vit dans le sien.
function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA },
  })
}

let client: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!supabaseEnabled) return null
  client ??= createClient()
  return client
}

/**
 * Connexion anonyme : personne ne remplit un formulaire avant d'avoir vu ce que
 * l'outil fait de sa première photo. Le compte peut être rattaché à un e-mail
 * plus tard (`supabase.auth.updateUser`) sans perdre les crédits.
 */
export async function ensureSession(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data } = await supabase.auth.getSession()
  if (data.session?.user) return data.session.user.id

  const { data: created, error } = await supabase.auth.signInAnonymously()
  if (error) return null
  return created.user?.id ?? null
}
