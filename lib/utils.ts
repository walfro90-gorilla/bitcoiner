// lib/utils.ts — helper de clases CSS (sin dependencias externas).
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
