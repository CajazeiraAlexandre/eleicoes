/**
 * tokens.js — leitura dos design tokens do design system ativo (design/<ds>/tokens.css).
 * Uso: import { token, paleta } from "../../../../web/componentes/tokens.js";
 *      const cores = paleta("cat", 8);  // ["#2563eb", ...]
 */
export function token(nome, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(`--${nome}`).trim();
}

export function paleta(tipo, n) {
  return Array.from({ length: n }, (_, i) => token(`cor-${tipo}-${i + 1}`)).filter(Boolean);
}
