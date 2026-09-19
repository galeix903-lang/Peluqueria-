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
};

function vantexIcon(name, { size = 22 } = {}) {
  const path = VANTEX_ICON_PATHS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
