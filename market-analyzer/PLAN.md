# Dashboard de análisis de mercado con IA (estilo Polifly) — plan y estado

> Este documento es la copia del plan aprobado con el usuario, más el
> estado real de avance. Sirve para retomar el trabajo desde otra
> conversación sin perder contexto: basta con leer este fichero.

## Rediseño completo "producto real" — COMPLETO (5 fases)

El usuario pidió una revisión y rediseño completo de la app (no solo
estético): primera pantalla mucho más potente, intro 3D premium, cero
funciones "Próximamente", jerarquía visual real, estados de carga/vacío/
error en todas partes, gráficos, confirmaciones, toasts, navegación móvil
propia y motion design coherente. Se ejecuta en 5 fases con checkpoint
tras cada una (plan completo en la sesión de Claude Code, resumen aquí).

**Fase 5 — Wallet Tracker + Copy Trading + auditoría final — COMPLETA y
verificada.** Las dos últimas tarjetas "Próximamente" del dashboard pasan
a ser funciones reales, simuladas y claramente etiquetadas como tal
(decisión ya acordada con el usuario, igual patrón mock que ya usan el
analizador y el billing):

- **Wallet Tracker** (`server/services/wallet.js`, `server/routes/
  wallet.js`, `public/wallet/`): el usuario introduce cualquier
  dirección; el snapshot (holdings + actividad reciente) es determinista
  — un hash de la dirección alimenta un generador pseudoaleatorio propio
  (mulberry32), así la misma dirección da siempre el mismo resultado, sin
  depender todavía de Etherscan/Alchemy/Moralis. Badge "Modo simulado"
  visible. Direcciones seguidas persisten por usuario
  (`store.trackedWallets`); detalle completo en un modal con tabla de
  holdings y feed de actividad; "Dejar de seguir" con confirmación.
- **Copy Trading** (`server/services/copyTraders.js` +
  `copyTradingJob.js`, `server/routes/copy.js`, `public/copy/`): 4
  traders modelo estáticos con stats de ejemplo. Seguir a uno crea un
  `copyFollow`; un cron cada 10 minutos (`copyTradingJob`) abre/cierra
  posiciones por el usuario dentro del motor **real** de Paper Trading
  (mismo `store.createPosition`/`closePosition`/`updateUserBalance` que
  usa la pantalla de Trading manual), marcadas `source:'copy'` — el
  efecto es de verdad dentro del simulador, nunca se mueve dinero real ni
  se conecta a ningún trader real. Badge "Simulado — sin fondos reales"
  bien visible por el riesgo legal ya detectado. Seguir dispara además un
  primer impulso inmediato (no hay que esperar al cron) para que se note
  al instante en la demo.
- **Dashboard**: ambas tarjetas ya enlazan a `/wallet` y `/copy` sin
  `disabled`/`badge-soon`.
- **Navegación**: añadidas al sidebar de escritorio (6 iconos + logo, con
  scroll interno de seguridad por si la pantalla es muy baja); se quedan
  fuera de la bottom nav móvil a propósito (se mantiene en 5 accesos:
  Inicio/Analyzer/Trading/Picks/Ajustes) — en móvil se llega a ellas
  desde las tarjetas del dashboard, evitando saturar la barra inferior.
- **Bug corregido durante la verificación**: los importes de "actividad
  simulada" del Wallet Tracker podían salir con artefactos de coma
  flotante (`17.200000000000003`) por sumar un `+0.1` después de un
  `Math.round` intermedio; arreglado redondeando una sola vez al final.
- **Auditoría final** (checklist completo, con Playwright): recorridas
  las 7 pantallas (login/dashboard/analyzer/trading/picks/wallet/copy) en
  5 resoluciones (1920/1440/1366/tablet~820/390) sin overflow horizontal
  en ninguna; intro + skip/ESC siguen funcionando; navegación de
  escritorio y móvil funcionan; cero "Próximamente" restantes; todos los
  botones ejecutan una acción real; modales, formularios y confirmaciones
  funcionan; regresión funcional completa (auth, analyzer, trading,
  picks, billing) sin errores de consola nuevos. README y estructura de
  ficheros actualizados para reflejar el estado final.

