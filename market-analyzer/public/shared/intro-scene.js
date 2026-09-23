/*
  Escena 3D de la intro de Vantex — importado de forma perezosa desde
  shared/intro.js, solo cuando de verdad se va a mostrar.

  Concepto: un puñado de partículas dispersas convergen para "ensamblar"
  el mismo logomark del sidebar (dos hojas asimétricas en forma de "V",
  cada una como un tubo 3D extruido siguiendo su contorno), con un brillo
  índigo sutil, una ligera rotación/parallax continua y otro grupo de
  partículas ambiente que dan profundidad de fondo. Sin interacción del
  usuario: se reproduce sola y llama a onComplete() al terminar.
*/
import * as THREE from '../vendor/three.module.min.js';

// Puntos del logomark (mismo trazado que shared/icons.js: vantexLogo,
// simplificado a 3 vértices por hoja), reescalados de su espacio 0-100 a
// un rango ~0-22 comparable al viewBox 24x24 que usaba el icono anterior,
// y convertidos a coordenadas 3D centradas en el origen (y hacia arriba).
const K = 0.18;
function toVec3([svgX, svgY]) {
  return new THREE.Vector3((svgX - 12) * K, (12 - svgY) * K, 0);
}
// Hoja izquierda (anclada): esquina exterior -> esquina interior -> punta.
const TREND_POINTS = [[2.4, 5.76], [9.12, 2.4], [11.28, 19.2]].map(toVec3);
// Hoja derecha (adelantada, más afilada): esquina exterior -> interior -> punta.
const BOX_POINTS = [[22.08, 3.84], [19.68, 0.48], [12.72, 19.2]].map(toVec3);

function buildPathCurve(points) {
  const curve = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
  }
  return curve;
}

