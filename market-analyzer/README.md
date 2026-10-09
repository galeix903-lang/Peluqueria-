# Cryptolyzer — dashboard de análisis de mercado con IA

Dashboard de trading/cripto inspirado en la idea de "sube una captura de un
gráfico y recibe un análisis": AI Analyzer (visión + IA), Paper Trading
(saldo virtual) y Handpicked Bets (picks diarios). Sin build step: Node +
Express en el servidor, HTML/CSS/JS plano en el cliente.

## Puesta en marcha

Necesitas un Postgres corriendo (local o gestionado — ver "Base de
datos" más abajo) antes de arrancar el servidor:

```bash
npm install
cp .env.example .env   # y pon tu DATABASE_URL real
npm run dev
```

Por defecto queda en `http://localhost:3100`. Crea una cuenta desde
`/login` (tab "Crear cuenta") y ya tienes acceso al dashboard. Las
tablas se crean solas en el primer arranque (migraciones idempotentes,
ver `server/migrations/`).

## Base de datos

Persistencia en Postgres (`server/db.js` + `server/store.js`) — ya no
un fichero JSON plano. Para desarrollo local, la forma más simple es
tener un Postgres instalado en tu máquina y crear una base vacía:

```bash
createuser cryptolyzer --pwprompt   # te pide la contraseña
createdb cryptolyzer --owner cryptolyzer
```

y poner esa cadena en `.env` como `DATABASE_URL=postgres://cryptolyzer:<tu
contraseña>@localhost:5432/cryptolyzer`. En Render, `render.yaml` ya
provisiona una base de datos gestionada y rellena `DATABASE_URL` solo
(ver "Ponerlo online" más abajo).

Si vienes de una versión anterior que todavía usaba `data/db.json`,
`npm run migrate:json` importa esos datos a Postgres conservando los
mismos IDs (seguro de ejecutar más de una vez).

## Pasar el AI Analyzer de modo ejemplo a modo real

Sin `ANTHROPIC_API_KEY`, el analizador y los picks diarios funcionan en
**modo mock**: devuelven ejemplos realistas al instante (marcados con la
etiqueta "Modo de ejemplo" en la interfaz) para poder probar todo el flujo
sin gastar nada. Para activar el análisis real con Claude:

1. Consigue una API key en <https://console.anthropic.com/settings/keys>.
2. Pégala en `.env` como `ANTHROPIC_API_KEY=sk-ant-...`.
3. Reinicia el servidor. `ANALYZER_MODE=auto` (el valor por defecto) pasa
   a modo real automáticamente en cuanto detecta la key.

`ANALYZER_MODE` también acepta `mock` (forzar siempre ejemplos, útil en
desarrollo para no gastar créditos) o `live` (forzar real; falla si no hay
key configurada).

## Cobrar con Stripe (Cryptolyzer Pro / Business)

Dos planes de pago, además del gratuito:

| Plan     | Precio    | Variable de entorno del precio | Límite de análisis/día | Copy Trading |
|----------|-----------|---------------------------------|-------------------------|--------------|
| Gratis   | 0€        | —                                | 3                       | No           |
| Pro      | 1€/mes    | `STRIPE_PRICE_ID_PLUS`          | 15                      | Sí           |
| Business | 4,99€/mes | `STRIPE_PRICE_ID`               | Ilimitado               | Sí           |

(Internamente el plan "Pro" se guarda como `plus` y "Business" como
`pro` en la base de datos — nombres heredados de una fase anterior del
proyecto; no hace falta tocarlos, `server/services/billing.js` ya hace
la traducción.)

Sin claves de Stripe configuradas, todo funciona en **modo mock**: al
pulsar "Hazte Pro"/"Hazte Business" el usuario cambia de plan al
instante, sin ningún pago real ni tarjeta de por medio — así se puede
probar todo el paywall (límite, bloqueo, aviso de upgrade, badge,
"portal" para volver a free) sin tener todavía cuenta de Stripe.

### Fase 1 — Modo Test (para probar el flujo completo sin cobrar de verdad)

1. Crea una cuenta en <https://dashboard.stripe.com/register> (es gratis
   abrirla; Stripe se queda una comisión solo sobre lo que cobres).
2. Con el interruptor **Test mode** activado (arriba a la derecha del
   panel de Stripe), ve a **Product catalog** → crea **dos** productos
   recurrentes: uno a 1€/mes (ej. "Cryptolyzer Pro") y otro a 4,99€/mes (ej.
   "Cryptolyzer Business"). Copia el `price_id` de cada uno (empiezan por
   `price_...`) — son dos IDs distintos, uno por plan.
3. En **Developers → API keys**, copia la **Secret key** de test
   (`sk_test_...`).
4. En **Developers → Webhooks**, añade un endpoint apuntando a
   `https://tu-dominio/api/billing/webhook`, con los eventos
   `checkout.session.completed`, `customer.subscription.updated` y
   `customer.subscription.deleted`. Copia el **Signing secret**
   (`whsec_...`) con el icono de copiar, **nunca tecleándolo a mano**: el
   `0` (cero) y la `O` (letra) son casi indistinguibles en la mayoría de
   fuentes, y una sola letra mal transcrita hace que Stripe reciba un
   400 ("firma inválida") en cada intento sin ningún otro síntoma — si
   alguna vez un webhook falla siempre con 400, esto es lo primero a
   revisar (Developers → Webhooks → el endpoint → pestaña *Event
   deliveries*).
