import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type KindPillColors = {
  backgroundColor: string
  color: string
}

/** Stable hue from kind; fixed S/L stays dark enough for theme foreground on pills. */
export const getKindPillColors = (kind: number): KindPillColors => {
  const k = Number.isFinite(kind) ? Math.trunc(kind) : 0
  const h = ((k * 2654435761) >>> 0) % 360
  return {
    backgroundColor: `hsl(${h} 52% 40%)`,
    color: "var(--mantine-color-white)",
  }
}
