# Plantilla premium para peluquería / barbería / salón

Web de una sola página (HTML + CSS + JS, sin frameworks ni build) con
dirección de arte **luxury editorial + modern minimalism**: base carbón +
marfil, con un champán muy puntual como único acento. Pensada para
presentarse a distintos negocios (peluquerías, barberías, salones) y
quedar lista para producción **editando un único fichero de datos**, sin
tocar HTML ni CSS. No requiere `npm install` ni compilación: son ficheros
estáticos.

## Ver la web en local

Cualquier servidor estático sirve. Por ejemplo:

```bash
cd peluqueria-premium
python3 -m http.server 8080
# abre http://localhost:8080
```

(Abrir `index.html` directamente con doble clic también funciona, pero
algunos navegadores restringen `fetch`/módulos en `file://`; se recomienda
usar un servidor local.)

## Estructura

```
peluqueria-premium/
├── index.html          Maquetación y estructura de todas las secciones.
│                        Incluye contenido estático de reserva (fallback
│                        sin JS) que coincide con data/content.js.
├── data/
│   └── content.js       ÚNICA fuente de datos del negocio (ver abajo)
├── css/
│   ├── variables.css    Tokens de diseño: color, tipografía, espaciados
│   ├── base.css         Reset, tipografía global, utilidades
│   ├── layout.css       Navbar, menú móvil, botones, campos de formulario
│   ├── sections.css     Estilos de cada sección
│   ├── animations.css   Keyframes y scroll-reveal
│   └── intro.css        Overlay de la introducción 3D (ver más abajo)
├── js/
│   ├── render.js         Lee data/content.js y rellena el HTML (data-binding
│   │                      ligero, sin build ni framework)
│   ├── main.js            Navbar dinámica, menú móvil, panel de vista previa
│   │                      de servicios, año del footer
│   ├── reveal.js          Animaciones al entrar en viewport (genérico,
│   │                      no necesita tocarse al añadir secciones)
│   ├── gallery.js         Lightbox de la galería
│   ├── booking.js         Asistente de reserva en 4 pasos + mensaje de
│   │                      WhatsApp dinámico
│   ├── faq.js             Acordeón de preguntas frecuentes
│   ├── experience.js      Pasos de "La experiencia" dirigidos por scroll
│   │                      (solo en escritorio, ver más abajo)
│   ├── compare.js         Comparador antes/después de "Resultados"
│   ├── intro.js           Orquestador de la introducción (siempre se carga)
│   ├── intro-scene.js     Escena 3D de la introducción (solo se descarga
│   │                      si hace falta, ver más abajo)
│   └── vendor/three.module.min.js   Three.js, autoalojado (ver más abajo)
└── img/                  Imágenes placeholder (sustituir, ver abajo)
```

## Cómo personalizar la web para un negocio real

**Casi todo lo que cambia de un cliente a otro vive en un único fichero:
`data/content.js`.** Es un objeto plano (`window.SITE_CONTENT`) sin
sintaxis especial: nombre y descripción del negocio, contacto, horario,
navegación, servicios, equipo, textos de cada sección, galería, reseñas y
preguntas frecuentes. `js/render.js` lo lee al cargar la página y rellena
el HTML automáticamente (texto, enlaces, imágenes, y las listas repetidas
como servicios, galería, reseñas o FAQ). **No hace falta tocar
`index.html` ni el CSS para dar de alta un negocio nuevo.**

Si por lo que sea `data/content.js` o `render.js` no llegaran a
ejecutarse, el HTML ya contiene el mismo contenido de ejemplo como texto
estático: la web sigue siendo utilizable, solo no reflejará los cambios
hechos en el fichero de datos.

### 1. Datos del negocio
Edita `data/content.js`. Cada bloque está comentado y es autoexplicativo:

- `business`: nombre, tagline, descripción, ciudad, año de fundación.
- `contact`: teléfono, WhatsApp, Instagram, dirección, enlace de Google
  Maps y horario — `hoursShort` (una línea, usada en el footer) y `hours[]`
  (el horario completo día a día que se muestra en "Contacto").
- `nav`: enlaces del menú (desktop y móvil, se generan del mismo array).
- `pillars`: los 3 pilares de la sección "Más que un corte".
- `philosophy`: las dos líneas de la sección "Filosofía" (pausa visual de
  solo texto entre Pilares y Servicios).
- `services`: lista de servicios con precio, duración e imagen — también
  alimenta los desplegables del asistente de reserva.
- `team`: solo la lista corta de nombres seleccionables en el desplegable
  "Profesional" del asistente de reserva.
