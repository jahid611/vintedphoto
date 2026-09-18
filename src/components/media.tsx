'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Pose l'URL d'objet directement sur le nœud <img> et la révoque au changement.
 * On synchronise un système externe (le registre d'URL du navigateur) au lieu
 * de passer par un état React : pas de rendu en cascade, pas de fuite.
 */
export function useObjectUrl(blob?: Blob | null): RefObject<HTMLImageElement | null> {
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!blob) {
      node.removeAttribute('src')
      return
    }
    const url = URL.createObjectURL(blob)
    node.src = url
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [blob])

  return ref
}

export function BlobImage({
  blob,
  alt,
  className,
}: {
  blob?: Blob | null
  alt: string
  className?: string
}) {
  const ref = useObjectUrl(blob)
  // next/image n'apporte rien sur une URL d'objet locale : aucune optimisation
  // serveur n'est possible, et la taille est déjà celle qu'on a produite.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={alt} className={className} />
}
