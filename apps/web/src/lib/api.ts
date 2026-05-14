const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface User {
  id: string;
  email: string;
  pen_name: string;
  avatar_url?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError("API not configured", 0);

  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail ?? "Something went wrong", res.status);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<AuthTokens>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    register: (pen_name: string, email: string, password: string) =>
      request<AuthTokens>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ pen_name, email, password }),
      }),

    google: (id_token: string) =>
      request<AuthTokens>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ id_token }),
      }),

    logout: (token: string) =>
      request("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
  },
};
