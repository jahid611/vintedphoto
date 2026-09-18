import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, supabaseEnabled } from './config'

/** Client lié aux cookies de la requête : il voit la session de l'utilisateur. */
export async function getServerSupabase() {
  if (!supabaseEnabled) return null
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Appelé depuis un Server Component : le refresh de session est géré
          // côté navigateur, on peut ignorer.
        }
      },
    },
  })
}