- `studio`: textos e imagen de la sección "El estudio".
- `transformations`: pares antes/después de la sección "Resultados"
  (`beforeImage`, `afterImage`, `label`, `category`). Añade o quita
  objetos para cambiar cuántas transformaciones se muestran.
- `teamMembers`: fichas del equipo para la sección "El equipo" (`number`,
  `name`, `role`, `bio`, `photo`, `instagram` — pon `instagram: null` para
  ocultar el enlace en esa ficha). No confundir con `team` (arriba). El
  diseño es igual de válido con 2 fichas que con 6.
- `experienceSteps`: los pasos de la sección "La experiencia" (`number`,
  `title`, `text`, `image`).
- `gallery`: imágenes y etiquetas de la galería.
- `instagram`: `handle`, `url` y `posts[]` (4–6 imágenes) de la franja de
  Instagram, cerca del final de la página.
- `ctaFinal`: título, subtítulo y texto del botón de la última sección
  antes del footer.
- `reviews`: testimonios (sustituir por reseñas reales con permiso del
  cliente).
- `faq`: preguntas frecuentes.
- `bookingUrl`: dejar en `null` mientras no exista un sistema de reservas
  externo (Booksy, Fresha, Treatwell...); cuando exista, se puede usar
  para enlazar directamente en vez del asistente interno.

Los textos entre corchetes (`[Ciudad]`, `[Dirección del local]`,
`[Nombre del cliente]`, etc.) y los avisos en mayúsculas
(`[PERSONALIZAR...]`) son marcadores deliberados: ningún dato de negocio
real (nombre, teléfono, dirección, reseñas) viene incluido a propósito.

### 2. Color de marca
Identidad actual: **luxury editorial**, carbón + marfil, con el champán
reservado a acentos muy puntuales (líneas, hover, indicadores, iconos) —
nunca como color dominante ni fondo de sección grande. Todo el color pasa
por `css/variables.css`:

```css
--color-primary: #171614;     /* carbón — texto, navegación, botones oscuros */
--color-background: #F7F4EE;  /* marfil — fondo principal */
--color-secondary: #E8E0D3;   /* beige cálido — separación de secciones */
--color-muted: #A69B8D;       /* taupe — líneas, iconos, chrome sutil (no texto) */
--color-accent: #B49A72;      /* champán — acento muy puntual */
--color-white: #FFFFFF;
```

Las secciones alternan entre marfil y beige (ver los `background` en
`css/sections.css`) para crear ritmo sin saturar. Cambiar estos seis
valores actualiza toda la web: el resto del CSS nunca usa colores sueltos,
siempre estas variables (o las derivadas que declara el propio
`variables.css`, como `--color-ink-soft` para el cuerpo de texto).

### 3. Imágenes (`/img`)
Todas las imágenes son placeholders vectoriales (`.svg`) generados
localmente, con su nombre, uso y proporción recomendada indicados dentro
de la propia imagen. Sustitúyelas por fotografías reales **manteniendo el
mismo nombre de archivo** (o actualiza la ruta correspondiente en
`data/content.js`) y una proporción similar para que el diseño no se
descuadre:

| Archivo | Uso | Proporción recomendada |
|---|---|---|
| `hero.svg` | Fondo de la portada (foto o vídeo) | 16:10, ancha |
| `studio.svg` | Sección "El estudio" | 4:5 vertical |
| `service-1.svg`…`service-4.svg` | Panel flotante al pasar el cursor por cada servicio | 4:5 vertical |
| `before-1.svg` / `after-1.svg`, `before-2.svg` / `after-2.svg` | Comparador antes/después de "Resultados" | 4:5 vertical, mismo encuadre y distancia en cada par |
| `team-1.svg`…`team-3.svg` | Fichas de "El equipo" | 4:5 vertical, mismo encuadre e iluminación entre fotos |
| `experience-1.svg`…`experience-4.svg` | Panel fijo de "La experiencia" (uno por paso) | cuadrada |
| `gallery-1.svg`…`gallery-8.svg` | Galería (masonry) | alternan 3:4, 1:1 y 4:3, ver el nombre del archivo |
| `instagram-1.svg`…`instagram-6.svg` | Franja de Instagram | cuadrada |
| `favicon.svg` | Icono del navegador | cuadrada |

La sección "Filosofía" es deliberadamente solo texto (sin imagen): es la
pausa visual carbón/marfil de la página, y no lleva fotografía de fondo a
propósito, para no repetir el mismo recurso que ya usan Hero, Estudio,
Resultados, etc.

