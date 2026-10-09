# Dashboard de análisis de mercado con IA (estilo Polifly) — plan y estado

> Este documento es la copia del plan aprobado con el usuario, más el
> estado real de avance. Sirve para retomar el trabajo desde otra
> conversación sin perder contexto: basta con leer este fichero.

## Auditoría de producto completa + implementación — EN CURSO

El usuario pidió actuar como un equipo completo (PM, full-stack, UX,
AI product, CRO, QA, performance, security) y hacer una auditoría real
de todo Cryptolyzer — no un informe, sino auditar → decidir → implementar →
probar. Prioridad explícita: functionality > data quality > UX > clarity
> performance > design polish, con el AI Analyzer como "prioridad
absoluta". Es un encargo de 36 secciones — un proyecto de varias
semanas condensado; este documento se actualiza fase a fase según se
completa cada bloque, no todo de una vez.

**Hallazgo más grave de la auditoría**: "Handpicked Bets"
(`server/services/picksJob.js`) le pedía a Claude una lectura "genérica
pero plausible" de BTC/ETH **sin ningún dato de precio real** — inventaba
una recomendación de la nada, incluso en modo live. Es el ejemplo
perfecto de "parece profesional pero no funciona de verdad" que el
usuario pidió priorizar. Corregido de raíz (ver más abajo).

**Completado y verificado en esta pasada** (Fases 1-4 de las 12 del
encargo — audit, arquitectura/funcionalidad, AI Analyzer, dashboard):

1. **AI Analyzer — lenguaje de sesgo + escenarios + niveles clave**
   (`server/services/signalEngine.js`, `analysisPipeline.js`,
   `public/analyzer/index.html`, `mobile/app/(tabs)/analyzer.tsx`):
   - Se sustituye COMPRAR/VENDER/ESPERAR (con emoji de semáforo) por
     "Sesgo alcista/Sesgo bajista/Neutral" — Cryptolyzer presenta escenarios
     y probabilidades, nunca una orden ni una certeza. El enum interno
     `BUY/SELL/WAIT` no cambia (evita tocar las 18 pruebas ya validadas
     del motor); solo cambia la capa de presentación.
   - Nueva función `buildScenarios()` en signalEngine.js: genera
     PRINCIPAL/ALTERNATIVO/INVALIDACIÓN siempre a partir de los mismos
     support/resistance ya calculados con datos reales — nunca una
     frase de relleno. También calcula "zona de entrada", "objetivos" y
     un "contexto de riesgo" (distancia % hasta la invalidación).
   - Bug real encontrado y corregido durante la verificación: la zona
     de entrada podía salir absurdamente ancha (soporte real pero muy
     lejano del precio actual) — se acota a un rango cercano al precio
     salvo que el nivel esté a <=3%.
   - Estructura en dos niveles: tarjeta "quick summary" (activo + sesgo
     + confianza + 3 señales clave, entendible en 5 segundos) seguida
     de "análisis detallado" (por qué, estructura, niveles, escenarios,
     riesgo) — mismo criterio en ambos frontends.
   - Puente "Simular este escenario en Paper Trading": desde un análisis
     REAL_DATA de un símbolo con Trading real, un botón rellena el
     ticket de Trading (símbolo/lado/stop-loss/take-profit) vía query
     params — el usuario siempre confirma antes de abrir nada, nunca se
     envía sola. Implementado en ambos frontends (`useLocalSearchParams`
     en móvil, `URLSearchParams` en web).
2. **Market Scanner reemplaza a Handpicked Bets** (`server/services/
   marketScanner.js` nuevo, `picksJob.js` eliminado): escanea en vivo
   los 5 símbolos con datos reales usando el MISMO motor determinista
   del AI Analyzer — cero LLM, cero invención. Sin persistencia (no es
   "el pick del día" guardado, es el estado actual recalculado cada
   vez). Si no hay datos de mercado disponibles, lo dice explícitamente
   (`unavailable: true`) en vez de mostrar una lectura inventada — se
   verificó que efectivamente NO fabrica nada cuando CoinGecko no
   responde (este sandbox), y que SÍ genera resultados reales cuando se
   mockea la capa de red con velas sintéticas. Mismo cambio en ambos
   frontends y en la navegación (sidebar, tabs, tarjetas del dashboard).
