const path = require('path');
const express = require('express');
const session = require('express-session');

const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const analyzerRoutes = require('./routes/analyzer');
const tradingRoutes = require('./routes/trading');
const picksRoutes = require('./routes/picks');
const billing = require('./routes/billing');
const { scheduleDailyPicks } = require('./services/picksJob');

const app = express();
const PORT = process.env.PORT || 3100;

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://vantex.onrender.com/sitemap.xml\n');
});

// El webhook de Stripe necesita el cuerpo crudo (sin parsear) para poder
// verificar la firma, así que se monta ANTES de express.json() y con su
// propio parser de solo esta ruta.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler);

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-cambia-esto',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 días
}));

// API pública (sin sesión).
app.use('/api/auth', authRoutes);

// API protegida (requiere sesión).
app.use('/api/analyzer', requireAuth, analyzerRoutes);
app.use('/api/trading', requireAuth, tradingRoutes);
app.use('/api/picks', requireAuth, picksRoutes);
app.use('/api/billing', requireAuth, billing.router);

// Rutas "bonitas" sin .html para cada pantalla — van antes de
// express.static para que no las intercepte con una redirección a la
// carpeta (ej. /dashboard -> /dashboard/) antes de llegar aquí.
const pages = ['login', 'dashboard', 'analyzer', 'trading', 'picks'];
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
});