Recomendaciones: fotografías propias del local (nunca imágenes genéricas
haciéndolas pasar por reales), formato `.jpg`/`.webp` optimizado, peso
ideal por debajo de 300 KB por imagen.

### 4. Asistente de reserva
El formulario de `#reserva` es un asistente en 4 pasos (Servicio → Fecha →
Datos → Confirmación) que valida cada paso con las validaciones nativas
del navegador y no depende de ninguna librería. Funciona en el cliente y
dentro de `js/booking.js` deja preparada (comentada) la llamada `fetch()`
a un endpoint `/api/reservations`: conecta ahí tu backend real (o un
CRM/calendario) cuando exista. El número de WhatsApp y las franjas horarias
del `<select>` de hora se generan automáticamente desde `data/content.js`
y desde el rango 09:00–19:00 definido al principio de `js/booking.js`.

### 5. Comparador antes/después ("Resultados")
Cada tarjeta de `transformations` se renderiza como un `.compare__frame`
con dos fotos superpuestas y una línea divisoria arrastrable
(`js/compare.js`). Funciona con ratón, trackpad y pantalla táctil
(Pointer Events) y es accesible por teclado (flechas para mover el
divisor, Inicio/Fin para ir a los extremos, al estar implementado como
`role="slider"`). No depende de ninguna librería.

### 6. "La experiencia" (sección dirigida por scroll)
En escritorio (≥900 px), la imagen de la derecha se queda fija
(`position: sticky`, sin JS) mientras el usuario recorre los pasos de la
izquierda; `js/experience.js` usa un `IntersectionObserver` para detectar
qué paso cruza el centro de la pantalla y activa su imagen y su
línea/número — sin scroll-jacking. En móvil, o con
`prefers-reduced-motion` activado, se simplifica a una lista lineal
normal y el script no interviene.

### 7. Mapa de Google
En `index.html`, dentro de `<section class="contact">`, hay un bloque de
marcador de posición (`.contact__map-placeholder`) y, justo encima en un
comentario, el `<iframe>` real listo para pegar con la URL de Google Maps
Embed de la dirección del negocio.

### 8. Aviso legal / política de privacidad
El enlace del asistente de reserva ("política de privacidad") apunta a
`#` y debe enlazar a la página legal real del negocio.

### 9. Introducción 3D — "THE PERFECT CUT"
Al entrar por primera vez aparece una intro cinematográfica a pantalla
completa, pensada específicamente para una marca de peluquería premium (no
un genérico "cargando..."): sobre negro aparece un pequeño mechón de
cabello flotando con un balanceo sutil; unas tijeras metálicas entran desde
un lateral; el usuario mueve el cursor (o arrastra el dedo en táctil) en
horizontal para acercarlas — al llegar al punto de corte, cortan solas con
un golpe seco (con su propio sonido sintetizado) y salen despedidas
partículas de cabello; esas partículas se agrupan un instante formando el
nombre del negocio (dato real desde `business.name`, nunca hardcodeado) y
luego se dispersan mientras la escena da paso al Hero. Toda la geometría es
procedural (curvas + tubos para el cabello, formas extruidas + toros para
las tijeras) — no hay modelos ni texturas externas que sustituir.

No vuelve a aparecer en visitas siguientes (se recuerda en `localStorage`),
tiene un botón **"Saltar intro"** siempre visible arriba a la derecha y
responde a `Esc`, y hay un enlace discreto **"Ver introducción"** en el
footer para repetirla. Con `prefers-reduced-motion` activado, la escena 3D
no se reproduce en absoluto: se ve el nombre del negocio un instante y se
pasa directo al Hero.

En **dispositivos sin WebGL o de gama realmente baja** (poca CPU/memoria)
se sustituye automáticamente por una versión ligera en SVG + CSS con la
misma idea e interacción (arrastrar para acercar las tijeras y cortar), sin
cargar Three.js en absoluto. En móvil normal o gama media la escena 3D sí
se usa, pero con menos partículas y sin antialiasing para no generar lag.
La lógica de decisión está en `js/intro.js` (`deviceTier()`): ajusta ahí
los umbrales si quieres ser más o menos exigente.

Para probarla en desarrollo sin esperar a que expire el `localStorage`:
añade `?intro=force` a la URL para forzarla siempre, o `?intro=skip` para
desactivarla temporalmente.