3. **Dashboard rediseñado** (`public/dashboard/index.html`): pasa de
   "cuadrícula de herramientas" a resumen de inteligencia de mercado —
   Mercado (precios reales de los 5 símbolos con datos reales + % de
   cambio sobre el histórico real, nunca inventado), Tu último análisis
   (el más reciente del propio historial), vista previa del Market
   Scanner, estadísticas de Paper Trading (saldo/P&L/posiciones + nuevo
   win rate real sobre operaciones cerradas), CTA contextual según lo
   que le falte al usuario, y una fila secundaria simplificada para
   Wallet Tracker/Copy Trading. Nuevo endpoint `GET /api/trading/prices`
   (precios + % de cambio real) y `stats` añadido a `GET /api/trading`
   (winRate/totalTrades/totalRealizedPnl, `null` si no hay operaciones
   cerradas todavía — nunca un 0% que insinúe un historial real).
4. **Auditoría de seguridad puntual**: confirmado que ninguna clave de
   API está expuesta en el frontend (web ni móvil), y que las dos rutas
   nuevas (`/api/trading/prices`, `/api/picks`) están protegidas por
   `requireAuth` igual que el resto de la API privada.
5. **Verificado**: 18/18 pruebas del motor de señal siguen pasando;
   Playwright de extremo a extremo en web y móvil para Analyzer
   (escenarios, niveles, puente a Trading), Market Scanner (estado
   vacío honesto + resultados reales con red mockeada) y Dashboard;
   regresión completa de Trading/Wallet/Copy Trading repetida sin
   diferencias en ambos frontends.

**Pendiente de esta auditoría** (fases 5-12 del encargo, no abordadas
todavía en esta pasada): Analysis History como sección de primer nivel
(hoy vive dentro del propio Analyzer, ya funcional con reapertura
completa al pulsar); Paper Trading — llevar el "Simular este escenario"
más allá del prellenado (comparar resultado real vs. escenario, ver
Track Record); Track Record (comparar escenarios pasados con lo que
ocurrió realmente — requiere diseño cuidadoso para no convertirse en
marketing engañoso, tal y como pidió explícitamente el usuario); pulido
de landing/conversión (el hero y la demo ilustrativa ya eran honestos y
razonablemente buenos en la auditoría, pendiente de un pase de copy
para el nuevo lenguaje de sesgo); onboarding de primer uso; estructura
de monetización (Free/Pro/Premium ya existe vía Stripe, sin cambios
todavios); repaso de mobile/performance/seguridad más profundo; QA
final como "usuario que descubre Cryptolyzer por primera vez".

## Motor de análisis v2 — señal determinista BUY/SELL/WAIT — COMPLETO

El usuario pidió una revisión y optimización PROFUNDA del sistema de
análisis (no del diseño visual): respuestas más acertadas, consistentes,
simples, basadas exclusivamente en datos reales disponibles, sin
inventar información, con una señal principal inequívoca (🟢 COMPRAR /
🔴 VENDER / ⚪ ESPERAR) como primera conclusión visible, con motivo y
confianza calibrada de verdad.

**Diagnóstico (antes de tocar código)**: el AI Analyzer de Cryptolyzer era
100% "visión de captura" — el usuario sube una foto de un gráfico y
Claude la interpreta a ojo. No existía ningún pipeline de datos
OHLCV/indicadores en toda la aplicación; lo único parecido eran precios
spot en vivo de 5 criptos (`server/services/market.js`, ya usado por
Paper Trading) sin velas ni volumen. Pedir al modelo que reportara
RSI/MACD/EMA "reales" a partir de solo una imagen chocaba directamente
con "no inventar datos". La salida era además un `bias` de texto libre
sin motor de scoring ni reglas de confluencia — todo dependía del juicio
de una sola llamada al LLM.

**Decisión de arquitectura**: pipeline de DOS caminos, ambos devolviendo
el mismo contrato unificado (`signal`/`confidence`/`risk`/`trend`/
`momentum`/`volume`/`structure`/`support`/`resistance`/`reasons`/
`mainReason`/`source`), implementado en
`server/services/analysisPipeline.js`:

