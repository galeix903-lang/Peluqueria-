/*
  Modal genérico y reutilizable: openModal({ title, bodyHtml, footerHtml,
  onOpen }) -> función close(). Backdrop + ESC cierran, devuelve el foco
  al elemento que abrió el modal, respeta prefers-reduced-motion (la
  regla global de style.css ya reduce las duraciones de transición).
*/
let activeModal = null;

// Elementos que pueden recibir foco de teclado dentro del panel — misma
// lista que se usa para decidir dónde "rebota" el Tab.
function getFocusable(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null);
}

function closeModal() {
  if (!activeModal) return;
  const { root, trigger, onClose } = activeModal;
  root.classList.remove('is-in');
  document.removeEventListener('keydown', onKeydownModal);
  const cleanup = () => root.remove();
  root.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 300); // por si prefers-reduced-motion salta el transitionend
  if (trigger && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
  activeModal = null;
  if (typeof onClose === 'function') onClose();
}

// Con el modal abierto, el foco no debe poder salir de él con Tab — si no,
// alguien navegando solo con teclado acaba interactuando con la página de
// detrás, que está atenuada e invisible. Esto atrapa el foco dentro del
// panel (patrón estándar de diálogo modal) y lo trae de vuelta si por lo
// que sea ya se había escapado.
function onKeydownModal(e) {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab' || !activeModal) return;
  const panel = activeModal.root.querySelector('.modal-panel');
  const focusable = getFocusable(panel);
  if (!focusable.length) { e.preventDefault(); panel.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!panel.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openModal({ title, bodyHtml = '', footerHtml = '', onOpen, onClose } = {}) {
  if (activeModal) closeModal();
  const trigger = document.activeElement;

  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-panel reveal-pop" role="dialog" aria-modal="true" aria-label="${title || ''}" tabindex="-1">
      <div class="modal-panel__head">
        <h2 class="text-h3">${title || ''}</h2>
        <button class="modal-panel__close" type="button" data-modal-close aria-label="Cerrar">${vantexIcon('close', { size: 16 })}</button>
      </div>
      <div class="modal-panel__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-panel__footer">${footerHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(root);
  requestAnimationFrame(() => {
    root.classList.add('is-in');
    const panel = root.querySelector('.modal-panel');
    const focusable = getFocusable(panel);
    (focusable[0] || panel).focus({ preventScroll: true });
  });

  root.addEventListener('mousedown', (e) => { if (e.target === root) closeModal(); });
  root.querySelector('[data-modal-close]').addEventListener('click', () => closeModal());
  document.addEventListener('keydown', onKeydownModal);

  activeModal = { root, trigger, onClose };
  if (typeof onOpen === 'function') onOpen(root);
  return closeModal;
}

window.openModal = openModal;
window.closeModal = closeModal;