**Fase 4 — Paper Trading — COMPLETA y verificada.** Backend: `Position`
gana `stopLoss`/`takeProfit`/`closeReason`('manual'|'sl'|'tp')/`costBasis`
opcionales; `checkAndAutoClose(userId, prices)` se ejecuta al principio de
`GET /api/trading` (que la página ya sondea cada 15s) y cierra sola
cualquier posición que cruce su SL/TP al último precio muestreado, con la
misma liquidación de saldo que un cierre manual (factorizada en
`settleClose`). `market.js` guarda un histórico corto en memoria (hasta
40 muestras por símbolo, una por cada refresco real de caché, nunca
inventadas) y lo expone en `GET /api/trading/chart/:symbol`, nuevo,
usado para un sparkline real sin ninguna librería de gráficos.

Frontend reconstruido: ticket de orden con símbolo + sparkline, precio en
vivo, Comprar/Vender con feedback visual, SL/TP opcionales en un desplegable,
y un modal de confirmación (reutilizando `shared/modal.js`) tanto para
abrir como para cerrar una posición — nunca se envía nada sin confirmar.
Balance y P&L abierto usan `animateNumber` en vez de saltar en seco. Toasts
de éxito/error, y un toast específico cuando una posición se cierra sola
por stop-loss o take-profit (detectado comparando el `closeReason` entre
cargas). Tabla ampliada con columna de % y badge SL/TP/manual en el cierre.
Skeleton en la tabla durante la primera carga. Verificado con Playwright:
apertura con SL/TP, cierre automático real disparado por un take-profit ya
cumplido (badge TP visible, saldo liquidado), confirmaciones bloquean el
envío hasta aceptarlas, sparkline se pinta, sin overflow en ninguna
resolución, regresión completa (incluye el nuevo paso de confirmación)
sin errores nuevos.

**Fase 3 — AI Analyzer — COMPLETA y verificada.** Backend: `POST /api/
analyzer` acepta ahora `symbolHint`/`timeframe` opcionales (junto a la
imagen), se pasan al prompt de Claude en modo live y se reflejan en las
plantillas mock; se guardan en el registro del análisis. Frontend
reconstruido: cabecera con icono propio, selector de activo (chips
BTC/ETH/SOL/BNB/XRP) y de temporalidad (15m/1H/4H/1D/1W), dropzone más
grande, animación de procesamiento por pasos ("Leyendo gráfico…" →
"Detectando patrones…" → "Generando análisis…") que avanza por tiempo
pero el último paso espera a la respuesta real, barra visual de
soporte/resistencia sobre una escala (SVG/CSS, sin librería), historial
convertido en tarjetas clicables (`.data-card`) que reabren el análisis
completo en el panel de resultado en vez de una lista plana, y toasts de
éxito/error. Bug encontrado y corregido: el aviso de "todavía no has
analizado nada" usaba un `style="display:flex"` en línea que ganaba al
atributo `hidden` (mismo patrón de bug que el badge de la intro en la
Fase 1) — pasado a una clase con `.empty-hint-panel[hidden]{display:none}`
explícito. Verificado con Playwright: selección de activo/temporalidad
viaja al backend, animación de procesamiento visible durante la petición,
historial reabre análisis antiguos, cuota/upsell del plan gratuito sigue
funcionando, sin overflow en móvil, regresión completa sin errores
nuevos.

**Fase 2 — Dashboard + navegación — COMPLETA y verificada.** Backend:
`PATCH /api/auth/me` para editar el nombre (`store.updateUserName`).
Cabecera enriquecida: indicador de conexión real (reacciona a
`online`/`offline`), reloj, botón de ajustes que abre un modal genérico
nuevo y reutilizable (`shared/modal.js`) con el nombre editable y acceso
a la suscripción. Dashboard con fila de métricas reales (saldo, P&L
abierto, posiciones abiertas, leídas de `GET /api/trading`) con skeleton
mientras cargan, y un CTA contextual (analiza tu primer gráfico / abre tu
primera operación, según lo que le falte al usuario) en vez de uno fijo.
Navegación móvil rediseñada de cero: por debajo de 640px el sidebar se
oculta por completo y aparece una bottom nav fija pensada para el pulgar
(Inicio/Analyzer/Trading/Picks/Ajustes), no una miniatura del sidebar de
escritorio. Corregido además un descentrado que el usuario señaló en
pantallas anchas: `.content` se centraba dentro de `.main`, pero como
`.main` ya arranca desplazado por el ancho del sidebar, el resultado se
veía pegado a la izquierda — a partir de 1300px de ancho se compensa ese
desplazamiento (mismo cálculo aplicado al `.topbar` para que quede
alineado) y ahora sí queda centrado respecto a toda la pantalla. Fix de
seguridad de paso: `user.name` se interpolaba sin escapar en el topbar
(XSS si alguien pone HTML como nombre); añadido `escapeHtml()` en
`shared/format.js` y aplicado donde corresponde. Verificado con
Playwright: centrado exacto en 1920px, stat-cards con datos reales, CTA
contextual correcto, modal de ajustes guarda y persiste tras recargar,
ESC lo cierra, bottom nav navega y el sidebar queda oculto en móvil, sin
overflow horizontal en ninguna página/resolución, regresión funcional
completa sin errores nuevos.

