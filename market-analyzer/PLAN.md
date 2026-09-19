# Dashboard de análisis de mercado con IA (estilo Polifly) — plan y estado

> Este documento es la copia del plan aprobado con el usuario, más el
> estado real de avance. Sirve para retomar el trabajo desde otra
> conversación sin perder contexto: basta con leer este fichero.

## Estado actual (WIP — pausado a petición del usuario)

Hecho:
- [x] `package.json`, `.env.example`
- [x] `server/store.js` (persistencia JSON)
- [x] `server/middleware/requireAuth.js`
- [x] `server/routes/auth.js` (signup/login/logout/me)
- [x] `server/services/claude.js` (análisis real vía Claude + modo mock)

Pendiente (siguiente en la lista, en este orden):
- [ ] `server/routes/analyzer.js` (endpoint `POST /api/analyzer`: multer +
      `services/claude.js`, guarda el resultado con `store.addAnalysis`)
- [ ] `server/services/market.js` (precios desde CoinGecko `/simple/price`,
      caché en memoria ~30s, símbolos: BTC, ETH, SOL, BNB, XRP)
- [ ] `server/routes/trading.js` (listar/abrir/cerrar posiciones de paper
      trading, recalcular P&L contra `market.js`, actualizar
      `store.updateUserBalance`)
- [ ] `server/services/picksJob.js` + `server/routes/picks.js` (1-2 picks/
      día generados con `claude.js` sobre símbolos fijos, guardados con
      `store.addPick`; cron ligero con `node-cron`)
- [ ] `server/index.js` (bootstrap: Express, `express-session`, sirve
      `public/`, monta todas las rutas anteriores bajo `/api/...`)
- [ ] `public/shared/` — CSS común (sidebar, cards, tema oscuro/claro a
      elegir), `api.js` (fetch helper con manejo de 401), `auth-guard.js`
      (redirige a `/login` si `GET /api/auth/me` da 401)
- [ ] `public/login/index.html` (login + registro con tabs)
- [ ] `public/dashboard/index.html` (home: tarjetas AI Analyzer / Paper
      Trading / Handpicked Bets; Wallet Tracker y Copy Trading como
      "Próximamente")
- [ ] `public/analyzer/index.html` (subir imagen, ver resultado + aviso de
      modo mock, historial simple)
- [ ] `public/trading/index.html` (saldo, formulario "Enter Trade", tabla
      de posiciones con P&L en vivo)
- [ ] `public/picks/index.html` (feed de picks)
- [ ] `README.md` del proyecto (cómo arrancar, cómo pasar de mock a real)
- [ ] `npm install` + probar el flujo completo end-to-end

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
