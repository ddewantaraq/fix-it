/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Set to "true" to allow Type instead on yes_no / enum Q&A chips. */
  readonly VITE_ENABLE_FREE_TEXT_ANSWERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
