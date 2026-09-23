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
  { page: 'dashboard', href: '/dashboard', label: 'Inicio', shortLabel: 'Inicio', icon: 'home', gradient: 'linear-gradient(135deg, var(--accent), var(--blue))', bottom: true },
  { page: 'analyzer', href: '/analyzer', label: 'AI Analyzer', shortLabel: 'Analyzer', icon: 'wand', gradient: 'linear-gradient(135deg, var(--accent), var(--blue))', bottom: true },
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

// Devuelve el contenido de un <span class="avatar">: la foto si el
// usuario tiene una, o su inicial como hasta ahora.
function avatarInnerHtml(user) {
  if (user.avatar) return `<img src="${user.avatar}" alt="" />`;
  return escapeHtml(user.name.charAt(0).toUpperCase());
}

// Redimensiona/recorta la imagen elegida a un cuadrado pequeño en el
// propio navegador (canvas) antes de subirla — así nunca se manda una
// foto de varios MB al servidor, solo un avatar ya listo para usar.
function resizeImageToDataUrl(file, size = 160, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    reader.readAsDataURL(file);
  });
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
              : user.plan === 'plus'
              ? '<span class="badge" style="background:#eef2ff; color:var(--accent);" data-plan-badge title="Gestionar suscripción">PLUS</span>'
              : '<button class="btn-primary" data-upgrade-btn>Upgrade!</button>'}
            <span class="topbar__name">${escapeHtml(user.name)}</span>
            <button type="button" class="avatar-btn" data-avatar-btn aria-label="Ver perfil de ${escapeHtml(user.name)}">
              <span class="avatar" title="${escapeHtml(user.name)}">${avatarInnerHtml(user)}</span>
            </button>
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
    upgradeBtn.addEventListener('click', () => openUpgradeModal());
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
  setupTabAttentionTitle();
  root.querySelectorAll('[data-settings-btn]').forEach((btn) => btn.addEventListener('click', () => openSettingsModal(user, root)));
  root.querySelectorAll('[data-avatar-btn]').forEach((btn) => btn.addEventListener('click', () => openProfileCard(user, root)));

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

// Cambia el título de la pestaña cuando el usuario se va a otra pestaña
// (visibilitychange), para animarle a volver — se restaura el título
// original de la página en cuanto la pestaña vuelve a primer plano.
function setupTabAttentionTitle() {
  const originalTitle = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? '😢 Por favor, vuelve' : originalTitle;
  });
}

// Se abre al tocar/pulsar la foto de perfil de la topbar — una tarjeta
// rápida de "quién soy" (como al tocar el avatar en Twitter/X), con
// cambio de foto directo desde aquí y accesos a la edición completa y
// al cierre de sesión, sin tener que pasar primero por Ajustes.
function openProfileCard(user, root) {
  openModal({
    title: 'Perfil',
    bodyHtml: `
      <div class="profile-card">
        <div class="profile-card__avatar-wrap">
          <span class="avatar profile-card__avatar" data-profile-card-avatar>${avatarInnerHtml(user)}</span>
          <button type="button" class="profile-card__avatar-edit" data-profile-card-avatar-pick aria-label="Cambiar foto de perfil">${vantexIcon('camera', { size: 14 })}</button>
          <input type="file" accept="image/*" data-profile-card-avatar-input hidden />
        </div>
        <h3 class="profile-card__name">${escapeHtml(user.name)}</h3>
        <p class="profile-card__email text-caption">${escapeHtml(user.email)}</p>
        <p class="profile-card__bio ${user.bio ? '' : 'profile-card__bio--empty'}">${user.bio ? escapeHtml(user.bio) : 'Todavía no has añadido una biografía.'}</p>
        <span class="badge" style="${user.plan === 'pro' ? 'background:#fef3e0; color:#b45309;' : user.plan === 'plus' ? 'background:#eef2ff; color:var(--accent);' : 'background:var(--field-bg); color:var(--text-dim);'}">${user.plan === 'pro' ? '★ Vantex Pro' : user.plan === 'plus' ? 'Vantex Plus' : 'Plan gratuito'}</span>
      </div>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" data-profile-card-logout>Cerrar sesión</button>
      <button type="button" class="btn-primary" data-profile-card-edit>Editar perfil</button>
    `,
    onOpen: (modalRoot) => {
      const avatarEl = modalRoot.querySelector('[data-profile-card-avatar]');
      const avatarInput = modalRoot.querySelector('[data-profile-card-avatar-input]');
      modalRoot.querySelector('[data-profile-card-avatar-pick]').addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        try {
          const dataUrl = await resizeImageToDataUrl(file);
          const { user: updated } = await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ avatar: dataUrl }) });
          Object.assign(user, updated);
          avatarEl.innerHTML = avatarInnerHtml(updated);
          root.querySelectorAll('.avatar').forEach((el) => { el.innerHTML = avatarInnerHtml(updated); el.title = updated.name; });
          showToast({ type: 'success', message: 'Foto de perfil actualizada.' });
        } catch (err) {
          showToast({ type: 'error', message: err.message || 'No se pudo actualizar la foto.' });
        }
      });
      modalRoot.querySelector('[data-profile-card-edit]').addEventListener('click', () => {
        closeModal();
        openSettingsModal(user, root);
      });
      modalRoot.querySelector('[data-profile-card-logout]').addEventListener('click', async () => {
        await api('/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      });
    },
  });
}

