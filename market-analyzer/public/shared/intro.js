/*
  Orquestador de la introducción de Vantex.

  Misma arquitectura que la intro 3D de peluqueria-premium/ (adaptada,
  sin reutilizar ningún contenido de esa marca): gate por localStorage,
  botón "Saltar intro" + tecla ESC siempre activos, límite de espera
  máximo, versión ligera en CSS puro para gama baja/sin WebGL, y la
  escena 3D real (shared/intro-scene.js) que solo se descarga cuando de
  verdad se va a usar.

  Reglas, en este orden de prioridad:
  1. Si el usuario ya la vio (localStorage), no se repite: se entra
     directo al login. `?intro=force` la fuerza (desarrollo); `?intro=skip`
     la desactiva.
  2. Si el usuario pide menos movimiento (`prefers-reduced-motion`), no
     hay 3D: se ve la marca un instante y se pasa a la pantalla real.
  3. Si no, hay un tiempo máximo, un botón "Saltar" siempre visible y la
     tecla Escape, activos en cualquier momento.
  4. En gama baja o sin WebGL se usa una versión ligera en CSS puro con
     la misma idea (logo + wordmark + tagline). La escena 3D solo se
     descarga cuando de verdad se va a mostrar.
*/

const STORAGE_KEY = 'vantex_intro_seen';
const MAX_WAIT_MS = 9000; // nunca esperar más que esto sin interacción
const THREE_LOAD_TIMEOUT_MS = 2500; // si la escena 3D tarda, cae a la versión ligera
const SCENE_DURATION_MS = 3000; // duración objetivo de la secuencia (antes del fade de salida)

const params = new URLSearchParams(location.search);
const devForceShow = params.get('intro') === 'force';
const devForceSkip = params.get('intro') === 'skip';

const intro = document.querySelector('[data-intro]');

if (intro) {
  if (devForceSkip) localStorage.setItem(STORAGE_KEY, '1');
  const alreadySeen = !devForceShow && localStorage.getItem(STORAGE_KEY) === '1';
  if (!alreadySeen) show();
}

function show() {
  intro.hidden = false;
  intro.classList.remove('is-exit', 'is-skip', 'has-3d', 'is-branding-only');
  document.documentElement.setAttribute('data-intro-active', '');
  requestAnimationFrame(runSequence);
}

function runSequence() {
  const skipBtn = intro.querySelector('[data-intro-skip]');
  let phase = 'playing'; // 'playing' -> 'done'
  let autoTimer;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    intro.classList.add('is-branding-only');
    const brandingTimer = setTimeout(() => dismiss(false), 900);
    skipBtn.addEventListener('click', () => { clearTimeout(brandingTimer); dismiss(true); }, { once: true });
    return;
  }

  const canvas = intro.querySelector('[data-intro-canvas]');
  const liteEl = intro.querySelector('[data-intro-lite]');
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
    const fallbackTimer = setTimeout(() => { fellBack = true; startLite(); }, THREE_LOAD_TIMEOUT_MS);

    import('./intro-scene.js')
      .then((mod) => {
        clearTimeout(fallbackTimer);
        if (fellBack) return;
        return mod.startScene(canvas, {
          quality,
          durationMs: SCENE_DURATION_MS,
          onReady: () => { canvas.setAttribute('data-ready', ''); intro.classList.add('has-3d'); },
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
    setTimeout(() => dismiss(false), SCENE_DURATION_MS);
  }

  function onSkipClick() { dismiss(true); }
  function onKeydown(e) { if (e.key === 'Escape') dismiss(true); }

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
  const wait = instant ? 320 : 800;
  setTimeout(() => {
    intro.hidden = true;
    intro.classList.remove('is-exit', 'is-skip', 'has-3d', 'is-branding-only');
    document.documentElement.removeAttribute('data-intro-active');
    localStorage.setItem(STORAGE_KEY, '1');
    replayHeroEntrance();
  }, wait);
}

/* Reinicia la animación de entrada del hero de login justo cuando la
   intro se retira, para que se sienta como una sola experiencia. */
function replayHeroEntrance() {
  document.querySelectorAll('[data-hero-entrance] .reveal, [data-hero-entrance] .reveal-pop').forEach((el) => {
    el.style.animation = 'none';
    void el.offsetWidth; // fuerza reflow para reiniciar la animación
    el.style.animation = '';
  });
}

/*
  Determina qué versión ofrecer:
  - 'unsupported': sin WebGL o hardware muy limitado -> versión ligera.
  - 'low': táctil, pantalla pequeña o gama media -> 3D con menos
    partículas y sin antialiasing.
  - 'high': escritorio con potencia de sobra -> experiencia completa.
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