**Fase 1 — Sistema de diseño + intro 3D + login/landing — COMPLETA y
verificada.** Ampliados los tokens (tipografía, spacing, sombra lg),
nuevos niveles de tarjeta (`.stat-card`/`.action-card`/`.data-card`),
skeletons (`.skeleton*`), sistema de toasts (`shared/toast.js`) y helpers
de formato/animación numérica (`shared/format.js`). Unificado el set de
iconos duplicado (`shared/icons.js` es ahora la única fuente; `sidebar.js`
ya no tiene su propio `ICONS`). Nueva introducción 3D premium
(`shared/intro.js` + `shared/intro-scene.js` + `shared/intro.css`),
arquitectura calcada del patrón ya probado en `peluqueria-premium/`
(nunca modificado, solo leído como referencia): partículas que ensamblan
el icono de marca en 3D con Three.js (vendor local copiado a
`public/vendor/`), gate por `localStorage`, botón "Saltar intro" + ESC,
`deviceTier()` con fallback ligero en CSS puro para gama baja/sin WebGL,
`prefers-reduced-motion` respetado, límites de espera para no bloquear
nunca la app. Login rediseñado a landing de dos columnas (hero grande +
3 bullets + CTA, tarjeta de auth intacta funcionalmente). Bug encontrado
y corregido durante la verificación: el overlay `.intro__lite` se pintaba
encima del canvas 3D porque una regla de autor con `display:flex` ganaba
al atributo `hidden` (mismo empate de especificidad, origen de autor
gana); corregido con `.intro__lite[hidden]{display:none}`. Verificado con
Playwright: intro aparece solo la primera vez, skip/ESC/`?intro=force`
funcionan, cero peticiones a Three.js con `reduced-motion`, sin overflow
horizontal en 1920/1440/1366/820/390, regresión funcional completa
(signup/login/dashboard/analyzer/trading/picks/billing) sin errores
nuevos.

## Ajuste de layout de tarjetas (píldora + grupo azul compartido) COMPLETA

A partir de la captura real de referencia, se corrigió el rediseño: el
icono y el nombre de cada tarjeta ahora van en horizontal dentro de una
píldora blanca redondeada (antes iban apilados verticalmente), mucho más
grande y legible. Las dos tarjetas principales (AI Analyzer, Paper
Trading) ya no llevan cada una su propio borde azul: comparten un único
contenedor `.primary-group` con halo/fondo azul sutil que las envuelve a
ambas. Nombres en mayúsculas pasan a texto normal ("AI Analyzer" en vez
de "AI ANALYZER"). Añadido ajuste responsive específico (`.primary-group`
en `max-width:640px`) para que el texto de la píldora no se corte en
móvil. Verificado con Playwright en 1366px y 390px (sin overflow
horizontal) y regresión funcional completa (signup, analyzer con cuota,
trading abrir/cerrar posición, picks, upgrade a Pro) sin errores nuevos.

## Rediseño visual "SaaS premium blanco" COMPLETA y verificada

A petición del usuario, reestructuración visual completa del dashboard
(sin tocar funcionalidad/rutas): fondo blanco puro, sidebar con logo-icono
(tendencia alcista) en vez de letra, header con nombre + avatar + botón
"Upgrade!", tarjetas grandes con zona visual (icono grande de color propio
por herramienta + patrón de cuadrícula sutil tipo papel milimetrado +
nombre en mayúsculas) y zona inferior (título pequeño + descripción), las
dos herramientas principales (AI Analyzer, Paper Trading) con halo azul
sutil, tipografía Inter cargada en todas las páginas, hover con elevación
suave. Nuevo token `--field-bg` para inputs/badges/hovers grises ahora que
`--bg` es blanco puro. Fix de responsive: el topbar pasa a columna por
debajo de 640px (si no, desbordaba en móvil). Verificado con Playwright en
1366/768/390px sin overflow horizontal, y regresión funcional completa
(auth, analyzer, trading, picks, billing) sin errores nuevos.

