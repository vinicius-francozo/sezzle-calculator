/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the calculator API. Defaults to a same-origin `/api`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
