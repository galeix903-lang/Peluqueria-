import { getTokens, saveTokens, clearTokens } from './authStorage';

/*
  URL del backend real de Cryptolyzer (mismo servidor Express que la web,
  endpoints /api/auth/mobile/*). Configurable por variable de entorno
  EXPO_PUBLIC_* (Expo la inlinea en el bundle del cliente) para poder
  apuntar a un backend local durante el desarrollo; por defecto apunta
  al backend ya desplegado en producción.
*/
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://vantex.onrender.com';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<string | null> | null = null;

// Si el access token ya caducó, intenta canjear el refresh token UNA vez
// (nunca en paralelo: si diez peticiones fallan a la vez por el mismo
// access token caducado, todas comparten el mismo intento de refresco
// en vez de gastar diez refresh tokens de golpe).
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken } = await getTokens();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/mobile/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await clearTokens();
        return null;
      }
      const data = await res.json();
      await saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  })();
  const result = await refreshPromise;
  refreshPromise = null;
  return result;
}

async function request(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const { accessToken } = await getTokens();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (err) {
    throw new ApiError('Sin conexión. Comprueba tu internet e inténtalo de nuevo.', 0);
  }

  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request(path, options, false);
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    throw new ApiError((data && data.error) || 'Ha ocurrido un error inesperado.', res.status);
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: (path: string, body?: unknown) => request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  // Para subir la imagen del gráfico: el FormData ya trae su propio
  // Content-Type con el boundary del multipart, así que request() no debe
  // tocarlo (ver el chequeo isFormData ahí dentro).
  postForm: (path: string, formData: FormData) => request(path, { method: 'POST', body: formData as any }),
};
