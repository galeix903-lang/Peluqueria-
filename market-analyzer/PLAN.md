# Dashboard de análisis de mercado con IA (estilo Polifly) — plan y estado

> Este documento es la copia del plan aprobado con el usuario, más el
> estado real de avance. Sirve para retomar el trabajo desde otra
> conversación sin perder contexto: basta con leer este fichero.

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