- **Camino REAL_DATA** (los 5 símbolos con datos reales que Cryptolyzer ya
  sigue — BTC/ETH/SOL/BNB/XRP): `market.js` gana `getCandles`/
  `getMultiTimeframeCandles` (velas OHLC reales de CoinGecko, 4h/30d
  para tendencia+estructura y 30min/2d para momentum de corto plazo, con
  volumen emparejado desde `/market_chart` — nunca inventado, si no hay
  volumen el campo queda `UNAVAILABLE` en vez de rellenarse). Sobre esas
  velas, tres módulos deterministas nuevos, sin ningún LLM de por medio:
  - `server/services/indicators.js`: EMA/RSI(Wilder)/MACD/ATR/volumen
    relativo — funciones puras, cada una probada con velas sintéticas.
  - `server/services/structure.js`: swings de máximos/mínimos,
    agrupación en niveles de soporte/resistencia por número de toques,
    estructura de tendencia (HH/HL vs LH/LL), y detección de ruptura que
    exige que el nivel se haya respetado como frontera en la MAYORÍA del
    histórico (no solo una ventana corta) y que el cierre reciente esté
    ya de forma sostenida al otro lado — así una ruptura de verdad nunca
    se confunde con el cruce normal de cada ciclo de un mercado lateral.
  - `server/services/signalEngine.js`: motor de scoring (pesos
    tendencia 35% / momentum 25% / precio-estructura 25% / volumen 15%,
    volatilidad usada para el riesgo, no para la dirección) que exige
    confluencia real (si hay tantas señales en contra como a favor →
    ESPERAR sea cual sea el score) y aplica la regla explícita del
    usuario: RSI>70 NO es venta automática ni RSI<30 compra automática
    — el momentum se puntúa por dirección reciente y MACD, un RSI
    extremo solo penaliza la confianza. Multi-timeframe: la tendencia de
    4h/30d manda; el momentum de 30min/2d solo puede reducir la
    confianza y dejar constancia si contradice al principal, nunca
    voltear la señal él solo. Cero llamadas a un LLM en este camino —
    más rápido y sin superficie de alucinación posible.
- **Camino VISUAL** (cualquier otro activo — la mayoría de capturas
  reales: acciones, forex, alts sin cobertura, o sin símbolo indicado):
  Claude Vision sigue leyendo la imagen (`server/services/claude.js`,
  schema rehecho: `priceAxisLegible` explícito, `visualBias`/
  `modelConfidence` en vez de una `confidence` en la que el pipeline
  confiaría a ciegas), pero la confianza mostrada al usuario NUNCA es la
  que reporta el modelo tal cual — `analysisPipeline.js` la gobierna a
  partir de señales objetivas (¿se lee el eje?, ¿hay niveles?, ¿se
  identificó el activo?) mezcladas solo al 45% con la autoevaluación del
  modelo, con un TOPE DURO de 60% de confianza (el camino visual nunca
  puede presentarse como igual de fiable que el real), y la señal se
  fuerza a ESPERAR si la confianza gobernada queda por debajo de 35%.
  `momentum`/`volume`/`structure` se marcan `UNAVAILABLE` en este camino
  — nunca se finge haber calculado algo que solo se leyó a ojo.
