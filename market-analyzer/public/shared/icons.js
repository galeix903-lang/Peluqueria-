/* Set de iconos propios (trazo redondeado, coherente con el sidebar) para
   sustituir los emojis en tarjetas y estados vacíos — se ven igual en
   cualquier sistema operativo y dan un aire más cuidado. */
const VANTEX_ICON_PATHS = {
  brain: '<path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5v.2A2.5 2.5 0 0 0 5 9.5v1A2.5 2.5 0 0 0 6.5 13v1.5A3.5 3.5 0 0 0 10 18h.5" /><path d="M15 4.5a2.5 2.5 0 0 1 2.5 2.5v.2a2.5 2.5 0 0 1 1.5 2.3v1a2.5 2.5 0 0 1-1.5 2.3v1.5a3.5 3.5 0 0 1-3.5 3.5h-.5" /><path d="M9 4.5V18" /><path d="M15 4.5V18" /><circle cx="12" cy="11" r="1" />',
  chartBar: '<path d="M4 20V11" /><path d="M11 20V4" /><path d="M18 20v-6" />',
  star: '<path d="M12 3.5l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 15.7l-4.9 2.8 1.1-5.5-4.1-3.8 5.6-.6L12 3.5z" />',
  wallet: '<rect x="3.5" y="6.5" width="17" height="12" rx="2.2" /><path d="M3.5 10.5h17" /><circle cx="16.5" cy="14.5" r="1" />',
  refresh: '<path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.4L19.5 8" /><path d="M19.5 4.5V8H16" /><path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.4L4.5 16" /><path d="M4.5 19.5V16H8" />',
  upload: '<path d="M12 15V4" /><path d="M8 8l4-4 4 4" /><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />',
  inbox: '<path d="M4 12l2.2-6.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4.9L20 12" /><rect x="4" y="12" width="16" height="7" rx="1.5" /><path d="M4 15h4a2.5 2.5 0 0 0 5 0h4" />',
  bolt: '<path d="M12.5 3.5 6 13h4.5l-1 7.5L18 11h-4.5l-1-7.5z" />',
  // Añadidos en el rediseño de producto: navegación, ajustes, feedback y
  // las nuevas herramientas (Wallet Tracker, Copy Trading). Consolidan
  // aquí el set que antes vivía duplicado en shared/sidebar.js.
  home: '<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9h12v-9" />',
  wand: '<path d="M15 4l5 5" /><path d="M4 20l9.5-9.5" /><path d="M14 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />',
  // Logomark propio de Vantex: una "V" cuyo trazo derecho remata en un
  // pequeño ángulo hacia arriba (mismo lenguaje visual que antes, ahora
  // formando de verdad la inicial de la marca en vez de un zigzag genérico).
  trend: '<path d="M4 7 10.5 19 20 4" /><path d="M14.5 4h5.5v5.5" />',
  settings: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />',
  close: '<path d="M6 6l12 12" /><path d="M18 6 6 18" />',
  check: '<path d="M5 12.5 9.5 17 19 7" />',
  alertTriangle: '<path d="M12 9v4.5" /><path d="M12 16.7v.1" /><path d="M10.3 3.9 2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />',
  arrowUp: '<path d="M12 19V5" /><path d="M6 11l6-6 6 6" />',
  arrowDown: '<path d="M12 5v14" /><path d="M18 13l-6 6-6-6" />',
  users: '<circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17.5" cy="9" r="2.6" /><path d="M15 13.8c2.7.2 4.7 2.2 4.7 5.2" />',
  search: '<circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" />',
  clock: '<circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />',
  shieldCheck: '<path d="M12 3.5l7 3v5.2c0 4.6-3 7.8-7 8.8-4-1-7-4.2-7-8.8V6.5l7-3z" /><path d="M9 12l2.2 2.2L15.5 9.5" />',
  chevronRight: '<path d="M9 6l6 6-6 6" />',
  more: '<circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.2" />',
  help: '<circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.8 2.8 0 1 1 3.9 2.55c-.75.32-1.1.86-1.1 1.65v.3" /><path d="M12 17v.1" />',
  // Iconos de las tarjetas del dashboard: un glifo distinto por
  // herramienta (ventana, libro, lápiz, destello) en vez de reutilizar
  // formas genéricas, para que se reconozcan de un vistazo.
  windowLayout: '<rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M3.5 9.3h17" /><circle cx="6.2" cy="7.15" r=".55" fill="currentColor" stroke="none" /><circle cx="8.1" cy="7.15" r=".55" fill="currentColor" stroke="none" />',
  book: '<path d="M12 6.8c-1.9-1.5-4.3-2.3-7-2.3v12.7c2.7 0 5.1.8 7 2.3" /><path d="M12 6.8c1.9-1.5 4.3-2.3 7-2.3v12.7c-2.7 0-5.1.8-7 2.3z" /><path d="M12 6.8v12.7" />',
  pencil: '<path d="M4 20l.9-4 10.6-10.6 3.1 3.1L8 19l-4 1z" /><path d="M13.5 6.4l3.1 3.1" />',
  sparkle: '<path d="M12 3.3c.5 3.3 1.9 5.3 5 5.9-3.1.6-4.5 2.6-5 5.9-.5-3.3-1.9-5.3-5-5.9 3.1-.6 4.5-2.6 5-5.9z" /><path d="M18.3 14.6c.2 1.5.9 2.4 2.2 2.7-1.3.3-2 1.2-2.2 2.7-.2-1.5-.9-2.4-2.2-2.7 1.3-.3 2-1.2 2.2-2.7z" />',
  // Iconos del formulario de acceso: uno por campo (usuario, email,
  // candado) y el interruptor de mostrar/ocultar contraseña.
  user: '<circle cx="12" cy="8.3" r="3.4" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7.2l8 5.8 8-5.8" />',
  lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" /><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" />',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />',
  eyeOff: '<path d="M3 3l18 18" /><path d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.2 4" /><path d="M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.5-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />',
};

function vantexIcon(name, { size = 22 } = {}) {
  const path = VANTEX_ICON_PATHS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
