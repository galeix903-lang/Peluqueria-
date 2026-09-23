// Limitador de peticiones simple, en memoria, por IP — suficiente para
// cortar fuerza bruta e inundaciones de signup sin añadir una dependencia
// nueva ni una base de datos aparte. No sobrevive a un reinicio del
// proceso, y no se comparte entre instancias si algún día hay más de una
// — para eso haría falta un store compartido (Redis), pero para el
// tamaño actual de Vantex esto ya corta el caso real.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> [timestamps]

  // Limpieza periódica para no acumular IPs viejas en memoria para siempre.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of hits) {
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length) hits.set(ip, recent);
      else hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(ip) || []).filter((t) => t > cutoff);
    if (timestamps.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message || 'Demasiados intentos. Espera un momento y vuelve a intentarlo.' });
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}

module.exports = rateLimit;
