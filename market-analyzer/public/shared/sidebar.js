/*
  Pinta el sidebar + la barra superior en cada página protegida, y hace de
  guardia de sesión: si /api/auth/me devuelve 401, redirige a /login antes
  de mostrar nada. Cada página solo necesita:
    <div data-app-shell data-page="dashboard"></div>
  y llamar a mountShell({ title: '...', content: elementoOContenidoHTML }).
*/
// Cada herramienta lleva el mismo color que su tarjeta en el dashboard,
// para que el sidebar funcione como un mini-mapa de "logos" reconocibles
// en vez de iconos grises sin identidad.
// `bottom: false` mantiene una herramienta fuera de la bottom nav móvil
// (que se queda con 5 accesos para no saturarla) sin dejar de mostrarla
// en el sidebar de escritorio, que sí tiene sitio de sobra.
const NAV_ITEMS = [
  { page: 'dashboard', href: '/dashboard', label: 'Inicio', shortLabel: 'Inicio', icon: 'home', gradient: 'linear-gradient(135deg, #4f46e5, #7c72f0)', bottom: true },
  { page: 'analyzer', href: '/analyzer', label: 'AI Analyzer', shortLabel: 'Analyzer', icon: 'wand', gradient: 'linear-gradient(135deg, #4f46e5, #7c72f0)', bottom: true },
  { page: 'trading', href: '/trading', label: 'Paper Trading', shortLabel: 'Trading', icon: 'chartBar', gradient: 'linear-gradient(135deg, #f97316, #ef4444)', bottom: true },
  { page: 'picks', href: '/picks', label: 'Handpicked Bets', shortLabel: 'Picks', icon: 'star', gradient: 'linear-gradient(135deg, #f59e0b, #f97316)', bottom: true },
  { page: 'wallet', href: '/wallet', label: 'Wallet Tracker', shortLabel: 'Wallet', icon: 'wallet', gradient: 'linear-gradient(135deg, #0ea5e9, #22d3ee)', bottom: false },
  { page: 'copy', href: '/copy', label: 'Copy Trading', shortLabel: 'Copy', icon: 'refresh', gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)', bottom: false },
];

// El set de iconos vive en shared/icons.js (vantexIcon) — antes había un
// set duplicado aquí, unificado en el rediseño de producto.
function icon(name) {
  return vantexIcon(name, { size: 24 });
}