5. Añade estas cuatro variables a tu `.env` (o a las variables de
   entorno de Render):
   - `STRIPE_SECRET_KEY` (la secret key de test del paso 3)
   - `STRIPE_PRICE_ID_PLUS` (price_id del plan Pro, 1€/mes)
   - `STRIPE_PRICE_ID` (price_id del plan Business, 4,99€/mes)
   - `STRIPE_WEBHOOK_SECRET` (el signing secret del paso 4)

   Con `BILLING_MODE=auto` (el valor por defecto), en cuanto detecta esas
   claves pasa a modo real solo — no hace falta cambiar nada en el código.
6. Prueba el flujo completo (los dos planes, el portal para cancelar, y
   que el webhook actualiza el plan correctamente) con la tarjeta de
   prueba de Stripe `4242 4242 4242 4242`, cualquier fecha futura y
   cualquier CVC.

### Fase 2 — Pasar a Live (cobrar dinero de verdad)

**Importante:** en Stripe, el modo Test y el modo Live son dos entornos
completamente separados — los productos, precios, claves API y webhooks
que creaste en Test **no existen** en Live, hay que volver a crearlos
ahí. No es solo "quitar el prefijo test" de las claves.

1. Antes de activar Live, Stripe puede pedirte completar la
   verificación de tu cuenta (datos fiscales/bancarios, en
   **Settings → Account details**) — sin eso no deja activar el modo Live.
2. Cambia el interruptor del panel de Stripe a **Live mode**.
3. Repite los pasos 2-4 de la Fase 1 pero en Live: crea los dos productos
   recurrentes de nuevo (los `price_id` de Live son distintos a los de
   Test), copia la Secret key **live** (`sk_live_...`, sin "test"), y
   crea el webhook de nuevo apuntando a tu dominio real en producción
   (copia también su propio Signing secret, también distinto al de Test).
4. Sustituye las cuatro variables de entorno del paso 5 de la Fase 1 por
   sus equivalentes **live** en Render (Settings → Environment, en el
   servicio de producción). No reutilices los valores de test.
5. Haz un redeploy para que el servidor arranque con las claves nuevas,
   y confirma con una tarjeta real (o pide a alguien de confianza que
   pruebe) que el pago se completa y el plan se actualiza — después,
   puedes reembolsarlo desde el panel de Stripe si era solo una prueba.

`BILLING_MODE` acepta también `mock` (forzar siempre el modo de ejemplo,
para desarrollar sin tocar Stripe) o `live` (forzar real; falla si faltan
las claves, útil para detectar en el arranque que algo quedó sin
configurar en vez de caer silenciosamente a mock en producción).

## Ponerlo online (Render, gratis)

1. Entra en <https://render.com> y crea una cuenta (puedes usar tu GitHub).
2. Dale acceso a Render a este repositorio de GitHub.
3. En el panel de Render: **New +** → **Blueprint** → elige este
   repositorio. Render detecta solo el fichero `market-analyzer/render.yaml`
   y te propone crear el servicio "vantex" con los datos ya rellenados.
4. Antes de confirmar, si quieres análisis real (no modo ejemplo), añade la
   variable de entorno `ANTHROPIC_API_KEY` con tu clave de
   <https://console.anthropic.com/settings/keys> — si la dejas vacía,
   arranca igual en modo mock.
5. Pulsa **Apply** / **Create**. La primera build tarda 2-3 minutos. Al
   terminar, Render te da una URL pública tipo
   `https://vantex-xxxx.onrender.com` — esa es la que abres en cualquier
   navegador, móvil incluido.

**Aviso del plan gratuito**: el servicio web gratuito de Render se
duerme a los 15 min sin tráfico y tarda ~30-60s en volver a arrancar la
primera vez que alguien entra (los datos en sí ya no se pierden: viven
en la base de datos gestionada, no en el disco del servicio). La base
de datos Postgres gratuita de Render caduca a los 30 días si no se pasa
a un plan de pago — merece la pena revisarlo en el dashboard antes de
esa fecha si esto va a usarse en serio.

## Aparecer en Google

Por defecto una web nueva no aparece en buscadores hasta que alguien la
"descubre" (por enlaces entrantes, o porque tú la das de alta). El
proyecto ya trae lo necesario del lado del código (`robots.txt` permisivo,
`sitemap.xml`, meta descripción en `/login`); lo que falta es darla de
alta en Google:

1. Entra en <https://search.google.com/search-console> con tu cuenta de
   Google.
2. Añade una propiedad de tipo **"Prefijo de URL"** con tu URL de Render
   (ej. `https://vantex.onrender.com`).
3. Verifica la propiedad con el método **"Archivo HTML"**: Google te da un
   fichero tipo `google1234567890abcdef.html` — pídeme que lo añada a
   `public/` (con exactamente ese nombre y contenido) y haz redeploy antes
   de pulsar "Verificar" en Search Console.
