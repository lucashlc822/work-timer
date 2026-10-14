/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Supabase project's API URL. Absent in an unconfigured build. */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * The project's publishable (anon) key. Safe to ship in the bundle: row-level
   * security, not this key, is what protects each user's data.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** `package.json`'s version, substituted at build time (see `vite.config.ts`). */
declare const __APP_VERSION__: string;
