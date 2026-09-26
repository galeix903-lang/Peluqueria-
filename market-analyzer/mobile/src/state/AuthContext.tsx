import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, ApiError } from '../services/api';
import { getTokens, saveTokens, clearTokens } from '../services/authStorage';

export type User = {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  avatar: string | null;
  balance: number;
  plan: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sesión persistente: al abrir la app, si ya había un refresh token
  // guardado de una sesión anterior, /api/auth/me (con el refresco
  // automático de api.ts si el access token ya caducó) confirma quién
  // es sin pedirle el email/contraseña otra vez.
  useEffect(() => {
    (async () => {
      const { accessToken, refreshToken } = await getTokens();
      if (!accessToken && !refreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await api.get('/api/auth/me');
        setUser(data.user);
      } catch {
        await clearTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    const data = await api.post('/api/auth/mobile/signup', { email, password, name });
    await saveTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post('/api/auth/mobile/login', { email, password });
    await saveTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = await getTokens();
    if (refreshToken) {
      await api.post('/api/auth/mobile/logout', { refreshToken }).catch(() => {});
    }
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export { ApiError };
