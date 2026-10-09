/*
  Paleta portada 1:1 desde public/shared/style.css (:root) — misma fuente
  de verdad que la web, para que la identidad de Cryptolyzer no diverja entre
  plataformas. Si cambias un color aquí, cámbialo también allí (y
  viceversa) hasta que exista un paquete de design tokens compartido.
*/
export const colors = {
  bg: '#ffffff',
  surface: '#ffffff',
  fieldBg: '#f6f6fa',
  border: '#ececf1',
  borderStrong: '#e0e0e8',
  text: '#14162b',
  textDim: '#71758d',
  accent: '#4f46e5',
  accentDim: '#eef0fd',
  blue: '#2563eb',
  blueBright: '#3b82f6',
  blueBg: '#eaf1ff',
  green: '#16a34a',
  greenBg: '#eafbef',
  red: '#dc2626',
  redBg: '#fdecec',
  amber: '#b45309',
  amberBg: '#fef3e0',
} as const;

export const radius = {
  md: 18,
  lg: 22,
  pill: 999,
} as const;

export const gradients = {
  // Mismo degradado que el logomark y los tiles de marca en la web
  // (.sidebar__logo, favicon, auth-card__brand-mark).
  brand: ['#6366f1', '#3b82f6'] as const,
};