- **Fallback honesto**: si un símbolo tiene cobertura real pero
  CoinGecko no responde en ese momento (o está bloqueado, como en este
  sandbox de desarrollo), nunca se inventan velas — cae al camino visual
  con una nota explícita ("no se pudieron obtener datos de mercado en
  tiempo real para X"), nunca en silencio.

**Bugs reales encontrados y corregidos durante las pruebas** (con
velas sintéticas, `server/scripts/test-signal-engine.js`, 18 escenarios
— tendencia fuerte alcista/bajista, lateral, ruptura alcista/bajista,
falsa ruptura, RSI extremo, señales contradictorias, pocos datos, sin
volumen, alta/baja volatilidad, determinismo):
1. El scoring de momentum por RSI tenía rangos solapados y asimétricos
   (45-70 y 30-55 se pisaban) que podían dar momentum "positivo" en
   plena tendencia bajista — reescrito simétrico alrededor de 50.
2. La detección de ruptura solo miraba la vela anterior — un impulso de
   varias velas ya la había dejado atrás. Reescrita para exigir que el
   nivel se respetara en la MAYORÍA del histórico completo (no una
   ventana corta) y que el tramo reciente esté ya sostenido al otro
   lado — esto también corrigió falsas rupturas en mercados laterales
   (cada ciclo cruza sus propios niveles, eso no es una ruptura).
3. Los niveles de soporte/resistencia usados para detectar ruptura
   ahora exigen 2+ toques (un solo swing no es un nivel real).

**Frontend** (web `public/analyzer/index.html` + móvil `mobile/app/
(tabs)/analyzer.tsx`, mismo contrato, mismo criterio en ambos):
resultado reestructurado con la señal como lo primero y más grande que
se ve (badge grande 🟢/🔴/⚪ + COMPRAR/VENDER/ESPERAR), confianza justo
debajo, motivo principal en una frase, una nota que dice explícitamente
si la señal viene de datos reales o de una lectura visual, una rejilla
de 4 hechos (Tendencia/Momentum/Volumen/Estructura), riesgo, precio
cuando está disponible, niveles de soporte/resistencia, y una lista
corta (máximo 5) de las señales que de verdad justifican la conclusión
— nunca un párrafo largo. Chips de símbolo marcados con ★ para los que
tienen datos reales detrás. Historial también migrado a mostrar el
badge de señal en vez del `bias` de texto libre anterior.

**Verificado**: 18/18 pruebas del motor determinista con velas
sintéticas; test de integración del pipeline completo (mockeando
`market.getMultiTimeframeCandles`) confirmando que un símbolo con velas
reales usa el camino REAL_DATA sin ninguna llamada a Claude, que la
caída a visual cuando CoinGecko no responde deja la nota honesta
esperada, y que un símbolo sin cobertura ni siquiera intenta la petición
de mercado; Playwright de extremo a extremo en web y móvil (señal
visible, confianza, nota de fuente, hechos, riesgo, historial con
badge, cero errores de consola); regresión completa de Trading/Picks/
Wallet/Copy/notificaciones/edición de perfil repetida sin diferencias.
**Limitación honesta**: este sandbox bloquea la salida a CoinGecko, así
que el camino REAL_DATA está verificado con velas sintéticas y un test
de integración con la capa de red mockeada, pero no se ha podido
comprobar aquí contra CoinGecko en vivo — en producción (Render, mismo
proveedor que ya usa Paper Trading con éxito) debería funcionar igual.

## App móvil nativa (Expo + Router) — COMPLETA (Fases 0-6)

El usuario pidió convertir Cryptolyzer en una app nativa real para iOS/
Android (App Store/Google Play), no una web empaquetada. Auditoría
completa hecha primero (framework real: Node/Express + HTML/JS plano
sin build step, ninguna parte de la web reutilizable como componente).
Decisión: Expo + Router + EAS, proyecto nuevo en `mobile/` (ver
`mobile/README.md` para su propio estado y cómo ejecutarlo). Roadmap
acordado: Fase 0 (scaffold) → Fase 1 (backend real) → Fase 2 (auth +
Home en la app) → Fase 3 (AI Analyzer) → Fase 4 (Trading/Wallet/Copy/
Picks) → Fase 5 (push, storage seguro, suscripciones, build de
producción).

**Fase 1 — Backend real (Postgres + auth por token) — COMPLETA y
verificada.** Bloqueante que había que resolver antes de conectar
cualquier pantalla de la app a datos reales:
- `server/store.js` reescrito de fichero JSON plano a Postgres
  (`server/db.js`: pool + migraciones idempotentes en
  `server/migrations/001_init.sql`), manteniendo exactamente los mismos
  nombres de función y misma forma de los objetos (camelCase) — las
  rutas solo han tenido que añadir `await`, ningún cambio de
  comportamiento para la web. `analyses`/`picks` guardan sus campos que
  siguen evolucionando (reasoning/isChart/...) en una columna JSONB en
  vez de una columna por campo, para no fragilizar el esquema.
- Nueva autenticación por token para la app móvil, en paralelo a la
  cookie de sesión de la web (que sigue funcionando igual):
  `POST /api/auth/mobile/signup|login` devuelven un access token JWT de
  2h + un refresh token opaco de 30 días guardado hasheado en Postgres
  (`refresh_tokens`, con rotación: cada uso revoca el token y emite uno
  nuevo). `requireAuth` acepta sesión O `Authorization: Bearer` y deja
  `req.userId` listo para cualquier ruta — mismo código sirve a las dos
  plataformas.
- La comprobación de email único, que antes dependía de que store.js
  fuera síncrono de un solo hilo, ahora la garantiza un índice único de
  Postgres (`lower(email)`) + capturar el error `23505` — más robusto
  incluso que antes (funciona con varios procesos del servidor, no solo
  uno).
- `server/scripts/migrate-json-to-pg.js`: importa un `data/db.json`
  antiguo a Postgres conservando los IDs, por si había datos de antes de
  este cambio que conservar.
- `render.yaml` actualizado: provisiona una base de datos Postgres
  gestionada de Render y rellena `DATABASE_URL` sola.
- **Verificado**: Postgres real instalado y corriendo en el propio
  entorno de desarrollo (no solo código sin probar) — migración
  aplicada, las 7 tablas creadas; regresión funcional completa
  (signup/login/trading/analyzer/picks/wallet/copy/perfil) repetida
  contra el backend nuevo sin diferencias; el mismo test de
  concurrencia que ya se había usado para el fichero JSON (8 altas en
  paralelo con el mismo email) repetido contra Postgres: exactamente 1
  cuenta creada; el mismo payload que antes tumbaba el proceso
  (`{"email":{"$ne":null},...}`) sigue devolviendo un 4xx limpio; flujo
  completo del token móvil probado con curl (signup → Bearer en ruta
  protegida → refresh → reutilizar el token viejo falla → logout →
  refresh tras logout falla). Auditoría de overflow sin regresiones.
- **Pendiente para fases siguientes**: la app móvil todavía no llama a
  ninguno de estos endpoints (eso es la Fase 2); desplegar esto en
  Render y provisionar su Postgres gestionado lo tiene que hacer el
  usuario desde su propio dashboard.

**Fase 2 — Autenticación real en la app móvil — COMPLETA y verificada.**
- Nueva pantalla `(auth)/login.tsx` (login + signup, misma estética que
  la web) y protección de rutas en `app/_layout.tsx`: sin sesión, solo
  se puede ver `(auth)`; con sesión, redirige a `(tabs)`. Patrón
  estándar de Expo Router basado en `useSegments`, no una comprobación
  manual repetida en cada pantalla.
- `src/services/authStorage.ts`: tokens en `expo-secure-store`
  (keychain/keystore cifrado — nunca AsyncStorage para credenciales);
  cae a `localStorage` solo en el target web (no soportado ahí por
  SecureStore), exclusivamente para poder previsualizar en navegador
  durante el desarrollo.
- `src/services/api.ts`: cliente fetch que añade `Authorization: Bearer`
  a cada petición y, si recibe un 401, intenta refrescar el access
  token UNA vez (compartiendo el mismo intento entre peticiones en
  paralelo) antes de reintentar — nunca deja al usuario con una sesión
  caducada sin más.
- `src/state/AuthContext.tsx`: sesión disponible en toda la app
  (usuario, signup/login/logout); al abrir la app, si había un refresh
  token guardado de una sesión anterior, se confirma solo contra
  `/api/auth/me` sin pedir credenciales otra vez (sesión persistente de
  verdad, no simulada).
- Perfil (`(tabs)/profile.tsx`) ya muestra la cuenta real (nombre,
  email, badge de plan, saldo) con un botón de cerrar sesión que
  revoca el refresh token en el servidor. Inicio saluda por el nombre
  real del usuario.
- Backend: CORS añadido a `/api/*` (`server/index.js`) — necesario para
  cualquier cliente que corra dentro de un navegador (incluida la vista
  web de desarrollo de Expo); deliberadamente sin
  `Access-Control-Allow-Credentials`, así que los endpoints de sesión
  de cookie de la web siguen sin poder llamarse en cross-origin con
  credenciales (sin abrir una vía de CSRF nueva).
- **Verificado con Playwright contra el backend en Postgres de la Fase
  1** (vista `expo start --web`, no solo código sin probar): sin sesión
  → redirige a `/login`; signup → redirige a Inicio y saluda por el
  nombre; Perfil muestra el email y el saldo reales; **recargar la
  página entera conserva la sesión** (persistencia real, tokens
  sobreviven un reload completo); cerrar sesión → redirige a `/login`;
  volver a iniciar sesión con las mismas credenciales funciona; email
  duplicado en signup y contraseña incorrecta en login muestran el
  error del servidor tal cual, sin redirigir por error. Cero errores de
  consola en todo el flujo. Regresión completa de la web repetida tras
  añadir CORS, sin diferencias.
- **Pendiente para fases siguientes**: "Olvidé mi contraseña" no está
  implementado (necesitaría un servicio de envío de email que no
  existe en el proyecto — no se ha simulado un botón sin función
  real). Analyzer/Trading/Picks/Wallet/Copy siguen siendo pantallas de
  estado ("esto se conecta en la Fase X"), eso es la Fase 3 en
  adelante.

**Fase 3 — AI Analyzer real en la app móvil — COMPLETA y verificada.**
- Pantalla Analyzer reescrita: mismo campo de activo libre (chips
  mixtos BTC/AAPL/SPY/EUR·USD como atajo, no lista cerrada — igual que
  la web) + chips de temporalidad, `expo-image-picker` para cámara o
  galería con los textos de permiso de iOS/Android declarados en
  `app.json`, previsualización de la imagen elegida, y subida real a
  `POST /api/analyzer` (mismo endpoint que usa la web) con el access
  token.
- `src/services/api.ts` gana `postForm()`: sube la imagen como
  `multipart/form-data` sin que el envoltorio de refresco de token dejе
  de funcionar (comparte la misma lógica de reintento que las demás
  peticiones). En el target web construye un `Blob` real a partir del
  `uri` que devuelve el picker; en nativo usa el objeto
  `{uri,name,type}` que espera el `fetch` de React Native — misma
  llamada, dos formas de construir el cuerpo según la plataforma.
- Resultado, banner de confianza baja/"no parece un gráfico", cuota
  diaria del plan gratuito, aviso de cuota agotada e historial
  reabrible: todo con el mismo comportamiento que la web, adaptado a
  componentes nativos (nada de WebView).
- Cuota agotada: el aviso dirige a la web para mejorar el plan en vez
  de fingir un cobro — las compras dentro de la app (StoreKit/Play
  Billing) todavía no están implementadas a propósito (ver PLAN.md
  sección de suscripciones más abajo).
- **Verificado con Playwright** (`expo start --web`, contra el backend
  real en Postgres): seleccionar un chip de activo y confirmarlo en el
  resultado (sin forzar sufijo cripto); el evento de selector de
  archivo del navegador se dispara de verdad al pulsar "Elegir de la
  galería" (confirma que el shim web de `expo-image-picker` usa un
  `<input type=file>` real, interceptable); previsualización se
  muestra; análisis completo con badges/confianza/soportes-resistencias/
  resumen/aviso de "modo de ejemplo"; historial se actualiza y la cuota
  decrementa (3→2→1→0); al agotar la cuota gratuita aparece el aviso y
  desaparece el botón de analizar, sin ocultar el último resultado.
  Cero errores de consola en todo el flujo. Regresión completa de la
  web repetida sin diferencias.

