let accessToken: string | null = null;
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
  },
  clear(): void {
    accessToken = null;
    expiresAt = 0;
  },
};
