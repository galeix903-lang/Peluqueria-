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
