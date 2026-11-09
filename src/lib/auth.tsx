import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, isApiError, rawFetch, setRefreshHandler, setRevokedHandler } from "./api";
import { session } from "./session";
import type { LoginResponse, Me, Permission, RegisterResponse, TokenPair } from "./types";

const REFRESH_KEY = "lumon.refresh";
const CHANNEL_NAME = "lumon.auth";
const LOCK_NAME = "lumon.refresh.lock";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: Me | null;
  revokedMessage: string | null;
  login: (email: string, password: string) => Promise<Me>;
  register: (teamName: string, email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  hasPermission: (permission: Permission) => boolean;
  isSupervisor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(REFRESH_KEY, token);
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function applyTokens(tokens: TokenPair): void {
  session.setTokens(tokens.accessToken, tokens.expiresIn);
  writeRefreshToken(tokens.refreshToken);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshLocked(): Promise<boolean> {
  const current = readRefreshToken();
  if (!current) return false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await rawFetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: readRefreshToken() ?? current }),
      });
    } catch {
      if (attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return false;
    }

    if (response.ok) {
      const tokens = (await response.json()) as TokenPair;
      applyTokens(tokens);
      channel?.postMessage({ type: "tokens", tokens });
      return true;
    }

    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      code = body.error ?? code;
    } catch {
      /* sin cuerpo */
    }

    if (code === "REFRESH_REUSED" || code === "SESSION_REVOKED" || code === "TOKEN_INVALID") {
      session.clear();
      writeRefreshToken(null);
      channel?.postMessage({ type: "revoked", reason: code });
      return false;
    }

    if (response.status >= 500 && attempt < 2) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    return false;
  }
  return false;
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<boolean> => {
    if (typeof navigator !== "undefined" && "locks" in navigator) {
      return navigator.locks.request(LOCK_NAME, async () => refreshLocked());
    }
    return refreshLocked();
  };

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

let channel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  channel = new BroadcastChannel(CHANNEL_NAME);
}

interface BootResult {
  me: Me | null;
  revoked: string | null;
}

let bootPromise: Promise<BootResult> | null = null;

async function boot(): Promise<BootResult> {
  if (!readRefreshToken()) return { me: null, revoked: null };
  const ok = await refreshSession();
  if (!ok) {
    return {
      me: null,
      revoked: session.getAccessToken() === null && readRefreshToken() === null ? "SESSION_REVOKED" : null,
    };
  }
  try {
    const me = await apiRequest<Me>("/auth/me");
    return { me, revoked: null };
  } catch {
    return { me: null, revoked: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setRefreshHandler(refreshSession);
    setRevokedHandler((reason) => {
      session.clear();
      writeRefreshToken(null);
      channel?.postMessage({ type: "revoked", reason });
    });
    return () => {
      mounted.current = false;
      setRefreshHandler(null);
      setRevokedHandler(null);
    };
  }, []);

  useEffect(() => {
    bootPromise ??= boot();
    let cancelled = false;
    bootPromise.then((result) => {
      if (cancelled || !mounted.current) return;
      if (result.me) {
        setUser(result.me);
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
        if (result.revoked) {
          setRevokedMessage("Tu sesión fue revocada. Inicia sesión de nuevo.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!channel) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (typeof payload !== "object" || payload === null) return;
      const record = payload as Record<string, unknown>;
      const type = record.type;
      if (type === "tokens") {
        const tokens = record.tokens as TokenPair | undefined;
        if (tokens) {
          applyTokens(tokens);
          if (mounted.current && status === "authenticated") {
            apiRequest<Me>("/auth/me")
              .then((me) => {
                if (mounted.current) setUser(me);
              })
              .catch(() => undefined);
          }
        }
      } else if (type === "logout") {
        session.clear();
        writeRefreshToken(null);
        if (mounted.current) {
          setUser(null);
          setStatus("anonymous");
        }
      } else if (type === "revoked") {
        session.clear();
        writeRefreshToken(null);
        if (mounted.current) {
          setUser(null);
          setStatus("anonymous");
          setRevokedMessage("Tu sesión fue revocada. Inicia sesión de nuevo.");
        }
      }
    };
    channel.addEventListener("message", onMessage);
    return () => channel?.removeEventListener("message", onMessage);
  }, [status]);

  const finishAuth = useCallback(async (tokens: TokenPair): Promise<Me> => {
    applyTokens(tokens);
    const me = await apiRequest<Me>("/auth/me");
    channel?.postMessage({ type: "tokens", tokens });
    setUser(me);
    setStatus("authenticated");
    setRevokedMessage(null);
    bootPromise = Promise.resolve({ me, revoked: null });
    return me;
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<Me> => {
      const response = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        anonymous: true,
        skipAuthRefresh: true,
      });
      return finishAuth(response);
    },
    [finishAuth],
  );

  const register = useCallback(
    async (teamName: string, email: string, password: string): Promise<Me> => {
      const response = await apiRequest<RegisterResponse>("/auth/register", {
        method: "POST",
        body: { teamName, email, password },
        anonymous: true,
        skipAuthRefresh: true,
      });
      return finishAuth(response);
    },
    [finishAuth],
  );

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = readRefreshToken();
    try {
      if (refreshToken) {
        await rawFetch("/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      /* el cierre local no depende del servidor */
    }
    session.clear();
    writeRefreshToken(null);
    channel?.postMessage({ type: "logout" });
    bootPromise = Promise.resolve({ me: null, revoked: null });
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await apiRequest<Me>("/auth/me");
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const hasPermission = useCallback(
    (permission: Permission): boolean => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      revokedMessage,
      login,
      register,
      logout,
      refreshMe,
      hasPermission,
      isSupervisor: user?.role.code === "SUPERVISOR",
    }),
    [status, user, revokedMessage, login, register, logout, refreshMe, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}

export function usePermission(permission: Permission): boolean {
  return useAuth().hasPermission(permission);
}

export { isApiError };
