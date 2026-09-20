/*
  Sistema de notificaciones ligero: showToast({type, message}) apila un
  aviso en la esquina inferior derecha (arriba-derecha en móvil, para no
  tapar la bottom nav) y lo retira solo. Sin dependencias, reutilizado en
  cualquier página que quiera dar feedback de una acción real
  ("Análisis completado", "Operación abierta", errores legibles...).
*/
let toastRegion;

function ensureToastRegion() {
  if (toastRegion) return toastRegion;
  toastRegion = document.createElement('div');
  toastRegion.className = 'toast-region';
  toastRegion.setAttribute('role', 'status');
  toastRegion.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastRegion);
  return toastRegion;
}

const TOAST_ICONS = {
  success: 'check',
  error: 'alertTriangle',
  info: 'clock',
};

function showToast({ type = 'info', message, duration = 3800 } = {}) {
  if (!message) return;
  const region = ensureToastRegion();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${vantexIcon(TOAST_ICONS[type] || 'clock', { size: 16 })}</span>
    <span class="toast__msg"></span>
    <button class="toast__close" type="button" aria-label="Cerrar aviso">${vantexIcon('close', { size: 13 })}</button>
  `;
  el.querySelector('.toast__msg').textContent = message;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  let timer;
  const remove = () => {
    clearTimeout(timer);
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  };
  timer = setTimeout(remove, duration);
  el.querySelector('.toast__close').addEventListener('click', remove);
}

window.showToast = showToast;