**Fase 4 — Trading + Picks + Wallet Tracker + Copy Trading reales —
COMPLETA y verificada.**
- **Paper Trading** (`(tabs)/trading.tsx`): balance real, chips de
  símbolo, sparkline propio (`src/components/Sparkline.tsx`, SVG puro
  con `react-native-svg`, histórico corto real de `GET /api/trading/
  chart/:symbol` — nunca inventado), ticket de orden (lado/tamaño/SL/
  TP opcionales) con `ConfirmModal` antes de enviar, lista de
  posiciones abiertas con P&L en vivo y cierre manual (también
  confirmado), historial de cerradas con el motivo (manual/SL/TP), y el
  mismo aviso de "precios simulados" que la web cuando CoinGecko no
  responde. Sondeo cada 15s como la web, para reflejar el auto-cierre
  por SL/TP sin que el usuario haga nada.
- **Handpicked Bets** (`(tabs)/picks.tsx`): lista real de `GET /api/
  picks`, mismas badges/confianza/disclaimer que la web.
- **Wallet Tracker** (`app/wallet.tsx`) y **Copy Trading**
  (`app/copy.tsx`): pantallas nuevas fuera del grupo `(tabs)` — se
  llega desde las tarjetas de Inicio, replicando la misma decisión de
  navegación ya tomada en la web (no saturar la barra inferior con 7
  accesos). Wallet: seguir por dirección, snapshot con holdings/
  actividad simulados, badge "Modo simulado", dejar de seguir con
  confirmación. Copy: banner "Simulado — sin fondos reales", lista de
  traders con stats, seguir/dejar de seguir, y el plan gratuito
  bloquea seguir con el mismo mensaje que la web (sin fingir un cobro,
  remite a la web para mejorar el plan).
