/*
  Orquestador de la introducción — "THE PERFECT CUT".

  Reglas que sigue, en este orden de prioridad:
  1. Si el usuario ya la vio (localStorage), no se repite: la web
     arranca directo en el Hero. `?intro=force` en la URL la fuerza de
     todos modos (útil en desarrollo); `?intro=skip` la desactiva.
  2. Si el usuario pide menos movimiento (`prefers-reduced-motion`), no
     se reproduce la experiencia 3D: se muestra el nombre del negocio
     un instante y se pasa directo a la home. Nunca bloquea el acceso
     al contenido.
  3. Si no, hay un límite de tiempo máximo, un botón "Saltar intro"
     siempre visible y la tecla Escape, que funcionan de inmediato en
     cualquier momento de la secuencia.
  4. En gama baja o sin WebGL se usa una versión ligera en SVG + CSS
     con la misma idea e interacción (arrastrar para cortar). La
     escena 3D (js/intro-scene.js) solo se descarga cuando de verdad
     se va a usar.
*/

const STORAGE_KEY = 'intro_seen_v2';
const MAX_WAIT_MS = 9000; // nunca esperar más que esto sin interacción
const THREE_LOAD_TIMEOUT_MS = 2500; // si la escena 3D tarda, cae a la versión ligera

const params = new URLSearchParams(location.search);
const devForceShow = params.get('intro') === 'force';
const devForceSkip = params.get('intro') === 'skip';

const intro = document.querySelector('[data-intro]');

if (intro) {
  if (devForceSkip) localStorage.setItem(STORAGE_KEY, '1');
  const alreadySeen = !devForceShow && localStorage.getItem(STORAGE_KEY) === '1';
  if (!alreadySeen) show();

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-intro-replay]');
    if (!trigger) return;
    e.preventDefault();
    localStorage.removeItem(STORAGE_KEY);
    show();
  });
}

function show() {
  intro.hidden = false;
  intro.classList.remove('is-cutting', 'is-exit', 'is-skip', 'has-3d', 'is-naming');
  document.documentElement.setAttribute('data-intro-active', '');
  requestAnimationFrame(runSequence);
}

function runSequence() {
  const skipBtn = intro.querySelector('[data-intro-skip]');
  // Declaradas antes de cualquier rama: dismiss() las lee, y con `let`/
  // `const` una rama que las usara antes de esta línea (la de
  // reduced-motion, que termina con `return` más arriba en el flujo)
  // daría un error de "temporal dead zone" en tiempo de ejecución.
  // clearTimeout(undefined) no hace nada, así que dejarla sin asignar en
  // esa rama es seguro.
  let phase = 'playing'; // 'playing' -> 'done'
  let autoTimer;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Transición sencilla: se ve la marca un instante y se pasa a la home.
    // Sigue respondiendo a "saltar" por si el usuario quiere ir aún más rápido.
    intro.classList.add('is-branding-only');
    const brandingTimer = setTimeout(() => dismiss(false), 900);
    skipBtn.addEventListener('click', () => { clearTimeout(brandingTimer); dismiss(true); }, { once: true });
    return;
  }

  const canvas = intro.querySelector('[data-intro-canvas]');
  const liteEl = intro.querySelector('[data-intro-lite]');

  // Por si se trata de una repetición (botón "Ver introducción").
  canvas.removeAttribute('data-ready');
  liteEl.hidden = true;

  autoTimer = setTimeout(() => dismiss(false), MAX_WAIT_MS);

  skipBtn.addEventListener('click', onSkipClick);
  document.addEventListener('keydown', onKeydown);
  skipBtn.focus({ preventScroll: true });

  const tier = deviceTier();
  if (tier !== 'unsupported') {
    startThree(tier);
  } else {
    startLite();
  }

  function startThree(quality) {
    let fellBack = false;
    const fallbackTimer = setTimeout(() => {
      fellBack = true;
      startLite();
    }, THREE_LOAD_TIMEOUT_MS);

    import('./intro-scene.js')
      .then((mod) => {
        clearTimeout(fallbackTimer);
        if (fellBack) return;
        return mod.startScene(canvas, {
          businessName: window.SITE_CONTENT?.business?.name || 'STUDIO NAME',
          quality,
          onCutStart: onCut,
          onReady: () => {
            canvas.setAttribute('data-ready', '');
            intro.classList.add('has-3d');
          },
          onComplete: () => dismiss(false),
        });
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        if (!fellBack) startLite();
      });
  }

  function startLite() {
    liteEl.hidden = false;
    initLiteInteraction(liteEl, {
      onCut,
      onNamed: () => {
        // Sustituto ligero de "las partículas forman el nombre": revela el
        // nombre del negocio (ya enlazado vía data-bind) y avanza.
        intro.classList.add('is-naming');
        setTimeout(() => dismiss(false), 900);
      },
    });
  }

  function onCut() {
    if (phase !== 'playing') return;
    clearTimeout(autoTimer);
    intro.classList.add('is-cutting');
  }

  function onSkipClick() {
    dismiss(true);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss(true);
  }

  function dismiss(instant) {
    if (phase === 'done') return;
    phase = 'done';
    clearTimeout(autoTimer);
    skipBtn.removeEventListener('click', onSkipClick);
    document.removeEventListener('keydown', onKeydown);
    finish(instant);
  }
}

