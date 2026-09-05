import { defineConfig } from '@inlang/paraglide-js'

export default defineConfig({
  outdir: './src/paraglide',
  emitTsDeclarations: true,
  strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
})
