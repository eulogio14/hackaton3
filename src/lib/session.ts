const ACCESS_KEY = "lumon.access";

function storedAccessToken(): string | null {
  try {
    return window.localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = storedAccessToken();
let expiresAt = 0;

export const session = {
  getAccessToken(): string | null {
    return accessToken;
  },
  getExpiresAt(): number {
    return expiresAt;
  },
  setTokens(token: string, expiresIn: number): void {
    accessToken = token;
    expiresAt = Date.now() + Math.max(1, expiresIn) * 1000;
    try {
      window.localStorage.setItem(ACCESS_KEY, token);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  clear(): void {
    accessToken = null;
    expiresAt = 0;
    try {
      window.localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === ACCESS_KEY) {
      accessToken = event.newValue;
      expiresAt = 0;
    }
  });
}