// Modal con los dos planes de pago (Plus y Pro) uno junto al otro; se abre
// desde el botón "Upgrade!" de la topbar, desde Ajustes, y desde los
// mensajes de upsell del AI Analyzer y de Copy Trading.
function openUpgradeModal() {
  openModal({
    title: 'Mejora tu plan',
    bodyHtml: `
      <div class="upgrade-plans">
        <div class="upgrade-plan">
          <div class="upgrade-plan__head"><strong>Vantex Plus</strong><span class="upgrade-plan__price">1€<span>/mes</span></span></div>
          <ul class="upgrade-plan__list">
            <li>${vantexIcon('check', { size: 16 })} 15 análisis con IA al día</li>
            <li>${vantexIcon('check', { size: 16 })} Copy Trading simulado</li>
            <li>${vantexIcon('check', { size: 16 })} Todo lo del plan gratis</li>
          </ul>
          <button type="button" class="btn-secondary" style="width:100%; justify-content:center;" data-upgrade-plan="plus">Elegir Plus</button>
        </div>
        <div class="upgrade-plan upgrade-plan--pro">
          <div class="upgrade-plan__head"><strong>Vantex Pro</strong><span class="upgrade-plan__price">4,99€<span>/mes</span></span></div>
          <ul class="upgrade-plan__list">
            <li>${vantexIcon('check', { size: 16 })} Análisis con IA ilimitados</li>
            <li>${vantexIcon('check', { size: 16 })} Copy Trading simulado</li>
            <li>${vantexIcon('check', { size: 16 })} Todo lo del plan gratis</li>
          </ul>
          <button type="button" class="btn-primary" style="width:100%; justify-content:center;" data-upgrade-plan="pro">Elegir Pro</button>
        </div>
      </div>
      <p class="error-msg" data-upgrade-error></p>
    `,
    onOpen: (modalRoot) => {
      modalRoot.querySelectorAll('[data-upgrade-plan]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const plan = btn.dataset.upgradePlan;
          const errorEl = modalRoot.querySelector('[data-upgrade-error]');
          errorEl.textContent = '';
          btn.disabled = true;
          const defaultHtml = btn.innerHTML;
          btn.innerHTML = '<span class="spinner"></span> Un momento…';
          try {
            const { url } = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });
            window.location.href = url;
          } catch (err) {
            errorEl.textContent = err.message;
            btn.disabled = false;
            btn.innerHTML = defaultHtml;
          }
        });
      });
    },
  });
}

