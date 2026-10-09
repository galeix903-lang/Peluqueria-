const store = require('../store');

// Se monta siempre después de requireAuth (necesita req.userId ya
// puesto). Comprueba el flag en la base de datos en cada petición — nunca
// se confía en nada que venga del cliente (token, cookie, body) para
// decidir si alguien es admin.
module.exports = async function requireAdmin(req, res, next) {
  const user = await store.findUserById(req.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'No tienes permisos de administrador.' });
  }
  req.adminUser = user;
  next();
};
