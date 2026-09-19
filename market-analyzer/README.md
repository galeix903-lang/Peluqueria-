# Vantex — dashboard de análisis de mercado con IA

Dashboard de trading/cripto inspirado en la idea de "sube una captura de un
gráfico y recibe un análisis": AI Analyzer (visión + IA), Paper Trading
(saldo virtual) y Handpicked Bets (picks diarios). Sin build step: Node +
Express en el servidor, HTML/CSS/JS plano en el cliente.

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run dev
```

Por defecto queda en `http://localhost:3100`. Crea una cuenta desde
`/login` (tab "Crear cuenta") y ya tienes acceso al dashboard.

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

**Aviso del plan gratuito**: no tiene disco persistente, así que las
cuentas y operaciones guardadas en `data/db.json` se reinician cada vez
que el servicio se redepliega o "despierta" tras estar dormido por
inactividad (los servicios gratuitos de Render se duermen a los 15 min sin
tráfico y tardan ~30-60s en volver a arrancar la primera vez que alguien
entra). Perfecto para probar y enseñar la app; si más adelante quieres que
los datos sobrevivan a los redeploys, hay que pasar a un disco de pago o a
una base de datos real (ver "Fase 2" en `PLAN.md`).

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
búsquedas de tu marca (`Vantex`) o con `site:vantex.onrender.com`.

## Estructura

```
server/
  index.js               bootstrap de Express, sesiones, sirve /public
  store.js                persistencia en data/db.json (usuarios, posiciones,
                           análisis, picks)
  middleware/requireAuth.js
  routes/
    auth.js               signup / login / logout / me
    analyzer.js            sube una imagen y devuelve el análisis
    trading.js              abrir/cerrar posiciones de paper trading
    picks.js                 lista de picks diarios
  services/
    claude.js               llamada a Claude con visión (tool use) + modo mock
    market.js                precios en vivo (CoinGecko) con caché de 30s
    picksJob.js              genera los picks diarios (cron a las 08:00)
public/
  shared/                   CSS común, helper de fetch, sidebar + guardia de sesión
  login/ dashboard/ analyzer/ trading/ picks/
```

## Notas importantes

- **No es asesoría financiera**: todas las respuestas del analizador y de
  los picks incluyen un disclaimer fijo. Es una herramienta educativa/de
  entretenimiento, no debe presentarse como garantía de resultados.
- **Persistencia simple**: los datos viven en `data/db.json` (un único
  fichero, se crea solo al arrancar). Es suficiente para una demo o un
  proyecto personal; si esto se convierte en un producto con usuarios
  concurrentes de verdad, migrar `server/store.js` a SQLite/Postgres sin
  tocar el resto del código (es la única capa que habla con el "disco").
- **Imágenes**: las capturas que se suben al analizador se procesan en
  memoria y se envían a la IA — no se guardan en disco.
- **Pendiente / fuera de alcance por ahora**: Wallet Tracker y Copy
  Trading necesitan un proveedor de datos on-chain y, en el caso de Copy
  Trading, mover fondos reales de usuarios (con la carga legal que eso
  implica) — quedan como tarjetas "Próximamente" en el dashboard hasta que
  se aborden como su propio proyecto.
