/*
  "THE PERFECT CUT" — escena 3D de la introducción.

  Narrativa (todo generado por código, sin modelos/texturas externas,
  para mantener la carga ligera y 100% reutilizable):
    1. Una hebra de cabello flota suavemente en el vacío, sobre negro.
    2. Unas tijeras entran desde un lateral y se acercan.
    3. El usuario controla la posición de las tijeras moviendo el
       cursor (o arrastrando el dedo en táctil) en horizontal; al
       llegar al punto de corte, las tijeras cortan solas.
    4. La hebra se separa y salen despedidas partículas de cabello.
    5. Las partículas se agrupan un instante formando el nombre del
       negocio (dato real, nunca hardcodeado) y luego se dispersan.

  Este módulo solo se descarga cuando js/intro.js decide usar la
  versión 3D — ver shouldUseThree() allí.
*/
import * as THREE from './vendor/three.module.min.js';

const COLOR_HAIR = 0x5c4632; // castaño cálido — visible sobre negro, neutro
const COLOR_METAL = 0xcfd3d8; // acero
const COLOR_PARTICLE = 0xe8d9be; // mota cálida, cercana al champán
const COLOR_KEY_LIGHT = 0xffffff;
const COLOR_FILL_LIGHT = 0x8a95a6; // frío, tenue
const COLOR_RIM_LIGHT = 0xb49a72; // champán — único acento de color

const READY_X = 1.55; // posición de "lista para cortar" tras la aproximación
const ENTER_X = 4.4; // punto de partida, fuera de cámara
const CUT_X = 0.02; // posición de las tijeras en el instante del corte
const CUT_T = 0.52; // punto de la hebra (0–1) por donde se corta
const BLADE_REST_DEG = 16; // ángulo de apertura de las hojas en reposo