- Nuevos componentes reutilizables: `ConfirmModal` (mismo criterio de
  "nunca se envía nada sin confirmar" que ya usa la web),
  `BackHeader` (con `accessibilityLabel` para las dos pantallas fuera
  de las tabs), `Sparkline`, y `src/utils/format.ts` (fmtUsd/fmtPct
  compartidos, sustituye copias sueltas en Perfil).
- **Verificado con Playwright** (`expo start --web`, contra el backend
  real en Postgres, con una wallet siguiendo el proceso completo de
  abrir→confirmar→abrir posición→confirmar→cerrar, en vez de solo
  comprobar que la pantalla carga): balance visible, aviso de precios
  simulados visible (CoinGecko bloqueado en este sandbox), posición
  abierta y cerrada correctamente con el historial reflejando el cierre
  manual; picks reales visibles; wallet seguida con su badge simulado y
  navegación de vuelta con el botón de atrás; Copy Trading con el
  banner simulado, lista de traders, y el bloqueo del plan gratuito al
  intentar seguir a uno (402 correctamente manejado, mensaje de mejora
  de plan mostrado). Cero errores de consola. Regresión completa de la
  web repetida sin diferencias.
- **Pendiente para fases siguientes**: notificaciones push,
  almacenamiento de preferencias, arquitectura de suscripciones
  (StoreKit/Play Billing) y build de producción con EAS — Fase 5.

