// Express 4 no captura promesas rechazadas dentro de un handler async: si
// algo lanza una excepción después de un await (o de forma síncrona pero
// dentro de una función async), la promesa queda rechazada sin más, y
// Node (desde la v15) mata el proceso entero por un unhandledRejection.
// Envolver cada handler con esto convierte ese fallo en un next(err)
// normal, que ya recoge el middleware de errores de index.js — así un
// dato inesperado tira una petición, nunca el servidor entero.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
