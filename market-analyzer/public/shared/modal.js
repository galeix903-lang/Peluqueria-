/*
  Modal genérico y reutilizable: openModal({ title, bodyHtml, footerHtml,
  onOpen }) -> función close(). Backdrop + ESC cierran, devuelve el foco
  al elemento que abrió el modal, respeta prefers-reduced-motion (la
  regla global de style.css ya reduce las duraciones de transición).
*/
let activeModal = null;

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

function onKeydownModal(e) {
  if (e.key === 'Escape') closeModal();
}

function openModal({ title, bodyHtml = '', footerHtml = '', onOpen, onClose } = {}) {
  if (activeModal) closeModal();
  const trigger = document.activeElement;

  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-panel reveal-pop" role="dialog" aria-modal="true" aria-label="${title || ''}">
      <div class="modal-panel__head">
        <h2 class="text-h3">${title || ''}</h2>
        <button class="modal-panel__close" type="button" data-modal-close aria-label="Cerrar">${vantexIcon('close', { size: 16 })}</button>
      </div>
      <div class="modal-panel__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-panel__footer">${footerHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('is-in'));

  root.addEventListener('mousedown', (e) => { if (e.target === root) closeModal(); });
  root.querySelector('[data-modal-close]').addEventListener('click', () => closeModal());
  document.addEventListener('keydown', onKeydownModal);

  activeModal = { root, trigger, onClose };
  if (typeof onOpen === 'function') onOpen(root);
  return closeModal;
}

window.openModal = openModal;
window.closeModal = closeModal;
