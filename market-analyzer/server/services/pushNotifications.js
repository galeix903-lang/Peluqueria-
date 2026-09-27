const store = require('../store');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Best-effort: un fallo al enviar una notificación push nunca debe
// romper el flujo real que la dispara (p.ej. el auto-cierre de una
// posición por stop-loss/take-profit tiene que completarse igual).
async function sendPushToUser(userId, { title, body, data } = {}) {
  try {
    const tokens = await store.listPushTokensForUser(userId);
    if (!tokens.length) return { sent: 0 };

    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data: data || {},
      sound: 'default',
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error('[push] Expo push API respondió', res.status);
      return { sent: 0, error: `expo_status_${res.status}` };
    }

    const json = await res.json();
    const tickets = Array.isArray(json?.data) ? json.data : [];
    // Un ticket "DeviceNotRegistered" significa que el token ya no es
    // válido en ningún dispositivo (desinstalado, etc.) — se limpia para
    // no seguir intentando enviarle nada.
    await Promise.all(tickets.map(async (ticket, i) => {
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        await store.deletePushToken(tokens[i].token);
      }
    }));

    return { sent: tickets.filter((t) => t?.status === 'ok').length };
  } catch (err) {
    console.error('[push] Error enviando notificación:', err.message);
    return { sent: 0, error: 'network' };
  }
}

module.exports = { sendPushToUser };
