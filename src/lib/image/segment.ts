import type { Config } from '@imgly/background-removal'

export type SegmentProgress = (fraction: number, stage: 'model' | 'inference') => void

type Module = typeof import('@imgly/background-removal')

let modulePromise: Promise<Module> | null = null

/**
 * Le modèle pèse plusieurs dizaines de Mo : on ne le charge qu'au premier
 * détourage, et on garde la promesse pour que les photos suivantes du lot
 * repartent du modèle déjà en mémoire.
 */
function loadModule(): Promise<Module> {
  modulePromise ??= import('@imgly/background-removal')
  return modulePromise
}

/** À appeler quand l'utilisateur ouvre l'écran d'import : le modèle se télécharge pendant qu'il choisit ses photos. */
export async function warmUp(): Promise<void> {
  try {
    const mod = await loadModule()
    await mod.preload(baseConfig())
  } catch {
    // Le préchargement est un confort, jamais un prérequis.
  }
}

function baseConfig(): Config {
  const config: Config = {
    // isnet_fp16 : meilleur compromis qualité / poids sur mobile.
    model: 'isnet_fp16',
    output: { format: 'image/png', quality: 1 },
    proxyToWorker: true,
  }
  const publicPath = process.env.NEXT_PUBLIC_BG_REMOVAL_PATH
  if (publicPath) config.publicPath = publicPath
  return config
}

export class SegmentationError extends Error {
  constructor(cause: unknown) {
    super("Le détourage n'a pas abouti sur cette photo.")
    this.name = 'SegmentationError'
    this.cause = cause
  }
}

/**
 * Renvoie un PNG avec canal alpha : le vêtement seul, fond supprimé.
 * Tout se passe sur l'appareil — aucune photo ne quitte le téléphone.
 */
export async function cutOut(image: Blob, onProgress?: SegmentProgress): Promise<Blob> {
  const mod = await loadModule()
  const config: Config = {
    ...baseConfig(),
    progress: (key, current, total) => {
      if (!onProgress || total <= 0) return
      onProgress(current / total, key.startsWith('fetch') ? 'model' : 'inference')
    },
  }

  try {
    return await mod.removeBackground(image, config)
  } catch (error) {
    throw new SegmentationError(error)
  }
}