## Fase 2 — Suscripción de pago (Vantex Pro) COMPLETA y verificada

AI Analyzer limitado a 3 análisis/día en el plan gratuito; botón "Hazte
Pro" (4,99€/mes) lo quita. Stripe integrado con el mismo patrón mock/live
que el analizador (`BILLING_MODE`, ver README sección "Cobrar con
Stripe"): sin claves de Stripe, "Hazte Pro" marca al usuario como Pro al
instante para poder probar todo el paywall. Nuevo:
`server/services/billing.js`, `server/routes/billing.js`, campos
`plan`/`stripeCustomerId` en `store.js`, badge "PRO"/botón "Hazte Pro" en
`shared/sidebar.js`, bloque de upsell en `public/analyzer/`. Verificado
end-to-end con Playwright: 3 análisis gratis → bloqueo con upsell →
upgrade mock → análisis ilimitados → downgrade mock → límite vuelve a
aplicarse. Sin errores de consola nuevos.

## Estado actual — Fase 1 COMPLETA y verificada

Todo lo listado en "Estructura de archivos objetivo" está implementado:
backend completo (auth, analyzer, trading, picks, servicios), frontend
completo (login/dashboard/analyzer/trading/picks + shared), README.md.

Verificado end-to-end con Playwright (registro → analizador en modo mock →
abrir y cerrar posición de paper trading → ver picks → logout → guard de
sesión), sin errores de consola reales. Dependencias sin vulnerabilidades
conocidas (`multer@2.x`, `node-cron@4.x`, `npm audit` limpio).

Nota de entorno: `server/services/market.js` intenta CoinGecko primero y,
si la red no es alcanzable (pasó en el sandbox de desarrollo por política
de proxy, pero funcionará normal en un hosting real), cae a un pequeño
generador de precios simulados para que el paper trading siga siendo
usable sin depender de esa API externa.

Marca elegida para no clonar la identidad de Polifly: **"Vantex"** (logo
"V" en índigo). Cámbialo libremente en `public/shared/sidebar.js` (logo)
y en los `<title>`/textos de cada página si quieres otro nombre.

Siguiente trabajo posible (no iniciado, ver "Fases siguientes" más abajo):
Fase 2 (Stripe, DB real, historial/export) y Fase 3 (Wallet Tracker, Copy
Trading).

## Contexto original

El usuario vio "Polifly" (polifly.io/dashboard), una plataforma de trading
cripto con: un "AI Market Analyzer" (subes la captura de un gráfico y una
IA te da un análisis/pick), Paper Trading (saldo virtual + P&L), Handpicked
Bets (picks diarios curados), Wallet Tracker y Copy Trading. Quiere construir
un dashboard equivalente, con su propia marca (no un clon 1:1 del nombre ni
del logo de Polifly — la estructura y la idea sí, la identidad visual será
propia), multi-usuario con registro, y arrancando por lo esencial primero.

Repo: sandbox con varios proyectos independientes en carpetas propias
(`peluqueria-premium/`) o en la raíz (el "sistema de llamadas": Express +
Socket.IO, sin build step, storage en `data/db.json` vía un `store.js`
propio). Este proyecto (`market-analyzer/`) sigue esa misma convención —
Node/Express + HTML/CSS/JS plano, sin framework de frontend — para no
introducir un stack nuevo que solo se use aquí.

Decisiones confirmadas con el usuario:
- Dashboard completo (no solo el analizador), pero construido por fases.
- Tema: trading/cripto.
- Código real en Claude Code, no herramienta no-code.
- Sin API key de Anthropic todavía → el analizador funciona en **modo
  mock** (ejemplos realistas) desde el día uno; con solo añadir
  `ANTHROPIC_API_KEY` al `.env` pasa a real, sin tocar código.
- Multi-usuario con registro (no un login único).

## Arquitectura

- **Backend**: Express + `express-session`. Contraseñas con `bcryptjs`.
  Subida de imágenes con `multer` (en memoria, no se guardan en disco —
  solo se envían a la IA).
- **Persistencia**: JSON file store (`data/db.json` + `server/store.js`),
  mismo patrón que el sistema de llamadas hermano — estructura
  `{ users: [...], positions: [...], analyses: [...], picks: [...] }`,
  cada registro con `userId`. Migrar a SQLite/Postgres si esto crece a
  producción real con muchos usuarios concurrentes; para el alcance
  actual (demo/portfolio funcional) el JSON file es suficiente.
- **IA (análisis de gráficos)**: `server/services/claude.js`, función
  `analyzeChart(imageBuffer, mimeType)` — YA IMPLEMENTADA:
  - Real (`ANALYZER_MODE=live` o `auto` con `ANTHROPIC_API_KEY` puesta):
    llama a Claude con visión usando **tool use forzado**
    (`record_chart_analysis`) para garantizar JSON con esta forma:
    `{ asset, trend: alcista|bajista|lateral, support: number[],
    resistance: number[], summary, bias: compra|venta|esperar,
    confidence: 0-100 }`.
  - Mock (`ANALYZER_MODE=mock`, o `auto` sin key): plantillas locales
    realistas, marcando `mock: true` en la respuesta.
  - Toda respuesta incluye `disclaimer` fijo: "Esto es información
    educativa generada por IA, no es asesoría financiera. Opera bajo tu
    propio criterio y asumiendo el riesgo."
- **Precios para Paper Trading**: `server/services/market.js` (pendiente)
  — proxy a CoinGecko `/simple/price` (sin API key) para BTC/ETH/SOL/BNB/
  XRP, con caché en memoria ~30s.
- **Autenticación**: sesión de servidor (cookie httpOnly), rutas
  `/api/auth/signup|login|logout|me` (implementadas). Middleware
  `requireAuth` (implementado) protege las rutas de datos; las páginas de
  `public/` deben redirigir a `/login` si `GET /api/auth/me` da 401.

## Estructura de archivos objetivo

```
market-analyzer/
  package.json                    [hecho]
  .env.example                    [hecho]
  PLAN.md                         [hecho — este fichero]
  README.md                       [pendiente]
  data/                           (gitignored; se crea sola)
  server/
    index.js                      [pendiente]
    store.js                      [hecho]
    middleware/requireAuth.js     [hecho]
    routes/
      auth.js                    [hecho]
      analyzer.js                 [pendiente]
      trading.js                  [pendiente]
      picks.js                    [pendiente]
    services/
      claude.js                  [hecho]
      market.js                   [pendiente]
      picksJob.js                 [pendiente]
  public/
    shared/                       [pendiente]
    login/                        [pendiente]
    dashboard/                    [pendiente]
    analyzer/                     [pendiente]
    trading/                      [pendiente]
    picks/                        [pendiente]
```

## Fases siguientes (no construir todavía)

- **Fase 2**: SQLite/Postgres si hay uso real concurrente; historial/
  export del analizador; paywall real con Stripe para "Upgrade".
- **Fase 3 — Wallet Tracker y Copy Trading**: necesitan un proveedor de
  datos on-chain (Etherscan/Alchemy/Moralis) y, en Copy Trading, mover
  fondos reales de usuarios — riesgo legal/regulatorio serio (custodia,
  licencias de money transmission) que merece su propio análisis antes de
  tocar código. Tarjetas "Próximamente" en el dashboard mientras tanto.

## Verificación (cuando se retome y se complete)

1. `cd market-analyzer && npm install && cp .env.example .env && npm run dev`.
2. `/login` → crear cuenta → redirige al dashboard, `GET /api/auth/me` OK.
3. `/analyzer` → subir una captura → en modo mock responde al instante con
   el esquema fijo + aviso de modo de ejemplo.
4. `/trading` → abrir posición → balance baja y P&L se recalcula contra el
   precio de CoinGecko; cerrar posición → balance se ajusta.
5. `/picks` → se muestra al menos un pick.
6. Cerrar sesión → las páginas del dashboard redirigen a `/login`.

## Cómo retomar esto en otra conversación

Decir algo como: "sigue con market-analyzer, lee market-analyzer/PLAN.md y
continúa desde donde quedó" — con leer este fichero ya hay contexto
completo sin necesitar el historial de la conversación original.
