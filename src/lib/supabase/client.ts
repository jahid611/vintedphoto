'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseEnabled } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
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
