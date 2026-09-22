const path = require('path');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const requireAuth = require('./middleware/requireAuth');
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

const app = express();
const PORT = process.env.PORT || 3100;

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
  cookie: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 días
}));

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`market-analyzer escuchando en http://localhost:${PORT}`);
  scheduleDailyPicks();
  scheduleCopyTradingJob();
});
