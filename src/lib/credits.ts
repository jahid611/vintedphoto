'use client'

import { useSyncExternalStore } from 'react'
import { FREE_CREDITS } from './presets'
import { ensureSession, getSupabase } from './supabase/client'
import { supabaseEnabled } from './supabase/config'

export interface CreditEntry {
  id: string
  label: string
  /** positif = recharge, négatif = photo exportée */
  delta: number
  at: number
}

export interface Ledger {
  balance: number
  entries: CreditEntry[]
  /** false tant que le solde n'a pas été lu (localStorage ou Supabase). */
  ready: boolean
  /** true quand le solde fait autorité côté serveur. */
  remote: boolean
}

const STORAGE_KEY = 'dripshot.credits.v1'

const EMPTY: Ledger = { balance: FREE_CREDITS, entries: [], ready: false, remote: supabaseEnabled }

let state: Ledger = EMPTY
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(patch: Partial<Ledger>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

// ------------------------------------------------------------------ local --

function readLocal(): Pick<Ledger, 'balance' | 'entries'> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Pick<Ledger, 'balance' | 'entries'>
      if (typeof parsed?.balance === 'number' && Array.isArray(parsed.entries)) return parsed
    }
  } catch {
    // Navigation privée ou stockage refusé : on repart du solde de bienvenue.
  }
  return {
    balance: FREE_CREDITS,
    entries: [{ id: 'welcome', label: 'Crédits offerts', delta: FREE_CREDITS, at: Date.now() }],
  }
}

function writeLocal(balance: number, entries: CreditEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance, entries }))
  } catch {
    // Le solde reste correct pour la session en cours.
  }
}

function pushLocal(label: string, delta: number) {
  const entries = [
    { id: crypto.randomUUID(), label, delta, at: Date.now() },
    ...state.entries,
  ].slice(0, 50)
  const balance = Math.max(0, state.balance + delta)
  writeLocal(balance, entries)
  publish({ balance, entries })
}

// --------------------------------------------------------------- chargement --

async function load(): Promise<void> {
  if (supabaseEnabled) {
    const supabase = getSupabase()
    const userId = supabase ? await ensureSession() : null
    if (!supabase || !userId) {
      publish({ ready: true, balance: 0 })
      return
    }

    // `ensure_account` ouvre le compte au premier passage et renvoie le solde.
    // Pas de trigger sur `auth.users` : le projet Supabase héberge une autre
    // app, et une erreur dans un trigger partagé casserait son inscription.
    const [account, rows] = await Promise.all([
      supabase.rpc('ensure_account'),
      supabase
        .from('credit_entries')
        .select('id,label,delta,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    publish({
      balance: typeof account.data === 'number' ? account.data : 0,
      entries: ((rows.data ?? []) as { id: string; label: string; delta: number; created_at: string }[]).map(
        (row) => ({ id: row.id, label: row.label, delta: row.delta, at: Date.parse(row.created_at) }),
      ),
      ready: true,
    })
    return
  }

  publish({ ...readLocal(), ready: true })
}

function ensureLoaded() {
  loading ??= load().catch(() => publish({ ready: true }))
  return loading
}

export function refreshLedger(): Promise<void> {
  loading = null
  return ensureLoaded()
}

// ------------------------------------------------------------- opérations --

/**
 * Débit. Un crédit ne part qu'une fois la photo réellement exportée : c'est la
 * promesse affichée sur l'écran des packs, et ça évite les remboursements.
 */
export async function spendCredits(amount: number, reason: string): Promise<boolean> {
  if (amount <= 0) return true

  if (supabaseEnabled) {
    const supabase = getSupabase()
    if (!supabase) return false
    // Le débit est atomique côté base : deux exports simultanés ne peuvent pas
    // faire passer le solde sous zéro.
    const { data, error } = await supabase.rpc('spend_credits', { amount, reason })
    if (error) return false
    publish({ balance: typeof data === 'number' ? data : Math.max(0, state.balance - amount) })
    void refreshLedger()
    return true
  }

  if (state.balance < amount) return false
  pushLocal(reason, -amount)
  return true
}

/** Recharge locale, réservée au mode démo (pas de Supabase configuré). */
export function grantDemoCredits(amount: number, reason: string) {
  if (supabaseEnabled) return
  pushLocal(reason, amount)
}

export interface CheckoutResult {
  url?: string
  message?: string
}

/** Démarre un paiement Stripe. Le crédit est posé par le webhook, jamais ici. */
export async function startCheckout(packId: string): Promise<CheckoutResult> {
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packId }),
    })
    const payload = (await response.json()) as CheckoutResult
    return payload
  } catch {
    return { message: 'Le paiement est injoignable pour le moment.' }
  }
}

// -------------------------------------------------------------------- hook --

function subscribe(listener: () => void) {
  listeners.add(listener)
  void ensureLoaded()
  return () => {
    listeners.delete(listener)
  }
}

export function useLedger(): Ledger {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  )
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