export function startScene(canvas, {
  businessName = 'STUDIO NAME',
  quality = 'high',
  onCutStart,
  onReady,
  onComplete,
} = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: quality === 'high' });
  } catch (e) {
    return; // sin WebGL de verdad disponible; js/intro.js ya tiene un timeout de seguridad
  }

  const isLowQuality = quality !== 'high';
  const MAX_PARTICLES = isLowQuality ? 140 : 320;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0.3, 0.35, 7.4);
  camera.lookAt(0, 0.1, 0);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLowQuality ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---------- Iluminación de estudio, dramática y de alto contraste ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(COLOR_KEY_LIGHT, 2.1);
  key.position.set(3.2, 3.4, 4.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(COLOR_FILL_LIGHT, 0.5);
  fill.position.set(-3.6, 0.4, 2.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(COLOR_RIM_LIGHT, 1.4);
  rim.position.set(-1.2, 2.2, -3.4);
  scene.add(rim);
  // Luz dedicada sobre la hebra: sin ella, un material oscuro sobre un
  // fondo negro puede quedar invisible según el ángulo de las luces
  // direccionales de arriba (que están pensadas sobre todo para el metal).
  const strandLight = new THREE.PointLight(0xfff3e0, 1.6, 8, 2);
  strandLight.position.set(0.2, 1.1, 2.6);
  scene.add(strandLight);

  const rig = new THREE.Group();
  scene.add(rig);

  // ============================================================
  // HEBRA DE CABELLO — un mechón principal + dos hilos finos
  // ============================================================
  const hairMat = new THREE.MeshStandardMaterial({ color: COLOR_HAIR, roughness: 0.42, metalness: 0.08 });
  const hairMatTranslucent = hairMat.clone();
  hairMatTranslucent.transparent = true;

  // Curva vertical suave: un mechón que cuelga, con un ligero vaivén
  // lateral — no un cable recto cruzando la pantalla.
  function strandCurve(bend, twist) {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(twist * 0.05, 1.3, 0),
      new THREE.Vector3(bend * 0.32 + twist * 0.07, 0.65, twist * 0.05),
      new THREE.Vector3(bend * 0.5, 0, twist * 0.02),
      new THREE.Vector3(bend * 0.32 - twist * 0.07, -0.65, -twist * 0.05),
      new THREE.Vector3(-twist * 0.05, -1.3, 0),
    ]);
  }

  function sampleSubCurve(curve, t0, t1, segments) {
    const pts = [];
    for (let i = 0; i <= segments; i++) pts.push(curve.getPointAt(t0 + (t1 - t0) * (i / segments)));
    return new THREE.CatmullRomCurve3(pts);
  }

  // Un pequeño mechón: varios hilos finos agrupados, no un único cable grueso.
  const strandDefs = [
    { bend: 0.22, twist: 0.5, radius: 0.016, x: 0 },
    { bend: 0.14, twist: -0.6, radius: 0.01, x: 0.055 },
    { bend: 0.3, twist: 0.22, radius: 0.009, x: -0.05 },
    { bend: 0.18, twist: -0.32, radius: 0.007, x: 0.095 },
    { bend: 0.26, twist: 0.4, radius: 0.007, x: -0.09 },
  ];
  const strands = strandDefs.map((d, i) => {
    const pivot = new THREE.Group();
    pivot.position.x = d.x;
    rig.add(pivot);

    const curve = strandCurve(d.bend, d.twist);
    const fullMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, d.radius, 6, false), hairMat);
    pivot.add(fullMesh);

    const topCurve = sampleSubCurve(curve, 0, CUT_T, 14);
    const bottomCurve = sampleSubCurve(curve, CUT_T, 1, 14);
    const topMesh = new THREE.Mesh(new THREE.TubeGeometry(topCurve, 14, d.radius, 6, false), hairMatTranslucent.clone());
    const bottomMesh = new THREE.Mesh(new THREE.TubeGeometry(bottomCurve, 14, d.radius, 6, false), hairMatTranslucent.clone());
    const topPivot = new THREE.Group();
    const bottomPivot = new THREE.Group();
    topPivot.add(topMesh);
    bottomPivot.add(bottomMesh);
    topPivot.visible = false;
    bottomPivot.visible = false;
    pivot.add(topPivot, bottomPivot);

    return {
      pivot, fullMesh, topPivot, bottomPivot, y: 0,
      phase: i * 1.1, speed: 0.5 + i * 0.07,
      cutPoint: curve.getPointAt(CUT_T).clone(),
      vel: null,
    };
  });
  const primaryCutPoint = strands[0].cutPoint;

  // ============================================================
  // TIJERAS — dos hojas procedurales sobre un eje, acabado metálico
  // ============================================================
  const metalMat = new THREE.MeshPhysicalMaterial({
    color: COLOR_METAL, roughness: 0.16, metalness: 0.95, clearcoat: 0.6, clearcoatRoughness: 0.25,
  });
  // Las hojas son superficies casi planas: un metal totalmente especular
  // sin mapa de entorno se ve negro salvo un brillo puntual minúsculo. Un
  // poco menos de metalness/roughness deja ver sombreado de acero real.
  const bladeMat = new THREE.MeshPhysicalMaterial({
    color: COLOR_METAL, roughness: 0.34, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.2,
  });
  function buildBlade(sign) {
    const g = new THREE.Group();

    // Hoja: silueta 2D con vientre y punta, extruida para darle grosor
    // real — mucho más reconocible como tijera que una barra recta.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.02);
    shape.quadraticCurveTo(0.1, 0.05, 0.11, 0.32);
    shape.quadraticCurveTo(0.09, 0.62, 0.03, 0.88);
    shape.quadraticCurveTo(0.012, 0.98, 0, 1.05);
    shape.quadraticCurveTo(-0.012, 0.85, -0.02, 0.55);
    shape.quadraticCurveTo(-0.024, 0.25, -0.014, 0.05);
    shape.quadraticCurveTo(-0.006, 0.01, 0, 0.02);
    const bladeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.026, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 10,
    });
    bladeGeo.translate(0, 0, -0.013);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    g.add(blade);

    // Vástago desde el eje hasta el anillo del dedo.
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.4, 12), metalMat);
    shank.position.y = -0.2;
    g.add(shank);

    // Anillo del mango — de cara a la cámara (orientación por defecto del
    // toro), como un asa real; antes quedaba de canto y era invisible.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.024, 10, 22), metalMat);
    ring.position.y = -0.44;
    g.add(ring);

    g.rotation.z = THREE.MathUtils.degToRad(BLADE_REST_DEG * sign);
    return g;
  }
  const scissors = new THREE.Group();
  const bladeA = buildBlade(1);
  const bladeB = buildBlade(-1);
  const pivotScrew = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), metalMat);
  scissors.add(bladeA, bladeB, pivotScrew);
  scissors.position.set(ENTER_X, primaryCutPoint.y + 0.05, primaryCutPoint.z + 0.55);
  // rotation.z = +90° para que las puntas (eje +Y local de cada hoja)
  // queden mirando hacia -X, es decir hacia la hebra: con -90° apuntarían
  // en la dirección contraria, como se detectó al revisar la escena.
  scissors.rotation.z = THREE.MathUtils.degToRad(90);
  scissors.rotation.y = THREE.MathUtils.degToRad(-20);
  scissors.scale.setScalar(0.6);
  rig.add(scissors);

  // ============================================================
  // PARTÍCULAS — recortes de cabello y, después, motas que forman
  // el nombre del negocio. Un único sistema de puntos reutilizado
  // para ambas fases (una sola llamada de dibujo, muy barato).
  // ============================================================
  function makeParticleTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(MAX_PARTICLES * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.055,
    map: makeParticleTexture(),
    color: COLOR_PARTICLE,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(particleGeo, particleMat);
  points.visible = false;
  rig.add(points);

  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0,
  }));

  function sampleTextPositions(text, maxCount) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fontSize = 88;
    ctx.font = `600 ${fontSize}px Georgia, 'Times New Roman', serif`;
    const w = Math.max(200, Math.ceil(ctx.measureText(text).width) + 60);
    const h = Math.round(fontSize * 1.7);
    c.width = w;
    c.height = h;
    ctx.font = `600 ${fontSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), w / 2, h / 2);

    const data = ctx.getImageData(0, 0, w, h).data;
    const found = [];
    const stride = Math.max(2, Math.round(w / 160));
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        if (data[(y * w + x) * 4 + 3] > 128) found.push([x, y]);
      }
    }
    let sampled = found;
    if (found.length > maxCount) {
      sampled = [];
      const step = found.length / maxCount;
      for (let i = 0; i < maxCount; i++) sampled.push(found[Math.floor(i * step)]);
    }
    const worldScale = 3.6 / w;
    return sampled.map(([x, y]) => new THREE.Vector3(
      (x - w / 2) * worldScale,
      -(y - h / 2) * worldScale + 0.1,
      (Math.random() - 0.5) * 0.2
    ));
  }

  // Posición de "lista para cortar": con el FOV vertical fijo, una
  // pantalla estrecha/vertical (móvil, tablet en vertical) tiene mucho
  // menos campo de visión horizontal, así que READY_X en un valor fijo
  // dejaría las tijeras cortadas fuera del encuadre. Se recalcula en
  // cada resize() según el aspect real.
  let readyX = READY_X;

  // ---------- Tamaño y responsive (llena toda la pantalla) ----------
  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(box.width, 1);
    const h = Math.max(box.height, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const depth = 6.4; // distancia aproximada cámara–tijeras durante approach/interactive
    const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
    const halfH = halfV * camera.aspect;
    readyX = Math.min(READY_X, halfH * 0.6);
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);

  // ============================================================
  // MÁQUINA DE ESTADOS DE LA NARRATIVA
  // ============================================================
  let stage = 'enter'; // enter -> approach -> interactive -> cutting -> burst -> assemble -> hold -> disperse -> done
  let stageStart = performance.now();
  let pointerProgress = 0; // 0..1, controlado por el puntero durante 'interactive'
  let scissorsX = ENTER_X;

  function now() { return performance.now(); }
  function elapsed() { return now() - stageStart; }
  function goTo(next) { stage = next; stageStart = now(); }

  function triggerCut() {
    if (stage !== 'interactive') return;
    goTo('cutting');
    strands.forEach((s) => { s.fullMesh.visible = false; s.topPivot.visible = true; s.bottomPivot.visible = true; });
    if (typeof onCutStart === 'function') onCutStart();
    playClack();
  }

  // ---------- Interacción: puntero / arrastre táctil, sin bloqueo de scroll ----------
  // Las tijeras aparecen a la derecha y el corte ocurre hacia el centro:
  // el progreso crece cuando el cursor se mueve hacia la izquierda, para
  // que el gesto siga la misma dirección que el movimiento visual de las
  // tijeras (arrastrar hacia la hebra), no al revés.
  function updatePointer(clientX) {
    if (stage !== 'interactive') return;
    const rect = canvas.getBoundingClientRect();
    pointerProgress = THREE.MathUtils.clamp(1 - (clientX - rect.left) / rect.width, 0, 1);
  }
  canvas.addEventListener('pointermove', (e) => updatePointer(e.clientX));
  canvas.addEventListener('pointerdown', (e) => updatePointer(e.clientX));

  // ---------- Sonido: clack sutil, sintetizado, solo tras gesto del usuario ----------
  let audioCtx = null;
  function playClack() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;

      const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 2200;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.35, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      noise.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
      noise.start(t0);

      const click = audioCtx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(1400, t0);
      click.frequency.exponentialRampToValueAtTime(400, t0 + 0.045);
      const clickGain = audioCtx.createGain();
      clickGain.gain.setValueAtTime(0.18, t0);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
      click.connect(clickGain).connect(audioCtx.destination);
      click.start(t0);
      click.stop(t0 + 0.06);
    } catch (e) {
      // el sonido es un extra; si el navegador lo bloquea o falla, se ignora sin más
    }
  }

  // ============================================================
  // BUCLE DE ANIMACIÓN
  // ============================================================
  const clock = new THREE.Clock();
  let rafId;
  let stopped = false;
  let textTargets = null;

  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOutQuad = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function animate() {
    if (stopped) return;
    rafId = requestAnimationFrame(animate);
    // OJO: getElapsedTime() ya consume el delta internamente; llamarlo y
    // luego pedir getDelta() de nuevo devuelve ~0 en la segunda llamada
    // (el tiempo real ya se restó). Una sola llamada a getDelta() basta:
    // actualiza clock.elapsedTime como efecto secundario.
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Flotación sutil, constante, de la hebra intacta
    strands.forEach((s) => {
      const sway = Math.sin(t * s.speed + s.phase) * 0.05;
      const bob = Math.sin(t * s.speed * 0.6 + s.phase) * 0.035;
      s.pivot.rotation.z = sway;
      s.pivot.position.y = s.y + bob;
    });

    if (stage === 'enter') {
      const p = Math.min(elapsed() / 900, 1);
      camera.position.z = THREE.MathUtils.lerp(8.4, 7.4, easeOutCubic(p));
      if (p >= 1) goTo('approach');
    } else if (stage === 'approach') {
      const p = Math.min(elapsed() / 1300, 1);
      const e = easeOutCubic(p);
      scissorsX = THREE.MathUtils.lerp(ENTER_X, readyX, e);
      camera.position.x = THREE.MathUtils.lerp(0.3, -0.15, e);
      camera.position.z = THREE.MathUtils.lerp(7.4, 6.6, e);
      camera.lookAt(0, 0.05, 0);
      if (p >= 1) goTo('interactive');
    } else if (stage === 'interactive') {
      const targetX = THREE.MathUtils.lerp(readyX, CUT_X, pointerProgress);
      scissorsX += (targetX - scissorsX) * Math.min(dt * 6, 1);
      if (pointerProgress > 0.94) triggerCut();
    } else if (stage === 'cutting') {
      const p = Math.min(elapsed() / 260, 1);
      const close = Math.sin(p * Math.PI);
      bladeA.rotation.z = THREE.MathUtils.degToRad(BLADE_REST_DEG - 26 * close);
      bladeB.rotation.z = THREE.MathUtils.degToRad(-BLADE_REST_DEG + 26 * close);
      scissorsX += (CUT_X - scissorsX) * Math.min(dt * 10, 1);
      if (p >= 1) {
        strands.forEach((s) => {
          const dir = Math.random() > 0.5 ? 1 : -1;
          s.topPivot.userData.vel = { x: (Math.random() - 0.5) * 0.4, y: 0.5 + Math.random() * 0.3, z: (Math.random() - 0.5) * 0.3, r: dir * (0.8 + Math.random()) };
          s.bottomPivot.userData.vel = { x: (Math.random() - 0.5) * 0.4, y: -0.3 - Math.random() * 0.3, z: (Math.random() - 0.5) * 0.3, r: -dir * (0.8 + Math.random()) };
        });
        spawnBurst();
        goTo('burst');
      }
    } else if (stage === 'burst') {
      const p = Math.min(elapsed() / 650, 1);
      strands.forEach((s) => {
        [s.topPivot, s.bottomPivot].forEach((piv) => {
          const v = piv.userData.vel;
          if (!v) return;
          piv.position.x += v.x * dt;
          piv.position.y += v.y * dt;
          piv.position.z += v.z * dt;
          v.y -= 1.1 * dt; // gravedad suave
          piv.rotation.z += v.r * dt;
        });
        s.pivot.rotation.z = 0;
      });
      integrateParticles(dt, 0.55);
      if (p >= 1) {
        // Escena limpia para el nombre: las tijeras y los restos de la
        // hebra ya cumplieron su papel narrativo y no deben quedar
        // superpuestos sobre las partículas formando el nombre.
        scissors.visible = false;
        strands.forEach((s) => { s.topPivot.visible = false; s.bottomPivot.visible = false; });
        textTargets = sampleTextPositions(businessName, MAX_PARTICLES);
        beginAssemble();
        goTo('assemble');
      }
    } else if (stage === 'assemble') {
      const p = Math.min(elapsed() / 1050, 1);
      const e = easeInOutQuad(p);
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.x = THREE.MathUtils.lerp(pt.fromX, pt.toX, e);
        pt.y = THREE.MathUtils.lerp(pt.fromY, pt.toY, e);
        pt.z = THREE.MathUtils.lerp(pt.fromZ, pt.toZ, e);
      }
      writeParticlePositions();
      if (p >= 1) goTo('hold');
    } else if (stage === 'hold') {
      if (elapsed() > 650) {
        particles.forEach((pt) => {
          pt.vx = (Math.random() - 0.5) * 1.6;
          pt.vy = (Math.random() - 0.5) * 1.4 + 0.4;
          pt.vz = (Math.random() - 0.5) * 1.2;
        });
        goTo('disperse');
      }
    } else if (stage === 'disperse') {
      const p = Math.min(elapsed() / 750, 1);
      integrateParticles(dt, 1);
      particleMat.opacity = Math.max(0, (1 - p) * 0.95);
      if (p >= 1) {
        points.visible = false;
        goTo('reveal');
      }
    } else if (stage === 'reveal') {
      if (elapsed() > 80) {
        goTo('done');
        if (typeof onComplete === 'function') onComplete();
      }
    }

    scissors.position.x = scissorsX;
    renderer.render(scene, camera);
  }

  function spawnBurst() {
    points.visible = true;
    particleMat.opacity = 0.95;
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      const spread = (Math.random() - 0.5);
      pt.x = primaryCutPoint.x + spread * 0.15;
      pt.y = primaryCutPoint.y + (Math.random() - 0.5) * 0.15;
      pt.z = primaryCutPoint.z + (Math.random() - 0.5) * 0.15;
      pt.vx = (Math.random() - 0.5) * 1.8;
      pt.vy = Math.random() * 1.2 + 0.2;
      pt.vz = (Math.random() - 0.5) * 1.2;
    }
    writeParticlePositions();
  }

  function beginAssemble() {
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      pt.fromX = pt.x; pt.fromY = pt.y; pt.fromZ = pt.z;
      const target = textTargets[i % textTargets.length];
      pt.toX = target.x; pt.toY = target.y; pt.toZ = target.z;
    }
  }

  function integrateParticles(dt, gravity) {
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.vy -= gravity * dt;
    }
    writeParticlePositions();
  }

  function writeParticlePositions() {
    for (let i = 0; i < particles.length; i++) {
      particlePos[i * 3] = particles[i].x;
      particlePos[i * 3 + 1] = particles[i].y;
      particlePos[i * 3 + 2] = particles[i].z;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  animate();
  if (typeof onReady === 'function') requestAnimationFrame(onReady);

  // Se limpia sola cuando la intro se retira del DOM (evita fugas de memoria
  // si el usuario repite la introducción varias veces desde el footer).
  const cleanupObserver = new MutationObserver(() => {
    if (canvas.closest('[hidden]')) {
      stopped = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      cleanupObserver.disconnect();
      renderer.dispose();
      if (audioCtx) audioCtx.close().catch(() => {});
    }
  });
  const introRoot = canvas.closest('[data-intro]');
  if (introRoot) cleanupObserver.observe(introRoot, { attributes: true, attributeFilter: ['hidden'] });
}