Qué tocar para personalizarla:
- **Colores**: la escena 3D (`js/intro-scene.js`, constantes
  `COLOR_HAIR`/`COLOR_METAL`/`COLOR_PARTICLE`/`COLOR_KEY_LIGHT`/
  `COLOR_FILL_LIGHT`/`COLOR_RIM_LIGHT`) y la versión ligera (el `<svg>`
  dentro de `#intro` en `index.html`) usan tonos neutros (negro, blanco,
  gris metálico) con un único acento cálido; si quieres que ese acento use
  el color de marca configurado en `css/variables.css`, actualiza esas
  constantes hexadecimales a mano (el `<canvas>`/`<svg>` no leen variables
  CSS).
- **Nombre del negocio**: se rellena solo desde `business.name` en
  `data/content.js` — tanto en las partículas de la escena 3D
  (`sampleTextPositions`) como en el `<p class="intro__logo"
  data-bind="business.name">` de la versión ligera y del modo
  "solo marca" de `prefers-reduced-motion`.
- **Duración y sensibilidad del corte**: `MAX_WAIT_MS` (tiempo máximo de
  espera sin interactuar) está en `js/intro.js`; la duración de cada fase
  narrativa (aproximación, corte, partículas, formación del nombre,
  dispersión) y el umbral de arrastre que dispara el corte están al
  principio de `js/intro-scene.js` (`READY_X`, `CUT_X`, `CUT_T` y los
  divisores de tiempo dentro de `animate()`).
- **Sonido**: el "clack" del corte es sintetizado con Web Audio (sin
  ficheros de audio que mantener) y solo suena tras el gesto del usuario,
  nunca en autoplay; si falla o el navegador lo bloquea, se ignora sin
  afectar a la parte visual. Para quitarlo del todo, vacía la función
  `playClack()` en `js/intro-scene.js`.
- **Desactivarla del todo**: borra o comenta el bloque `<div class="intro" ...>`
  en `index.html` y su `<script src="js/intro.js">`; el resto de la web
  no depende de ella.

**Sobre `js/vendor/three.module.min.js`**: es la única dependencia externa
de toda la plantilla (el resto es HTML/CSS/JS sin librerías). Va
autoalojada a propósito, no desde un CDN, para que la web no dependa de un
tercero en tiempo de ejecución. Solo se descarga (mediante `import()`
dinámico) cuando `js/intro.js` decide usar la versión 3D — en móvil, con
`prefers-reduced-motion`, o en visitas repetidas, no se descarga nunca.
Pesa ~670 KB sin comprimir (~165 KB con gzip/brotli, que casi cualquier
hosting aplica automáticamente); si actualizas la librería, vuelve a
generar el fichero con `npm install three@<versión> --prefix /tmp/three &&
cp /tmp/three/node_modules/three/build/three.module.min.js js/vendor/`.

## Notas técnicas

- **Prácticamente sin dependencias ni build**: HTML/CSS/JS vanilla, fácil
  de mantener por cualquier agencia o el propio negocio. La única
  excepción es Three.js, autoalojado y usado solo por la introducción 3D
  — el resto de la web no lo necesita para nada.
- **Arquitectura de datos**: `data/content.js` es la única fuente de
  contenido de negocio; `js/render.js` es el único sitio donde el HTML
  "conoce" la forma de ese objeto. Si algún día esto se convierte en un
  CMS real, solo hay que cambiar cómo se obtiene `SITE_CONTENT` (por
  ejemplo, una llamada a una API) — el resto del código no cambia.
- **Orden de carga**: `data/content.js` y `js/render.js` se cargan sin
  `defer` al final del `<body>` (para rellenar el HTML antes de que
  cualquier otro script lo consulte); `reveal.js`, `gallery.js`,
  `booking.js`, `faq.js`, `experience.js`, `compare.js` y `main.js` se
  cargan con `defer` y se ejecutan después de que `render.js` haya
  reconstruido las listas del DOM.
- **Rendimiento**: imágenes con `loading="lazy"` (excepto el hero),
  fuentes con `font-display: swap`, sin librerías de animación externas
  (todo con CSS + `IntersectionObserver`), galería en masonry con CSS
  puro (`columns`, sin JS de layout), y la introducción 3D con carga
  perezosa (`import()` dinámico) solo cuando hace falta.
- **Accesibilidad**: navegación por teclado en el menú móvil, el
  lightbox, el acordeón de FAQ y el asistente de reserva;
  `:focus-visible`, `prefers-reduced-motion` respetado en todas las
  animaciones (incluida la introducción), textos alternativos en
  imágenes, validación nativa de formularios.
- **SEO**: metadatos Open Graph, `title`/`description`, jerarquía de
  encabezados H1–H3 y datos estructurados `HairSalon` (schema.org) listos
  para rellenar con datos reales.
