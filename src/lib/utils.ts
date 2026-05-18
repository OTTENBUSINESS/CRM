import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { NavigateFunction } from "react-router-dom";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Navigate handler that supports Ctrl+Click / Cmd+Click to open in new tab.
 * Use instead of `onClick={() => navigate(path)}`.
 * Usage: `onClick={(e) => navigateTo(e, path, navigate)}`
 */
export function navigateTo(e: React.MouseEvent, path: string, navigate: NavigateFunction) {
  if (e.ctrlKey || e.metaKey || e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    window.open(path, '_blank');
  } else {
    navigate(path);
  }
}

/**
 * Normaliza uma URL garantindo que tenha protocolo (https://).
 * Útil para meeting_link que pode vir como "meet.google.com/xyz" sem https://
 */
export function ensureHttps(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}
