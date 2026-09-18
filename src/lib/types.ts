export type FormatId = 'vinted' | 'depop' | 'story'
export type BackgroundId = 'white' | 'beige' | 'concrete' | 'teal' | 'transparent' | 'original'
export type FilterId = 'lookbook' | 'vintage' | 'street' | 'ecom'

export interface Adjustments {
  /** -50 → +50, 0 = neutre */
  brightness: number
  contrast: number
  saturation: number
  /** négatif = plus froid, positif = plus chaud */
  temperature: number
}

export interface PhotoSettings {
  background: BackgroundId
  filter: FilterId
  format: FormatId
  adjustments: Adjustments
  /** Égalisation automatique des niveaux avant les réglages manuels. */
  autoLevels: boolean
  /** Ombre portée douce sous le vêtement détouré. */
  shadow: boolean
}

export type PhotoStatus = 'pending' | 'working' | 'ready' | 'failed'

export interface Photo {
  id: string
  name: string
  /** Fichier d'origine, jamais modifié. */
  original: Blob
  /** PNG détouré (avec alpha). Absent si le détourage a échoué ou été ignoré. */
  cutout?: Blob
  /** Rendu final prêt à publier. */
  result?: Blob
  status: PhotoStatus
  error?: string
  /** true dès que la photo a été exportée → 1 crédit débité. */
  charged: boolean
}

export interface Batch {
  id: string
  name: string
  createdAt: number
  settings: PhotoSettings
  photos: Photo[]
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
}

export const DEFAULT_SETTINGS: PhotoSettings = {
  background: 'white',
  filter: 'lookbook',
  format: 'vinted',
  adjustments: DEFAULT_ADJUSTMENTS,
  autoLevels: true,
  shadow: true,
}
