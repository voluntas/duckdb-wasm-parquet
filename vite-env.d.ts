/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_SPAM: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