async function mountShell({ page, title }) {
  const root = document.querySelector('[data-app-shell]');
  let user;
  try {
    ({ user } = await api('/auth/me'));
  } catch (e) {
    window.location.href = '/login';
    return null;
  }

  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <a class="sidebar__logo" href="/dashboard" title="Vantex">${icon('trend')}</a>
        <nav class="sidebar__nav">
          ${NAV_ITEMS.map((item) => `
            <a class="sidebar__link ${item.page === page ? 'is-active' : ''}" href="${item.href}" style="--link-gradient:${item.gradient};" data-label="${item.label}" aria-label="${item.label}">
              ${icon(item.icon)}
            </a>
          `).join('')}
        </nav>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1>${title}</h1>
          <div class="topbar__user">
            <span class="topbar__status" data-connection title="Estado de conexión">
              <span class="status-dot" data-connection-dot></span>
              <span data-connection-text>En línea</span>
            </span>
            <span class="topbar__clock" data-clock></span>
            ${user.plan === 'pro'
              ? '<span class="badge" style="background:#fef3e0; color:#b45309;" data-plan-badge title="Gestionar suscripción">★ PRO</span>'
              : '<button class="btn-primary" data-upgrade-btn>Upgrade!</button>'}
            <span class="topbar__name">${escapeHtml(user.name)}</span>
            <span class="avatar" title="${escapeHtml(user.name)}">${escapeHtml(user.name.charAt(0).toUpperCase())}</span>
            <button class="topbar__icon-btn" type="button" data-settings-btn aria-label="Ajustes">${icon('settings')}</button>
            <button class="btn-logout" data-logout>Cerrar sesión</button>
          </div>
        </div>
        <div class="content" data-shell-content></div>
      </div>
      <nav class="bottom-nav" data-bottom-nav aria-label="Navegación">
        ${NAV_ITEMS.filter((item) => item.bottom).map((item) => `
          <a class="bottom-nav__link ${item.page === page ? 'is-active' : ''}" href="${item.href}" aria-label="${item.label}">
            ${icon(item.icon)}<span>${item.shortLabel}</span>
          </a>
        `).join('')}
        <button class="bottom-nav__link" type="button" data-settings-btn aria-label="Ajustes">
          ${icon('settings')}<span>Ajustes</span>
        </button>
      </nav>
    </div>
  `;

  root.querySelectorAll('[data-logout]').forEach((btn) => btn.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }));

  const upgradeBtn = root.querySelector('[data-upgrade-btn]');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      upgradeBtn.disabled = true;
      upgradeBtn.innerHTML = '<span class="spinner"></span> Un momento…';
      try {
        const { url } = await api('/billing/checkout', { method: 'POST' });
        window.location.href = url;
      } catch (e) {
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = 'Upgrade!';
      }
    });
  }
  const planBadge = root.querySelector('[data-plan-badge]');
  if (planBadge) {
    planBadge.style.cursor = 'pointer';
    planBadge.addEventListener('click', async () => {
      const { url } = await api('/billing/portal', { method: 'POST' });
      window.location.href = url;
    });
  }

  setupConnectionIndicator(root);
  setupClock(root);
  root.querySelectorAll('[data-settings-btn]').forEach((btn) => btn.addEventListener('click', () => openSettingsModal(user, root)));

  return { user, contentEl: root.querySelector('[data-shell-content]') };
}

// Dato real (no decorativo): reacciona a los eventos online/offline del
// propio navegador, con el estado inicial de navigator.onLine.
function setupConnectionIndicator(root) {
  const dot = root.querySelector('[data-connection-dot]');
  const text = root.querySelector('[data-connection-text]');
  function render() {
    const online = navigator.onLine;
    dot.classList.toggle('is-offline', !online);
    text.textContent = online ? 'En línea' : 'Sin conexión';
  }
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
}

function setupClock(root) {
  const el = root.querySelector('[data-clock]');
  function render() {
    el.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  render();
  // Un setInterval fijo se desincroniza: los navegadores ralentizan los
  // temporizadores en pestañas en segundo plano, así que al volver el
  // reloj podía quedarse atrasado hasta el siguiente tick. En vez de eso,
  // cada tick se programa justo para el próximo cambio de minuto exacto
  // (autocorrección continua, sin arrastrar retraso), y además se
  // refresca al instante en cuanto la pestaña vuelve a primer plano.
  let timer;
  function scheduleNextTick() {
    const msToNextMinute = 60000 - (Date.now() % 60000);
    timer = setTimeout(() => { render(); scheduleNextTick(); }, msToNextMinute);
  }
  scheduleNextTick();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { clearTimeout(timer); render(); scheduleNextTick(); }
  });
  window.addEventListener('focus', render);
}

function openSettingsModal(user, root) {
  openModal({
    title: 'Ajustes',
    bodyHtml: `
      <div class="field">
        <label for="settings-name">Nombre</label>
        <input id="settings-name" type="text" value="${escapeHtml(user.name)}" maxlength="60" />
      </div>
      <p class="text-caption" style="margin:0 0 14px;">
        Plan actual: <strong style="color:var(--text);">${user.plan === 'pro' ? 'Vantex Pro ★' : 'Gratuito'}</strong>
      </p>
      <button type="button" class="btn-secondary" data-settings-billing style="width:100%; justify-content:center;">
        ${user.plan === 'pro' ? 'Gestionar suscripción' : 'Hazte Pro por 4,99€/mes'}
      </button>
      <p class="error-msg" data-settings-error></p>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn-primary" data-settings-save>Guardar</button>
    `,
    onOpen: (modalRoot) => {
      const nameInput = modalRoot.querySelector('#settings-name');
      const errorEl = modalRoot.querySelector('[data-settings-error]');
      const saveBtn = modalRoot.querySelector('[data-settings-save]');
      nameInput.focus({ preventScroll: true });
      nameInput.select();

      saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        errorEl.textContent = '';
        if (!name) { errorEl.textContent = 'El nombre no puede estar vacío.'; return; }
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Guardando…';
        try {
          await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });
          root.querySelectorAll('.topbar__name').forEach((el) => { el.textContent = name; });
          root.querySelectorAll('.avatar').forEach((el) => { el.textContent = name.charAt(0).toUpperCase(); el.title = name; });
          user.name = name;
          showToast({ type: 'success', message: 'Ajustes guardados.' });
          closeModal();
        } catch (err) {
          errorEl.textContent = err.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Guardar';
        }
      });

      modalRoot.querySelector('[data-settings-billing]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="border-color:rgba(0,0,0,.15); border-top-color:var(--text-dim);"></span>';
        try {
          const endpoint = user.plan === 'pro' ? '/billing/portal' : '/billing/checkout';
          const { url } = await api(endpoint, { method: 'POST' });
          window.location.href = url;
        } catch (err) {
          btn.disabled = false;
          showToast({ type: 'error', message: err.message });
        }
      });
    },
  });
}
