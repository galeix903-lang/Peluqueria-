/*
  Sistema de iconos de criptomonedas — componente reutilizable.

  Uso: en vez de escribir el símbolo suelto, se marca con
  data-crypto-icon y el símbolo en data-symbol:

    <span data-crypto-icon data-symbol="BTC" data-size="24"></span>

  y se llama una vez por pantalla a mountCryptoIcons() (igual que ya se
  hace con populateIcons()/[data-icon] para el set de iconos de marca).
  Se encarga de: resolver el logo real contra /api/market/icons (que a
  su vez cachea en el servidor y reutiliza la misma fuente de datos que
  ya usa Cryptolyzer, CoinGecko), cachear en el cliente para no repetir la
  petición al cambiar de pantalla, mostrar un estado de carga mientras
  tanto, y caer a un fallback elegante (iniciales sobre un círculo de
  color estable) si el logo no existe o la imagen falla al cargar —
  nunca un icono roto.
*/
(function () {
  const CLIENT_CACHE_KEY = 'cryptolyzer_crypto_icon_cache_v1';
  const CLIENT_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

  // Paleta estable (no aleatoria): el mismo símbolo siempre cae en el
  // mismo color, calculado a partir de sus caracteres, para que el
  // fallback se vea coherente entre pantallas y entre recargas.
  const FALLBACK_PALETTE = [
    '#f7931a', '#627eea', '#8b5cf6', '#14b8a6', '#f43f5e',
    '#0ea5e9', '#eab308', '#22c55e', '#6366f1', '#ec4899',
    '#f97316', '#06b6d4',
  ];

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function fallbackColor(symbol) {
    return FALLBACK_PALETTE[hashString(symbol) % FALLBACK_PALETTE.length];
  }

  function readClientCache() {
    try {
      const raw = localStorage.getItem(CLIENT_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const fresh = {};
      for (const [symbol, entry] of Object.entries(parsed)) {
        if (entry && now - entry.at < CLIENT_CACHE_TTL_MS) fresh[symbol] = entry;
      }
      return fresh;
    } catch {
      return {};
    }
  }

  function writeClientCache(cache) {
    try {
      localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // localStorage lleno/bloqueado (privado, cuota) — el icono sigue
      // funcionando, solo se pierde la persistencia entre recargas.
    }
  }

  // Memoria del proceso (además de localStorage) para no releer/parsear
  // JSON en cada mountCryptoIcons() de la misma sesión de página.
  let memCache = null;
  function getMemCache() {
    if (!memCache) memCache = readClientCache();
    return memCache;
  }

  function renderFallbackInner(symbol) {
    const letter = (symbol || '?').charAt(0).toUpperCase();
    return `<span class="crypto-icon__fallback" style="background:${fallbackColor(symbol)};">${letter}</span>`;
  }

  function applyIcon(el, symbol, icon) {
    const size = el.dataset.size || '24';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    if (icon && icon.logo) {
      el.innerHTML = `<img src="${icon.logo}" alt="${icon.name || symbol}" loading="lazy" width="${size}" height="${size}" class="crypto-icon__img" />`;
      const img = el.querySelector('img');
      img.addEventListener('error', () => {
        // La URL vino de la API pero la imagen en sí falló al cargar
        // (red, CDN caído) — nunca se deja un icono roto, se cae al
        // mismo fallback que si no hubiera logo.
        el.innerHTML = renderFallbackInner(symbol);
        el.classList.add('is-fallback');
      }, { once: true });
      el.classList.remove('is-loading', 'is-fallback');
    } else {
      el.innerHTML = renderFallbackInner(symbol);
      el.classList.remove('is-loading');
      el.classList.add('is-fallback');
    }
  }

  // Punto de entrada: busca todos los [data-crypto-icon] dentro de root
  // (document por defecto, o un contenedor concreto tras un re-render
  // parcial), agrupa los símbolos únicos que todavía no están resueltos
  // y pide todos de una vez — nunca una petición por icono.
  async function mountCryptoIcons(root) {
    const scope = root || document;
    const els = Array.from(scope.querySelectorAll('[data-crypto-icon]'));
    if (!els.length) return;

    const cache = getMemCache();
    const toFetch = new Set();

    for (const el of els) {
      const symbol = (el.dataset.symbol || '').trim().toUpperCase();
      if (!symbol) { applyIcon(el, '', null); continue; }
      const cached = cache[symbol];
      if (cached) {
        applyIcon(el, symbol, cached.icon);
      } else {
        el.classList.add('is-loading');
        el.innerHTML = '<span class="crypto-icon__skeleton"></span>';
        toFetch.add(symbol);
      }
    }

    if (!toFetch.size) return;

    let icons = {};
    try {
      const res = await fetch(`/api/market/icons?symbols=${encodeURIComponent([...toFetch].join(','))}`);
      if (res.ok) {
        const body = await res.json();
        icons = body.icons || {};
      }
    } catch {
      // Sin red hacia el endpoint: todos los símbolos pendientes caen al
      // fallback más abajo, nunca se quedan en el skeleton para siempre.
    }

    const now = Date.now();
    for (const symbol of toFetch) {
      const icon = icons[symbol] || null;
      cache[symbol] = { icon, at: now };
    }
    writeClientCache(cache);

    for (const el of els) {
      const symbol = (el.dataset.symbol || '').trim().toUpperCase();
      if (toFetch.has(symbol)) applyIcon(el, symbol, cache[symbol]?.icon || null);
    }
  }

  // Helper para construir el HTML de un icono inline sin pasar por
  // mountCryptoIcons (p.ej. dentro de una plantilla de string ya
  // existente) — el span se hidrata igual en el siguiente
  // mountCryptoIcons() que se llame sobre ese contenedor.
  function cryptoIconHtml(symbol, size) {
    return `<span class="crypto-icon" data-crypto-icon data-symbol="${symbol}" data-size="${size || 24}"></span>`;
  }

  window.mountCryptoIcons = mountCryptoIcons;
  window.cryptoIconHtml = cryptoIconHtml;
})();