function openSettingsModal(user, root) {
  let pendingAvatar; // undefined = sin cambios; null = quitar foto; string = foto nueva

  openModal({
    title: 'Ajustes',
    bodyHtml: `
      <div class="profile-edit__avatar-row">
        <span class="avatar profile-edit__avatar" data-profile-avatar-preview>${avatarInnerHtml(user)}</span>
        <div class="profile-edit__avatar-actions">
          <button type="button" class="btn-secondary" data-avatar-pick>Cambiar foto</button>
          <input type="file" accept="image/*" data-avatar-input hidden />
          ${user.avatar ? '<button type="button" class="btn-secondary" style="color:var(--red); border-color:var(--red-bg);" data-avatar-remove>Quitar foto</button>' : ''}
        </div>
      </div>
      <div class="field">
        <label for="settings-name">Nombre</label>
        <input id="settings-name" type="text" value="${escapeHtml(user.name)}" maxlength="60" />
      </div>
      <div class="field">
        <label for="settings-bio">Biografía</label>
        <textarea id="settings-bio" maxlength="160" placeholder="Cuenta algo sobre ti (opcional)">${escapeHtml(user.bio || '')}</textarea>
        <div class="profile-edit__bio-count" data-bio-count>0 / 160</div>
      </div>
      <p class="text-caption" style="margin:0 0 14px;">
        Plan actual: <strong style="color:var(--text);">${user.plan === 'pro' ? 'Vantex Pro ★' : user.plan === 'plus' ? 'Vantex Plus' : 'Gratuito'}</strong>
      </p>
      <button type="button" class="btn-secondary" data-settings-billing style="width:100%; justify-content:center;">
        ${user.plan === 'free' ? 'Mejorar plan' : 'Gestionar suscripción'}
      </button>
      <p class="error-msg" data-settings-error></p>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" data-modal-close>Cancelar</button>
      <button type="button" class="btn-primary" data-settings-save>Guardar</button>
    `,
    onOpen: (modalRoot) => {
      const nameInput = modalRoot.querySelector('#settings-name');
      const bioInput = modalRoot.querySelector('#settings-bio');
      const bioCount = modalRoot.querySelector('[data-bio-count]');
      const avatarPreview = modalRoot.querySelector('[data-profile-avatar-preview]');
      const avatarInput = modalRoot.querySelector('[data-avatar-input]');
      const errorEl = modalRoot.querySelector('[data-settings-error]');
      const saveBtn = modalRoot.querySelector('[data-settings-save]');
      nameInput.focus({ preventScroll: true });
      nameInput.select();

      const updateBioCount = () => { bioCount.textContent = `${bioInput.value.length} / 160`; };
      updateBioCount();
      bioInput.addEventListener('input', updateBioCount);

      modalRoot.querySelector('[data-avatar-pick]').addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        try {
          const dataUrl = await resizeImageToDataUrl(file);
          pendingAvatar = dataUrl;
          avatarPreview.innerHTML = `<img src="${dataUrl}" alt="" />`;
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
      const removeBtn = modalRoot.querySelector('[data-avatar-remove]');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          pendingAvatar = null;
          avatarPreview.innerHTML = escapeHtml(nameInput.value.trim().charAt(0).toUpperCase() || user.name.charAt(0).toUpperCase());
          removeBtn.remove();
        });
      }

      saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const bio = bioInput.value.trim();
        errorEl.textContent = '';
        if (!name) { errorEl.textContent = 'El nombre no puede estar vacío.'; return; }
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Guardando…';
        try {
          const payload = { name, bio };
          if (pendingAvatar !== undefined) payload.avatar = pendingAvatar;
          const { user: updated } = await api('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
          Object.assign(user, updated);
          root.querySelectorAll('.topbar__name').forEach((el) => { el.textContent = updated.name; });
          root.querySelectorAll('.avatar').forEach((el) => { el.innerHTML = avatarInnerHtml(updated); el.title = updated.name; });
          showToast({ type: 'success', message: 'Ajustes guardados.' });
          closeModal();
        } catch (err) {
          errorEl.textContent = err.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Guardar';
        }
      });

      modalRoot.querySelector('[data-settings-billing]').addEventListener('click', async (e) => {
        if (user.plan === 'free') {
          closeModal();
          openUpgradeModal();
          return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="border-color:rgba(0,0,0,.15); border-top-color:var(--text-dim);"></span>';
        try {
          const { url } = await api('/billing/portal', { method: 'POST' });
          window.location.href = url;
        } catch (err) {
          btn.disabled = false;
          showToast({ type: 'error', message: err.message });
        }
      });
    },
  });
}
