const jwt = require('jsonwebtoken');

/*
  Dos mecanismos de autenticación sobre la misma cuenta de usuario:
  - Web: cookie de sesión (express-session), como siempre.
  - App móvil: cabecera "Authorization: Bearer <access token>" (JWT,
    ver server/routes/auth.js — endpoints /api/auth/mobile/*).
  Cualquiera de los dos deja `req.userId` listo para el resto de la
  ruta; las rutas ya no leen `req.session.userId` directamente para no
  atarse a un único mecanismo.
*/
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No has iniciado sesión.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'dev-jwt-access-secret-cambia-esto');
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión no válida o caducada.' });
  }
};