**Fase 5 — Notificaciones push + preferencias + suscripciones
(documentadas) + build de producción — COMPLETA y verificada.**
- **Notificaciones push reales**: nueva tabla `push_tokens`
  (`server/migrations/002_push_tokens.sql`), funciones en `store.js`
  (`registerPushToken` con `ON CONFLICT (token)` para re-asociar un
  dispositivo reinstalado, `listPushTokensForUser`, `removePushToken`,
  `deletePushToken`), `server/services/pushNotifications.js`
  (`sendPushToUser`, POST a la API de Expo Push, nunca lanza — un fallo
  de envío no puede romper el flujo que lo dispara), y
  `server/routes/notifications.js` (`POST/DELETE /register-token`,
  `POST /test`). Disparo real: el auto-cierre por stop-loss/take-profit
  en `checkAndAutoClose()` (`server/routes/trading.js`, el mismo trigger
  real ya existente desde la Fase 4, nunca uno inventado) llama a
  `sendPushToUser` con el resultado (símbolo, motivo, P&L). Cliente:
  `mobile/src/services/notifications.ts` pide permiso, obtiene el token
  de Expo (requiere `projectId` de EAS) y lo registra; nunca finge éxito
  — cada motivo de fallo (sin dispositivo físico, permiso denegado, sin
  `projectId` de EAS, error de red) se traduce a un mensaje honesto en
  la nueva sección "Notificaciones" de Perfil (`(tabs)/profile.tsx`,
  interruptor + botón "Enviarme una notificación de prueba").
- **Preferencias persistentes no sensibles**:
  `mobile/src/services/preferences.ts` sobre
  `@react-native-async-storage/async-storage` (nunca tokens/
  credenciales, eso sigue exclusivamente en SecureStore vía
  `authStorage.ts`) — último símbolo usado en Trading (se recuerda al
  volver a la pestaña) y si las notificaciones están activadas (para
  volver a pedir el token, de forma idempotente, si se reabre la app).
- **Suscripciones**: solo arquitectura documentada
  (`mobile/SUBSCRIPTIONS.md`), sin código de pagos, por instrucción
  explícita del usuario ("NO implementes pagos ficticios"). Documenta
  por qué no se puede implementar ya (faltan las cuentas de Apple
  Developer/Google Play Console y sus credenciales de verificación de
  recibos, que solo el propio usuario puede crear), la librería prevista
  (`react-native-iap`, StoreKit 2/Play Billing) y el flujo completo
  (compra nativa → recibo verificado en el backend → mismo
  `store.setUserPlan` que ya usa el webhook de Stripe en la web, sin
  duplicar la lógica de qué significa cada plan).
- **Build de producción**: `mobile/eas.json` con perfiles `development`/
  `preview`/`production`; pasos manuales documentados en
  `mobile/README.md` (`eas login`/`eas init`/`eas build`/`eas submit`,
  con la nota de que `eas init` es quien añade el `projectId` que
  necesitan las notificaciones push).
- **Verificado con Playwright** (`expo start --web`, contra el backend
  real en Postgres): sección de notificaciones visible en Perfil con el
  interruptor y el botón de prueba (deshabilitado hasta activarlas); al
  intentar activarlas en este entorno (sin permiso real de notificaciones
  del navegador headless) se muestra el mensaje honesto correspondiente
  en vez de fingir que quedaron activadas — confirma que la lógica
  defensiva funciona en la práctica, no solo en el código. Regresión
  completa de la Fase 4 (trading abrir/cerrar, picks, wallet seguir/
  dejar de seguir, copy trading con bloqueo de plan gratuito) repetida
  sin diferencias. Backend probado también directamente con `curl` end
  to end: signup móvil → registrar token → `POST /test` (falla con un
  502 y mensaje claro porque este sandbox bloquea la salida a
  `exp.host`, el comportamiento esperado y correcto) → dar de baja el
  token.
