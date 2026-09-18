import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Le détourage tourne dans un Web Worker via onnxruntime-web : ces en-têtes
  // activent SharedArrayBuffer, ce qui rend le WASM multi-thread (~3x plus rapide).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },
}

export default nextConfig