export function startScene(canvas, { quality = 'high', durationMs = 3000, onReady, onComplete } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: quality === 'high' });
  } catch (e) {
    return; // sin WebGL real; el timeout de intro.js ya cubre este caso
  }

  const isLow = quality !== 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLow ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
  camera.position.set(0, 0, 7.2);

  scene.add(new THREE.AmbientLight(0x8890ff, .55));
  const keyLight = new THREE.PointLight(0x9d95ff, 14, 20);
  keyLight.position.set(3, 3, 5);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x5865f2, 8, 20);
  rimLight.position.set(-4, -2, 3);
  scene.add(rimLight);

  // ---------- Logo (tubo extruido) ----------
  const logoGroup = new THREE.Group();
  scene.add(logoGroup);
  const tubeRadius = .075;
  const material = new THREE.MeshStandardMaterial({
    color: 0x6d63f5,
    emissive: 0x4f46e5,
    emissiveIntensity: 0,
    metalness: .35,
    roughness: .3,
    transparent: true,
    opacity: 0,
  });
  const trendGeo = new THREE.TubeGeometry(buildPathCurve(TREND_POINTS), 48, tubeRadius, 8, false);
  const boxGeo = new THREE.TubeGeometry(buildPathCurve(BOX_POINTS), 24, tubeRadius, 8, false);
  const trendMesh = new THREE.Mesh(trendGeo, material);
  const boxMesh = new THREE.Mesh(boxGeo, material);
  logoGroup.add(trendMesh, boxMesh);
  logoGroup.scale.setScalar(.001);

  // ---------- Partículas ----------
  const CONVERGENT_N = isLow ? 36 : 90;
  const AMBIENT_N = isLow ? 46 : 120;
  const TOTAL_N = CONVERGENT_N + AMBIENT_N;

  const positions = new Float32Array(TOTAL_N * 3);
  const startPositions = new Float32Array(TOTAL_N * 3);
  const targetPositions = new Float32Array(TOTAL_N * 3);
  const isAmbient = new Uint8Array(TOTAL_N);
  const ambientPhase = new Float32Array(TOTAL_N);

  const trendSamples = buildPathCurve(TREND_POINTS).getSpacedPoints(CONVERGENT_N - 1);

  for (let i = 0; i < TOTAL_N; i++) {
    const ambient = i >= CONVERGENT_N;
    isAmbient[i] = ambient ? 1 : 0;
    const radius = ambient ? 3.4 + Math.random() * 2.2 : 2.2 + Math.random() * 1.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const sx = radius * Math.sin(phi) * Math.cos(theta);
    const sy = radius * Math.sin(phi) * Math.sin(theta) * .6;
    const sz = radius * Math.cos(phi) * .5;
    startPositions[i * 3] = sx; startPositions[i * 3 + 1] = sy; startPositions[i * 3 + 2] = sz;
    positions[i * 3] = sx; positions[i * 3 + 1] = sy; positions[i * 3 + 2] = sz;
    ambientPhase[i] = Math.random() * Math.PI * 2;

    if (!ambient) {
      const p = trendSamples[i % trendSamples.length];
      targetPositions[i * 3] = p.x; targetPositions[i * 3 + 1] = p.y; targetPositions[i * 3 + 2] = p.z;
    } else {
      targetPositions[i * 3] = sx; targetPositions[i * 3 + 1] = sy; targetPositions[i * 3 + 2] = sz;
    }
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xa6a0ff, size: isLow ? .05 : .045, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(particleGeo, particleMat);
  scene.add(points);

  function resize() {
    const el = canvas.parentElement;
    const w = Math.max(el.clientWidth, 1);
    const h = Math.max(el.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  resize();

  const clock = new THREE.Clock();
  let elapsedMs = 0;
  let stopped = false;
  let rafId;
  let completed = false;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

  function animate() {
    if (stopped) return;
    const dt = Math.min(clock.getDelta(), .05);
    elapsedMs += dt * 1000;

    // Fase 1 (0-600ms): las partículas se hacen visibles.
    particleMat.opacity = clamp01(elapsedMs / 600) * .85;

    // Fase 2 (250-1650ms): las partículas convergentes viajan hacia el
    // trazado del logo; el tubo se desvanece hacia dentro con un pequeño
    // rebote de escala mientras "toma el relevo" de las partículas.
    const convergeT = easeOutCubic(clamp01((elapsedMs - 250) / 1400));
    for (let i = 0; i < CONVERGENT_N; i++) {
      positions[i * 3] = startPositions[i * 3] + (targetPositions[i * 3] - startPositions[i * 3]) * convergeT;
      positions[i * 3 + 1] = startPositions[i * 3 + 1] + (targetPositions[i * 3 + 1] - startPositions[i * 3 + 1]) * convergeT;
      positions[i * 3 + 2] = startPositions[i * 3 + 2] + (targetPositions[i * 3 + 2] - startPositions[i * 3 + 2]) * convergeT;
    }
    // Partículas ambiente: deriva suave, nunca convergen.
    for (let i = CONVERGENT_N; i < TOTAL_N; i++) {
      const t = elapsedMs / 1000 + ambientPhase[i];
      positions[i * 3] = startPositions[i * 3] + Math.sin(t * .4) * .18;
      positions[i * 3 + 1] = startPositions[i * 3 + 1] + Math.cos(t * .33) * .18;
      positions[i * 3 + 2] = startPositions[i * 3 + 2] + Math.sin(t * .27) * .12;
    }
    particleGeo.attributes.position.needsUpdate = true;

    const tubeInT = clamp01((elapsedMs - 900) / 800);
    material.opacity = tubeInT;
    material.emissiveIntensity = .55 + Math.sin(elapsedMs / 480) * .18 * clamp01((elapsedMs - 1700) / 300);
    const scaleT = clamp01((elapsedMs - 900) / 850);
    logoGroup.scale.setScalar(Math.max(easeOutBack(scaleT), .001));
    // Las partículas convergentes se desvanecen justo cuando el tubo ya
    // está presente, para que la sensación sea "se convirtieron en él".
    if (elapsedMs > 1500) {
      const fadeConv = 1 - clamp01((elapsedMs - 1500) / 500);
      particleMat.opacity = Math.min(particleMat.opacity, .28 + fadeConv * .57);
    }

    // Parallax/rotación automática y muy sutil — sensación de profundidad
    // sin depender del puntero (funciona igual en móvil/tablet).
    logoGroup.rotation.y = Math.sin(elapsedMs / 2600) * .12;
    logoGroup.rotation.x = Math.sin(elapsedMs / 3400) * .05;
    camera.position.x = Math.sin(elapsedMs / 4200) * .35;
    camera.position.y = Math.sin(elapsedMs / 3600) * .2;
    camera.lookAt(0, 0, 0);
    points.rotation.y = logoGroup.rotation.y * .5;

    // Salida: todo se desvanece un poco antes de que intro.js dispare el
    // fade del overlay completo, para que no se note un corte.
    if (elapsedMs > durationMs - 400) {
      const outT = clamp01((elapsedMs - (durationMs - 400)) / 400);
      const fade = 1 - outT;
      material.opacity = tubeInT * fade;
      particleMat.opacity *= fade;
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);

    if (!completed && elapsedMs >= durationMs) {
      completed = true;
      if (typeof onComplete === 'function') onComplete();
    }
  }

  animate();
  if (typeof onReady === 'function') requestAnimationFrame(onReady);

  // Limpieza reactiva: se dispara sola cuando intro.js oculta el overlay
  // (atributo `hidden`), tanto en un cierre normal como en un "saltar".
  const introRoot = canvas.closest('[data-intro]');
  const cleanupObserver = new MutationObserver(() => {
    if (canvas.closest('[hidden]')) {
      stopped = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      cleanupObserver.disconnect();
      particleGeo.dispose();
      particleMat.dispose();
      trendGeo.dispose();
      boxGeo.dispose();
      material.dispose();
      renderer.dispose();
    }
  });
  if (introRoot) cleanupObserver.observe(introRoot, { attributes: true, attributeFilter: ['hidden'] });
}
