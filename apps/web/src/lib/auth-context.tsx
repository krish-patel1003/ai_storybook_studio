"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, ApiError, type User } from "@/lib/api";

// Access token lifetime in ms — must match JWT_EXP on the server (default 15 min).
// We refresh proactively 2 minutes before expiry.
const ACCESS_TOKEN_MS = 15 * 60 * 1000;
const REFRESH_BEFORE_MS = 2 * 60 * 1000;

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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((onRefresh: () => void) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = ACCESS_TOKEN_MS - REFRESH_BEFORE_MS;
    refreshTimerRef.current = setTimeout(onRefresh, delay);
  }, []);

  const persist = useCallback((accessToken: string, refreshToken: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setCookie(TOKEN_KEY, accessToken); // stored for middleware JWT expiry check
    setToken(accessToken);
    setUser(u);
  }, []);

  // Attempt a silent token refresh using the stored refresh token.
  // On success: updates tokens in storage + state and reschedules.
  // On failure: clears the session so the user is directed to sign in.
  const silentRefresh = useCallback(async (): Promise<boolean> => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh || isMock) return false;
    try {
      const result = await api.auth.refresh(storedRefresh);
      persist(result.access_token, result.refresh_token, result.user);
      return true;
    } catch {
      // Refresh token expired or revoked — clear everything
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
      clearCookie(TOKEN_KEY);
      setToken(null);
      setUser(null);
      return false;
    }
  }, [isMock, persist]);

  // On mount: try to use a stored refresh token to get a fresh access token
  // so the user never hits a stale-token error after a page reload.
  useEffect(() => {
    const savedUser = localStorage.getItem(USER_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);

    if (!isMock && refreshToken && savedUser) {
      // Show the cached user immediately to avoid a loading flash, then
      // silently upgrade to a fresh token in the background.
      try { setUser(JSON.parse(savedUser)); } catch { /* ignore */ }
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (savedToken) setToken(savedToken);

      silentRefresh().finally(() => setIsLoading(false));
    } else {
      // No refresh token — restore from localStorage as before
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the token changes, schedule the next proactive refresh
  useEffect(() => {
    if (!token || isMock) return;
    scheduleRefresh(() => { silentRefresh(); });
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [token, isMock, scheduleRefresh, silentRefresh]);

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
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
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