function finish(instant) {
  intro.classList.add(instant ? 'is-skip' : 'is-exit');
  const wait = instant ? 320 : 700;
  setTimeout(() => {
    intro.hidden = true;
    intro.classList.remove('is-cutting', 'is-exit', 'is-skip', 'has-3d', 'is-naming', 'is-branding-only');
    document.documentElement.removeAttribute('data-intro-active');
    localStorage.setItem(STORAGE_KEY, '1');
    replayHeroEntrance();
  }, wait);
}

/* Reinicia la animación de entrada del Hero justo cuando la intro se
   retira, para que la transición se sienta como una sola experiencia. */
function replayHeroEntrance() {
  document.querySelectorAll('.hero .reveal-in').forEach((el) => {
    el.style.animation = 'none';
    void el.offsetWidth; // fuerza reflow para poder reiniciar la animación
    el.style.animation = '';
  });
}

/*
  Determina qué versión ofrecer:
  - 'unsupported': sin WebGL, o hardware realmente limitado -> versión ligera.
  - 'low': táctil, pantalla pequeña o gama media -> 3D con menos partículas
    y sin antialiasing, para no generar lag.
  - 'high': escritorio con potencia de sobra -> experiencia completa.
  El táctil YA NO excluye el 3D (antes sí): en móvil se adapta la
  interacción (arrastrar el dedo) en vez de sustituir toda la escena.
*/
function deviceTier() {
  if (!supportsWebGL()) return 'unsupported';
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores <= 2) return 'unsupported';
  const mem = navigator.deviceMemory;
  if (typeof mem === 'number' && mem <= 1) return 'unsupported';

  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth < 820;
  const isModestHardware = (typeof mem === 'number' && mem <= 4) || (typeof cores === 'number' && cores <= 4);
  return (isCoarsePointer || isSmallScreen || isModestHardware) ? 'low' : 'high';
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

/*
  Versión ligera (SVG + CSS): misma idea e interacción que la escena 3D
  —arrastrar en horizontal para acercar las tijeras y cortar— pero sin
  WebGL, para gama muy baja o navegadores sin soporte.
*/
function initLiteInteraction(liteEl, { onCut, onNamed }) {
  const scissors = liteEl.querySelector('[data-intro-lite-scissors]');
  const track = liteEl.querySelector('[data-intro-lite-track]');
  let cut = false;
  let progress = 0;

  function setProgress(clientX) {
    if (cut) return;
    const rect = track.getBoundingClientRect();
    progress = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    // Solo se toca `left`: el centrado propio del icono (transform:
    // translate(-50%,-50%), declarado en CSS) no debe pisarse desde JS,
    // o perdería el ajuste vertical de golpe.
    scissors.style.left = `${90 - progress * 40}%`;
    if (progress > 0.94) triggerCut();
  }

  function triggerCut() {
    if (cut) return;
    cut = true;
    liteEl.removeEventListener('pointermove', onMove);
    if (typeof onCut === 'function') onCut();
    setTimeout(() => { if (typeof onNamed === 'function') onNamed(); }, 500);
  }

  function onMove(e) { setProgress(e.clientX); }
  liteEl.addEventListener('pointermove', onMove);
  liteEl.addEventListener('pointerdown', (e) => setProgress(e.clientX));
}