- **Limitación honestamente documentada** (en `mobile/README.md` y
  `mobile/SUBSCRIPTIONS.md`): la entrega real de una notificación a un
  dispositivo físico no se ha podido probar en este entorno de
  desarrollo (proxy de salida bloquea `exp.host`, y además Expo Go no
  soporta push remoto en este SDK — hace falta una development build).
  Tampoco se ha podido ejecutar ningún `eas build` real (requiere la
  cuenta de Expo del propio usuario). El código en sí — registro,
  guardado, envío, manejo de errores — está verificado hasta esa
  frontera.

**Fase 6 — Editar perfil real (nombre/bio/foto) — COMPLETA y
verificada.** Al terminar la Fase 5, el usuario pidió elegir el alcance
de la siguiente fase; entre editar perfil, recuperar contraseña, o una
auditoría de accesibilidad/rendimiento, eligió editar perfil.
- **Backend**: sin cambios — `PATCH /api/auth/me` (`server/routes/
  auth.js`) ya aceptaba `name`/`bio`/`avatar` (validación de longitud y
  de que `avatar` sea una data URL `image/*` de como mucho 400.000
  caracteres) y ya lo usaba el modal de ajustes de la web; `requireAuth`
  ya acepta tanto la cookie de sesión como el Bearer token móvil, así
  que no hacía falta ninguna ruta nueva.
- **Mobile**: `AuthContext` gana `updateProfile(patch)` (llama al PATCH
  y actualiza el `user` en memoria). `(tabs)/profile.tsx` gana un modo
  de edición (botón "Editar perfil"): nombre y bio (160 caracteres, con
  contador) en `TextInput`, y foto de perfil vía `expo-image-picker`
  (cámara o galería, recorte cuadrado) redimensionada a 400px de ancho
  con `expo-image-manipulator` (paquete nuevo) antes de codificarla en
  base64 — deja margen de sobra bajo el límite de 400KB del backend sin
  necesidad de subir la foto original de varios MB de una cámara de
  móvil. "Quitar foto" envía `avatar: null` explícito. "Cancelar"
  descarta el borrador sin llamar al backend; solo los campos
  realmente cambiados se envían en el `PATCH`.
- **Bug encontrado y corregido durante la verificación**: la tarjeta de
  perfil en modo lectura nunca mostraba la bio (el campo se guardaba
  bien en Postgres — confirmado con `psql` directo — pero no había
  ningún `<Text>` para pintarla), así que el primer pase de Playwright
  reportaba "no persiste" cuando en realidad era un hueco de
  renderizado, no de guardado. Corregido añadiendo la línea de bio a la
  tarjeta de perfil.
- **Verificado con Playwright** (`expo start --web`, backend real en
  Postgres): editar nombre+bio+guardar refleja el cambio al instante;
  recargar la página conserva nombre y bio (confirma que persiste en el
  servidor, no solo en el estado de React); "Cancelar" tras cambiar el
  nombre descarta el cambio sin guardar nada. Probado también
  directamente con `curl` contra `PATCH /api/auth/me`: nombre+bio,
  avatar con una data URL de prueba, y `avatar: null` para quitarla —
  los tres casos devuelven y persisten el valor esperado. Regresión
  completa de las Fases 4 y 5 (trading, picks, wallet, copy trading,
  sección de notificaciones) repetida sin diferencias. Cero errores de
  consola.
- **Pendiente, ya documentado y fuera del alcance de esta fase**:
  "Olvidé mi contraseña" (necesita un servicio de email) y las compras
  dentro de la app (necesitan cuentas de Apple/Google) — ver
  `mobile/README.md` y `mobile/SUBSCRIPTIONS.md`.

Con esto, el roadmap acordado con el usuario para la app móvil nativa
(Fases 0-6) queda completo dentro de lo construible en este entorno de
desarrollo; lo que falta (recuperar contraseña, compras reales, build
firmado, entrega real de push) depende de acciones del propio usuario
fuera de aquí (un proveedor de email, cuentas de Apple/Google, `eas
login`), documentadas paso a paso en `mobile/README.md` y
`mobile/SUBSCRIPTIONS.md`.

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

## Fase 2 — Suscripción de pago (Cryptolyzer Pro) COMPLETA y verificada

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

Marca elegida para no clonar la identidad de Polifly: **"Cryptolyzer"** (logo
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
