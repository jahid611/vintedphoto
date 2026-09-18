import { NextResponse } from 'next/server'
import { CREDIT_PACKS } from '@/lib/presets'
import { getAdminSupabase } from '@/lib/supabase/admin'
import { getServerSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Crée une session Stripe Checkout. On n'ajoute jamais de crédits ici : c'est
 * le webhook, une fois le paiement confirmé, qui appelle `grant_credits`.
 * Appel direct à l'API REST de Stripe — pas besoin du SDK pour un seul endpoint.
 */
export async function POST(request: Request) {
  let packId: string | undefined
  try {
    packId = ((await request.json()) as { packId?: string }).packId
  } catch {
    return NextResponse.json({ message: 'Requête illisible.' }, { status: 400 })
  }

  const pack = CREDIT_PACKS.find((item) => item.id === packId)
  if (!pack) {
    return NextResponse.json({ message: 'Pack inconnu.' }, { status: 400 })
  }

  const supabase = await getServerSupabase()
  if (!supabase) {
    return NextResponse.json(
      { message: 'Supabase n’est pas configuré : l’app tourne en mode démo local.' },
      { status: 501 },
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Session expirée, recharge la page.' }, { status: 401 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json(
      { message: 'Aucune clé Stripe côté serveur : le paiement n’est pas encore branché.' },
      { status: 501 },
    )
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/credits?paiement=ok`,
    cancel_url: `${origin}/credits?paiement=annule`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[pack_id]': pack.id,
    'metadata[credits]': String(pack.credits),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(pack.priceCents),
    'line_items[0][price_data][product_data][name]': `Dripshot — pack ${pack.label}`,
    'line_items[0][price_data][product_data][description]': `${pack.credits} photos nettoyées`,
  })

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    return NextResponse.json({ message: 'Stripe a refusé la création du paiement.' }, { status: 502 })
  }

  const session = (await response.json()) as { id: string; url: string }

  // Trace l'intention d'achat : le webhook la passera en `paid`.
  const admin = getAdminSupabase()
  if (admin) {
    await admin.from('purchases').insert({
      user_id: user.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_cents: pack.priceCents,
      stripe_session_id: session.id,
      status: 'pending',
    })
  }

  return NextResponse.json({ url: session.url })
}
