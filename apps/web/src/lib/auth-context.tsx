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
// Remove this block once the backend is running.

const MOCK_DELAY = 800;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mockLogin(email: string, _password: string) {
  await delay(MOCK_DELAY);
  return {
    access_token: `mock.${btoa(email)}.token`,
    refresh_token: "mock-refresh",
    user: {
      id: "mock-" + Math.random().toString(36).slice(2),
      email,
      pen_name: email.split("@")[0],
    } satisfies User,
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
const USER_KEY = "sb_user";

// ── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isMock: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (penName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMock = !process.env.NEXT_PUBLIC_API_URL;

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      // corrupted storage — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = isMock
      ? await mockLogin(email, password)
      : await api.auth.login(email, password);
    persist(result.access_token, result.user);
  }, [isMock, persist]);

  const register = useCallback(
    async (penName: string, email: string, password: string) => {
      const result = isMock
        ? await mockRegister(penName, email, password)
        : await api.auth.register(penName, email, password);
      persist(result.access_token, result.user);
    },
    [isMock, persist]
  );

  const logout = useCallback(() => {
    if (token && !isMock) {
      api.auth.logout(token).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, [token, isMock]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isMock, login, register, logout }}>
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
