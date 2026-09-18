import { renderPhoto } from './image/compose'
import { cutOut } from './image/segment'
import type { Photo, PhotoSettings } from './types'

export interface ProcessHandlers {
  onStart(photoId: string): void
  onProgress(photoId: string, fraction: number): void
  onDone(photoId: string, cutout: Blob | undefined, result: Blob): void
  onFail(photoId: string, message: string): void
  /** Permet d'interrompre proprement si l'utilisateur quitte l'écran. */
  isCancelled(): boolean
}

/**
 * Traite les photos une par une. En série et pas en parallèle : le détourage
 * sature déjà le GPU / les cœurs, et deux inférences simultanées font tomber
 * les téléphones d'entrée de gamme.
 */
export async function processPhotos(photos: Photo[], settings: PhotoSettings, handlers: ProcessHandlers) {
  for (const photo of photos) {
    if (handlers.isCancelled()) return
    handlers.onStart(photo.id)

    try {
      let cutout = photo.cutout
      if (!cutout) {
        cutout = await cutOut(photo.original, (fraction) => handlers.onProgress(photo.id, fraction * 0.85))
      }
      if (handlers.isCancelled()) return

      handlers.onProgress(photo.id, 0.9)
      const { blob } = await renderPhoto(photo.original, cutout, settings)
      handlers.onDone(photo.id, cutout, blob)
    } catch (error) {
      // Le détourage a lâché : on sort quand même une photo utilisable
      // (lumière + format), sans jamais débiter de crédit pour un échec.
      try {
        const { blob } = await renderPhoto(photo.original, undefined, { ...settings, background: 'original' })
        handlers.onDone(photo.id, undefined, blob)
      } catch {
        handlers.onFail(photo.id, error instanceof Error ? error.message : 'Photo illisible.')
      }
    }
  }
}

export function safeFileName(name: string, index: number, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '')
  const prefix = String(index + 1).padStart(2, '0')
  return `${prefix}-${base || 'photo'}-dripshot.${extension}`
}
