/* Helper de fetch: siempre manda cookies de sesión y castellaniza errores. */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* respuesta sin cuerpo */ }
  if (!res.ok) {
    const error = new Error((data && data.error) || 'Ha ocurrido un error.');
    error.status = res.status;
    throw error;
  }
  return data;
}
