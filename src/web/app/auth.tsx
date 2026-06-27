import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiClientError, request } from "../lib/api-client.js";

const TOKEN_KEY = "labops_access_token";

export type UserRole = "sales" | "logistics" | "manager";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: string[];
};

type LoginResponse = {
  access_token: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    role: UserRole;
  };
};

type MeResponse = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  permissions?: string[];
};

type AuthContextValue = {
  token: string | null;
  user: CurrentUser | null;
  initializing: boolean;
  login: (input: { username: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapUser(input: LoginResponse["user"] | MeResponse): CurrentUser {
  return {
    id: input.id,
    username: input.username,
    displayName: input.display_name,
    role: input.role,
    permissions: "permissions" in input ? input.permissions ?? [] : []
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [initializing, setInitializing] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let alive = true;

    async function restoreSession() {
      if (!token) {
        setInitializing(false);
        return;
      }

      try {
        const me = await request<MeResponse>("/me", { token });
        if (alive) {
          setUser(mapUser(me));
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          logout();
        }
      } finally {
        if (alive) {
          setInitializing(false);
        }
      }
    }

    void restoreSession();

    return () => {
      alive = false;
    };
  }, [logout, token]);

  const login = useCallback(async (input: { username: string; password: string }) => {
    const result = await request<LoginResponse>("/auth/login", {
      method: "POST",
      body: input
    });
    localStorage.setItem(TOKEN_KEY, result.access_token);
    setToken(result.access_token);
    const me = await request<MeResponse>("/me", { token: result.access_token });
    setUser(mapUser(me));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    initializing,
    login,
    logout
  }), [initializing, login, logout, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
