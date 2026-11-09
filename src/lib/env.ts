function required(name: string, fallback?: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Falta la variable de entorno ${name}`);
}

export const env = {
  apiBaseUrl: required("VITE_API_BASE_URL", "https://lumon-api.vercel.app/api/v1").replace(/\/$/, ""),
  wsBaseUrl: required("VITE_WS_BASE_URL", "wss://lumon-api.vercel.app/api/v1").replace(/\/$/, ""),
  build: (import.meta.env.VITE_LUMON_BUILD ?? __LUMON_BUILD__ ?? "dev").trim() || "dev",
  storageProvider: (import.meta.env.VITE_STORAGE_PROVIDER ?? "SUPABASE").toUpperCase(),
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  cloudinaryCloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? "",
} as const;

export function apiUrl(path: string): string {
  return `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
