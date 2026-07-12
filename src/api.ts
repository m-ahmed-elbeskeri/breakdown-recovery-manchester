// Base URL of the backend API. Defaults to the local dev server; set
// VITE_API_URL for staging/production (e.g. your deployed FastAPI URL).
export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(
  /\/+$/,
  '',
);
