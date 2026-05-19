"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, ApiError, type User } from "@/lib/api";

// ── Mock fallback (used when NEXT_PUBLIC_API_URL is not set) ─────────────────

const MOCK_DELAY = 800;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mockLogin(email: string, _password: string) {
  await delay(MOCK_DELAY);
  return {
    access_token: `mock.${btoa(email)}.token`,
    refresh_token: "mock-refresh",
    user: { id: "mock-" + Math.random().toString(36).slice(2), email, pen_name: email.split("@")[0] } satisfies User,
  };
}

async function mockRegister(pen_name: string, email: string, _password: string) {
  await delay(MOCK_DELAY);
  return {
    access_token: `mock.${btoa(email)}.token`,
    refresh_token: "mock-refresh",
    user: { id: "mock-" + Math.random().toString(36).slice(2), email, pen_name } satisfies User,
  };
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const TOKEN_KEY = "sb_token";
const REFRESH_KEY = "sb_refresh";
const USER_KEY = "sb_user";

// Cookie helpers — used by middleware for route protection (not httpOnly, just presence check)
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; SameSite=Strict; max-age=${60 * 60 * 24 * 30}`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isMock: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (penName: string, email: string, password: string) => Promise<void>;
  googleLogin: (accessToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMock = !process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((accessToken: string, refreshToken: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setCookie(TOKEN_KEY, "1"); // presence flag for middleware
    setToken(accessToken);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = isMock
      ? await mockLogin(email, password)
      : await api.auth.login(email, password);
    persist(result.access_token, result.refresh_token, result.user);
  }, [isMock, persist]);

  const register = useCallback(async (penName: string, email: string, password: string) => {
    const result = isMock
      ? await mockRegister(penName, email, password)
      : await api.auth.register(penName, email, password);
    persist(result.access_token, result.refresh_token, result.user);
  }, [isMock, persist]);

  const googleLogin = useCallback(async (accessToken: string) => {
    const result = await api.auth.google(accessToken);
    persist(result.access_token, result.refresh_token, result.user);
  }, [persist]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken && !isMock) {
      api.auth.logout(refreshToken).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    clearCookie(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [isMock]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isMock, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { ApiError };
