/**
 * Single source of truth for environment-aware guards.
 * Vite replaces import.meta.env.DEV at build time, so dead branches
 * are tree-shaken out of the production bundle.
 */
export const isDev = import.meta.env.DEV;
