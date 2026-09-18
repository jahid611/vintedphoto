export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Sans projet Supabase configuré, l'app tourne entièrement en local : le solde
 * vit dans le navigateur. C'est parfait pour développer, pas pour encaisser —
 * en production le solde doit être côté serveur, sinon il suffit d'éditer le
 * localStorage pour se créditer à l'infini.
 */
export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
