/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_LEKKA_API_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