4. Una vez verificada, en el menú **Sitemaps** añade `sitemap.xml`.
5. En **Inspección de URLs**, pega la URL de `/login` y pulsa **"Solicitar
   indexación"** — esto acelera bastante el primer rastreo (normalmente
   días, no meses).

Aviso realista: que Google la indexe no significa que aparezca arriba en
búsquedas genéricas como "análisis de mercado" — para eso compites con
sitios ya establecidos. Sí aparecerá con bastante fiabilidad para
búsquedas de tu marca (`Cryptolyzer`) o con `site:vantex.onrender.com`.

## Estructura

```
server/
  index.js               bootstrap de Express, sesiones, migra la BD, sirve /public
  db.js                   pool de Postgres + runner de migraciones idempotentes
  store.js                capa de datos (Postgres) — usuarios, posiciones,
                           análisis, picks, wallets seguidas, copy follows,
                           refresh tokens de la app móvil
  migrations/*.sql         esquema (CREATE TABLE IF NOT EXISTS)
  scripts/migrate-json-to-pg.js   importa un data/db.json antiguo (ver "Base de datos")
  middleware/requireAuth.js  sesión de cookie (web) O Bearer JWT (móvil) → req.userId
  routes/
    auth.js               web: signup/login/logout/me (+PATCH nombre)
                           móvil: /mobile/signup /login /refresh /logout (JWT)
    analyzer.js            sube una imagen, aplica el límite gratuito y devuelve el análisis
    trading.js              abrir/cerrar posiciones, SL/TP, histórico de precio
    picks.js                 lista de picks diarios
    wallet.js                 Wallet Tracker (simulado)
    copy.js                    Copy Trading (simulado)
    billing.js                checkout / portal / webhook de Stripe (Cryptolyzer Pro)
  services/
    tokens.js               emite el access token (JWT) y el refresh token (opaco) de la app móvil
    claude.js               llamada a Claude con visión (tool use) + modo mock
    market.js                precios en vivo (CoinGecko) con caché de 30s + histórico corto
    picksJob.js              genera los picks diarios (cron a las 08:00)
    wallet.js                 snapshot determinista de una wallet (simulado)
    copyTraders.js             lista de traders modelo (simulado)
    copyTradingJob.js           simula su actividad dentro del Paper Trading real (cron cada 10 min)
    billing.js                Stripe Checkout/Portal/webhooks + modo mock
public/
  shared/                   CSS común, helpers (fetch/toast/modal/formato), sidebar + bottom
                            nav + guardia de sesión, intro 3D (Three.js perezoso)
  login/ dashboard/ analyzer/ trading/ picks/ wallet/ copy/
  vendor/                   Three.js (vendorizado, usado solo por la intro)
mobile/                     app nativa iOS/Android (Expo + Router) — ver mobile/README.md
```

## Autenticación de la app móvil

La web sigue usando cookie de sesión (`express-session`) sin ningún
cambio. La app móvil (`mobile/`) usa un access token JWT de corta vida
(2h) + un refresh token opaco de 30 días guardado hasheado en Postgres
(`refresh_tokens`), con rotación: cada uso de un refresh token lo
revoca y emite uno nuevo, así que un token viejo filtrado deja de
servir en cuanto se usa una vez. Mismo `requireAuth` para las dos
plataformas — solo cambia cómo prueban quién eres (`req.session.userId`
o `Authorization: Bearer <token>`), el resto de cada ruta es idéntico.

## Notas importantes

- **No es asesoría financiera**: todas las respuestas del analizador y de
  los picks incluyen un disclaimer fijo. Es una herramienta educativa/de
  entretenimiento, no debe presentarse como garantía de resultados.
- **Persistencia real**: los datos viven en Postgres (`server/db.js` +
  `server/store.js`), no en un fichero JSON. Aguanta usuarios
  concurrentes de verdad; `server/store.js` sigue siendo la única capa
  que habla con la base de datos, así que un cambio de proveedor
  (ej. pasar de Render Postgres a otro gestionado) no toca el resto del
  código.
- **Imágenes**: las capturas que se suben al analizador se procesan en
  memoria y se envían a la IA — no se guardan en disco.
- **Wallet Tracker y Copy Trading son simulados**: leer datos on-chain
  reales necesita un proveedor externo (Etherscan/Alchemy/Moralis) y Copy
  Trading, mover fondos reales de usuarios, con la carga legal que eso
  implica (custodia, licencias de money transmission). Ambos están
  completamente implementados y son funcionales, pero en modo simulado:
  `server/services/wallet.js` genera holdings/actividad deterministas a
  partir de la dirección (misma dirección, mismo resultado) y
  `server/services/copyTraders.js` + `copyTradingJob.js` simulan la
  actividad de unos traders modelo abriendo/cerrando posiciones dentro
  del motor real de Paper Trading. Ambas interfaces llevan un badge
  "Simulado" bien visible. El día que haya presupuesto para datos reales,
  solo hay que reescribir esos dos ficheros — las rutas y el frontend no
  cambian.
