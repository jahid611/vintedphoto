import type { Adjustments, BackgroundId, FilterId, FormatId } from './types'

export interface FormatPreset {
  id: FormatId
  label: string
  ratioLabel: string
  /** largeur / hauteur */
  ratio: number
  /** côté le plus long du fichier exporté, en pixels */
  longEdge: number
  hint: string
}

/**
 * Vinted affiche les vignettes en carré et Depop en 4:5 ; une story fait 9:16.
 * On exporte en 1600 px : au-dessus, les plateformes recompressent pour rien.
 */
export const FORMATS: FormatPreset[] = [
  { id: 'vinted', label: 'Vinted', ratioLabel: '1:1', ratio: 1, longEdge: 1600, hint: 'Carré, la vignette de la marketplace' },
  { id: 'depop', label: 'Depop', ratioLabel: '4:5', ratio: 4 / 5, longEdge: 1600, hint: 'Portrait, occupe plus de feed' },
  { id: 'story', label: 'Story', ratioLabel: '9:16', ratio: 9 / 16, longEdge: 1920, hint: 'Instagram / TikTok pour pousser l’annonce' },
]

export interface BackgroundPreset {
  id: BackgroundId
  label: string
  /** Couleur unie du fond, ou null pour transparent / photo d’origine. */
  color: string | null
  /** Aperçu dans l’UI. */
  swatch: string
  transparent?: boolean
  keepOriginal?: boolean
  hint: string
}

export const BACKGROUNDS: BackgroundPreset[] = [
  { id: 'white', label: 'Blanc studio', color: '#ffffff', swatch: '#ffffff', hint: 'Le plus vendeur sur Vinted' },
  { id: 'beige', label: 'Beige lookbook', color: '#efe7dc', swatch: '#efe7dc', hint: 'Chaleureux, vintage / friperie' },
  { id: 'concrete', label: 'Gris béton', color: '#d3d6d4', swatch: '#d3d6d4', hint: 'Streetwear, pièces claires' },
  { id: 'teal', label: 'Teal doux', color: '#ecf8f8', swatch: '#ecf8f8', hint: 'Fait ressortir les tons chauds' },
  { id: 'transparent', label: 'PNG transparent', color: null, swatch: 'checker', transparent: true, hint: 'Pour composer toi-même' },
  { id: 'original', label: 'Fond d’origine', color: null, swatch: '#c9c2b6', keepOriginal: true, hint: 'Juste la lumière et le format' },
]

export interface FilterPreset {
  id: FilterId
  label: string
  hint: string
  swatch: string
  adjustments: Adjustments
  /** 0 → 1, quantité de grain ajouté. */
  grain: number
  /** Voile coloré appliqué au rendu final. */
  tint: { r: number; g: number; b: number; a: number } | null
}

export const FILTERS: FilterPreset[] = [
  {
    id: 'lookbook',
    label: 'Lookbook pro',
    hint: 'Neutre, contrasté, couleurs fidèles',
    swatch: '#ffffff',
    adjustments: { brightness: 4, contrast: 10, saturation: 4, temperature: 0 },
    grain: 0,
    tint: null,
  },
  {
    id: 'vintage',
    label: 'Vintage film',
    hint: 'Grain léger, teintes chaudes',
    swatch: '#e7e2d6',
    adjustments: { brightness: 3, contrast: 6, saturation: -6, temperature: 12 },
    grain: 0.16,
    tint: { r: 214, g: 186, b: 146, a: 0.08 },
  },
  {
    id: 'street',
    label: 'Streetwear froid',
    hint: 'Bleuté, contrasté, look boutique',
    swatch: '#cbd4d8',
    adjustments: { brightness: 2, contrast: 16, saturation: 2, temperature: -12 },
    grain: 0.05,
    tint: { r: 120, g: 160, b: 190, a: 0.07 },
  },
  {
    id: 'ecom',
    label: 'Clean e-com',
    hint: 'Blancs purs, zéro dominante',
    swatch: '#f6f6f4',
    adjustments: { brightness: 8, contrast: 4, saturation: -2, temperature: 0 },
    grain: 0,
    tint: null,
  },
]

export const getFormat = (id: FormatId) => FORMATS.find((f) => f.id === id) ?? FORMATS[0]
export const getBackground = (id: BackgroundId) => BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]
export const getFilter = (id: FilterId) => FILTERS.find((f) => f.id === id) ?? FILTERS[0]

export interface CreditPack {
  id: string
  label: string
  credits: number
  priceCents: number
  badge?: string
  highlight?: boolean
}

/** 1 crédit = 1 photo exportée. Pas d’abonnement, les crédits n’expirent pas. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter', label: 'Starter', credits: 100, priceCents: 499 },
  { id: 'pro', label: 'Pro', credits: 500, priceCents: 1499, badge: 'Le plus pris', highlight: true },
  { id: 'studio', label: 'Studio', credits: 2000, priceCents: 3999, badge: '-60 %' },
]

export const FREE_CREDITS = 10
