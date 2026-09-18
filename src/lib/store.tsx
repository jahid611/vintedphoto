'use client'

import { get, set } from 'idb-keyval'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { DEFAULT_SETTINGS, type Batch, type Photo, type PhotoSettings } from './types'

const STORE_KEY = 'dripshot.batches.v1'
/** Les blobs vivent dans IndexedDB : au-delà, on remplit le quota du navigateur. */
const MAX_BATCHES = 5

interface State {
  batches: Batch[]
  activeBatchId: string | null
  hydrated: boolean
}

type Action =
  | { type: 'hydrate'; batches: Batch[] }
  | { type: 'createBatch'; batch: Batch }
  | { type: 'patchPhoto'; batchId: string; photoId: string; patch: Partial<Photo> }
  | { type: 'setSettings'; batchId: string; settings: PhotoSettings }
  | { type: 'removeBatch'; batchId: string }
  | { type: 'setActive'; batchId: string | null }

const initialState: State = { batches: [], activeBatchId: null, hydrated: false }

function mapBatch(state: State, batchId: string, fn: (batch: Batch) => Batch): State {
  return { ...state, batches: state.batches.map((batch) => (batch.id === batchId ? fn(batch) : batch)) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { ...state, batches: action.batches, hydrated: true, activeBatchId: action.batches[0]?.id ?? null }
    case 'createBatch':
      return {
        ...state,
        batches: [action.batch, ...state.batches].slice(0, MAX_BATCHES),
        activeBatchId: action.batch.id,
      }
    case 'patchPhoto':
      return mapBatch(state, action.batchId, (batch) => ({
        ...batch,
        photos: batch.photos.map((photo) =>
          photo.id === action.photoId ? { ...photo, ...action.patch } : photo,
        ),
      }))
    case 'setSettings':
      return mapBatch(state, action.batchId, (batch) => ({ ...batch, settings: action.settings }))
    case 'removeBatch': {
      const batches = state.batches.filter((batch) => batch.id !== action.batchId)
      return {
        ...state,
        batches,
        activeBatchId: state.activeBatchId === action.batchId ? (batches[0]?.id ?? null) : state.activeBatchId,
      }
    }
    case 'setActive':
      return { ...state, activeBatchId: action.batchId }
    default:
      return state
  }
}

interface StoreValue extends State {
  activeBatch: Batch | null
  createBatch(files: File[], settings?: PhotoSettings): Batch
  patchPhoto(batchId: string, photoId: string, patch: Partial<Photo>): void
  setSettings(batchId: string, settings: PhotoSettings): void
  removeBatch(batchId: string): void
  setActive(batchId: string | null): void
}

const StoreContext = createContext<StoreValue | null>(null)

function batchName(): string {
  const now = new Date()
  return `Lot du ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    get<Batch[]>(STORE_KEY)
      .then((batches) => {
        if (!cancelled) dispatch({ type: 'hydrate', batches: Array.isArray(batches) ? batches : [] })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'hydrate', batches: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Écriture différée : un lot de 30 photos déclenche des dizaines de patchs.
  useEffect(() => {
    if (!state.hydrated) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      set(STORE_KEY, state.batches).catch(() => {
        // Quota plein ou stockage refusé : la session reste utilisable en mémoire.
      })
    }, 500)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [state.batches, state.hydrated])

  const createBatch = useCallback((files: File[], settings: PhotoSettings = DEFAULT_SETTINGS) => {
    const batch: Batch = {
      id: crypto.randomUUID(),
      name: batchName(),
      createdAt: Date.now(),
      settings,
      photos: files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        original: file,
        status: 'pending' as const,
        charged: false,
      })),
    }
    dispatch({ type: 'createBatch', batch })
    return batch
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      activeBatch: state.batches.find((batch) => batch.id === state.activeBatchId) ?? null,
      createBatch,
      patchPhoto: (batchId, photoId, patch) => dispatch({ type: 'patchPhoto', batchId, photoId, patch }),
      setSettings: (batchId, settings) => dispatch({ type: 'setSettings', batchId, settings }),
      removeBatch: (batchId) => dispatch({ type: 'removeBatch', batchId }),
      setActive: (batchId) => dispatch({ type: 'setActive', batchId }),
    }),
    [state, createBatch],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore doit être utilisé dans <StoreProvider>.')
  return value
}

export function countReady(batch: Batch | null): number {
  return batch ? batch.photos.filter((photo) => photo.status === 'ready').length : 0
}

export function photoLabel(photo: Photo): string {
  return photo.name.replace(/\.[^.]+$/, '')
}
