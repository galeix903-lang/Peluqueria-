const path = require('path');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const requireAuth = require('./middleware/requireAuth');
const rateLimit = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const analyzerRoutes = require('./routes/analyzer');
const tradingRoutes = require('./routes/trading');
const picksRoutes = require('./routes/picks');
const walletRoutes = require('./routes/wallet');
const copyRoutes = require('./routes/copy');
const activityRoutes = require('./routes/activity');
const billing = require('./routes/billing');
const { scheduleDailyPicks } = require('./services/picksJob');
const { scheduleCopyTradingJob } = require('./services/copyTradingJob');

// Red de seguridad de última instancia: con los handlers async envueltos
// en asyncHandler ya no debería llegar aquí ningún rechazo de promesa sin
// gestionar, pero si algún día se añade una ruta nueva sin envolver, esto
// evita que el proceso entero muera para todo el mundo por un solo
// request — se registra el error y se sigue funcionando.
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection (revisar: falta envolver alguna ruta en asyncHandler):', err);
});

const app = express();
const PORT = process.env.PORT || 3100;
app.disable('x-powered-by');
// Render (y cualquier PaaS con proxy delante) reenvía la petición real a
// través de un proxy interno — sin esto, req.ip sería siempre la IP del
// proxy (rompe el rate limiting por IP) y las cookies "secure" nunca se
// marcarían como enviadas por HTTPS de verdad.
app.set('trust proxy', 1);

// Cabeceras de seguridad básicas en todas las respuestas. No se añade una
// Content-Security-Policy estricta porque toda la app usa <script>/style
// inline sin build step — una CSP real requeriría mover ese código a
// ficheros aparte o usar nonces, un cambio mucho más grande que esto.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://vantex.onrender.com/sitemap.xml\n');
});

// El webhook de Stripe necesita el cuerpo crudo (sin parsear) para poder
// verificar la firma, así que se monta ANTES de express.json() y con su
// propio parser de solo esta ruta.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler);

app.use(express.json({ limit: '1mb' })); // deja sitio a la foto de perfil (se envía como data URL ya comprimida)
app.use(session({
  // Por defecto express-session guarda las sesiones en memoria, así que
  // cada vez que el proceso se reinicia (redeploy, o el propio Render
  // "durmiendo" el servicio gratuito por inactividad) se perdían todas
  // y todo el mundo tenía que volver a iniciar sesión. Guardarlas en
  // disco (mismo directorio data/ que ya usa store.js) hace que
  // sobrevivan a esos reinicios — solo se pierden si Render reconstruye
  // el contenedor entero desde cero en un despliegue nuevo.
  store: new FileStore({ path: path.join(__dirname, '..', 'data', 'sessions'), logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'dev-secret-cambia-esto',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    sameSite: 'lax',
    // secure exige HTTPS real; en local (sin NODE_ENV=production) se
    // deja sin marcar para poder seguir probando por http://localhost.
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Freno básico contra fuerza bruta / inundación de altas: 20 intentos
// cada 5 minutos por IP entre login y signup juntos. No sustituye una
// validación más fina por email, pero corta el caso más simple de
// ataque automatizado sin añadir dependencias nuevas.
app.use('/api/auth/login', rateLimit({ windowMs: 5 * 60 * 1000, max: 20, message: 'Demasiados intentos de acceso. Espera unos minutos.' }));
app.use('/api/auth/signup', rateLimit({ windowMs: 5 * 60 * 1000, max: 20, message: 'Demasiados intentos. Espera unos minutos.' }));

// API pública (sin sesión).
app.use('/api/auth', authRoutes);
app.use('/api/activity', activityRoutes);

// API protegida (requiere sesión).
app.use('/api/analyzer', requireAuth, analyzerRoutes);
app.use('/api/trading', requireAuth, tradingRoutes);
app.use('/api/picks', requireAuth, picksRoutes);
app.use('/api/wallet', requireAuth, walletRoutes);
app.use('/api/copy', requireAuth, copyRoutes);
app.use('/api/billing', requireAuth, billing.router);

// Rutas "bonitas" sin .html para cada pantalla — van antes de
// express.static para que no las intercepte con una redirección a la
// carpeta (ej. /dashboard -> /dashboard/) antes de llegar aquí.
const pages = ['login', 'dashboard', 'analyzer', 'trading', 'picks', 'wallet', 'copy'];
pages.forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', page, 'index.html'));
  });
});
app.get('/', (req, res) => res.redirect('/dashboard'));

// Frontend estático (CSS/JS compartidos, etc.).
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404 con la identidad de Vantex en vez del texto plano por defecto de
// Express — para APIs, JSON; para todo lo demás, una página mínima con
// el logomark, coherente con el resto de la app en vez del "Cannot GET".
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Página no encontrada — Vantex</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:20px; background:#0a0a12; color:#f7f7fa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; text-align:center; padding:24px; box-sizing:border-box; }
  .mark { width:56px; height:56px; border-radius:14px; background:linear-gradient(135deg,#6366f1,#3b82f6); display:flex; align-items:center; justify-content:center; }
  .mark svg { width:30px; height:30px; }
  h1 { font-size:2rem; margin:0; letter-spacing:-.02em; }
  p { color:#9494a8; margin:0; max-width:360px; line-height:1.5; }
  a { color:#818cf8; font-weight:700; text-decoration:none; }
  a:hover { text-decoration:underline; }
</style>
</head>
<body>
  <div class="mark"><svg viewBox="0 0 100 100" fill="#f7f7fa"><polygon points="10,24 24,10 38,10 47,80" /><polygon points="92,16 82,2 64,8 53,80" /><rect x="44.5" y="70" width="11" height="11" transform="rotate(45 50 75.5)" /></svg></div>
  <h1>Página no encontrada</h1>
  <p>La página que buscas no existe o se ha movido.</p>
  <a href="/dashboard">Volver a Vantex →</a>
</body>
</html>`);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`market-analyzer escuchando en http://localhost:${PORT}`);
  scheduleDailyPicks();
  scheduleCopyTradingJob();
});
