import type { Bin, BinChar } from "./types";

export const BINS: Bin[] = ["WO", "FC", "DR", "MA"];

export const BIN_LABEL: Record<Bin, string> = {
  WO: "WO",
  FC: "FC",
  DR: "DR",
  MA: "MA",
};

export const BIN_NAME: Record<Bin, string> = {
  WO: "Woe",
  FC: "Frolic",
  DR: "Dread",
  MA: "Malice",
};

export const BIN_CHAR: Record<Bin, BinChar> = {
  WO: "W",
  FC: "F",
  DR: "D",
  MA: "M",
};

export function binFromChar(char: string): Bin | null {
  switch (char) {
    case "W":
      return "WO";
    case "F":
      return "FC";
    case "D":
      return "DR";
    case "M":
      return "MA";
    default:
      return null;
  }
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
