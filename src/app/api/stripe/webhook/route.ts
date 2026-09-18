import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** Tolérance sur l'horodatage Stripe, pour bloquer les rejeux. */
const MAX_AGE_SECONDS = 300

function verifySignature(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const [key, ...rest] = piece.split('=')
      return [key, rest.join('=')]
    }),
  ) as { t?: string; v1?: string }

  if (!parts.t || !parts.v1) return false

  const age = Math.abs(Date.now() / 1000 - Number(parts.t))
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(parts.v1, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

interface CheckoutSession {
  id: string
  client_reference_id?: string | null
  metadata?: { user_id?: string; pack_id?: string; credits?: string }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')
  const body = await request.text()

  if (!secret) {
    return NextResponse.json({ message: 'Webhook non configuré.' }, { status: 501 })
  }
  if (!signature || !verifySignature(body, signature, secret)) {
    return NextResponse.json({ message: 'Signature invalide.' }, { status: 400 })
  }

  const event = JSON.parse(body) as { type: string; data: { object: CheckoutSession } }
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object
  const userId = session.metadata?.user_id ?? session.client_reference_id
  const credits = Number(session.metadata?.credits ?? 0)

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ message: 'Session sans destinataire.' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  if (!admin) {
    return NextResponse.json({ message: 'Clé service_role absente.' }, { status: 501 })
  }

  // `grant_credits` est idempotente sur `session_id` : un rejeu Stripe ne
  // crédite pas deux fois.
  const { error } = await admin.rpc('grant_credits', {
    target_user: userId,
    amount: credits,
    reason: `Pack ${session.metadata?.pack_id ?? 'crédits'}`,
    session_id: session.id,
  })

  if (error) {
    return NextResponse.json({ message: 'Crédit impossible.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
