/// <reference types="vite/client" />

import type { StackferryApi } from '../shared/types'

declare global {
  interface Window {
    stackferry: StackferryApi
  }
}

export {}
