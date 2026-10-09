# Cryptolyzer.AI — app móvil (Expo + EAS)

App nativa real para iOS/Android (no web empaquetada en un WebView),
construida con Expo Router sobre la misma identidad de marca que
`market-analyzer/public/` (la web de Cryptolyzer).

## Estado actual: Fase 6 — editar perfil real

Login/signup/logout/sesión persistente (Fase 2), AI Analyzer (Fase 3),
Paper Trading/Picks/Wallet Tracker/Copy Trading (Fase 4) y notificaciones
push/preferencias (Fase 5) ya eran reales; ahora también lo es:
- **Editar perfil** (`(tabs)/profile.tsx`): nombre, bio (160 caracteres,
  con contador) y foto de perfil, contra el mismo
  `PATCH /api/auth/me` que ya usaba el modal de ajustes de la web — sin
  cambios en el backend, `requireAuth` ya aceptaba tanto la cookie de la
  web como el Bearer token de la app. La foto se recorta a cuadrado,
  se reduce a 400px de ancho con `expo-image-manipulator` y se envía
  como data URL en base64 (mismo formato y mismo límite de tamaño que ya
  validaba el backend); se puede tomar con la cámara o elegir de la
  galería, y quitar la foto actual. "Cancelar" descarta cualquier
  cambio sin guardarlo.

Lo de la Fase 5 sigue igual:
- **Notificaciones push reales** (`expo-notifications`): al activarlas
  en Perfil, el dispositivo se registra contra
  `POST /api/notifications/register-token` (backend real, tabla
  `push_tokens` en Postgres); el auto-cierre de una posición por
  stop-loss/take-profit (`checkAndAutoClose` en
  `server/routes/trading.js`, el mismo trigger real de la Fase 4, nunca
  uno inventado) dispara un envío a través de la API de Expo Push, y hay
  un botón "Enviarme una notificación de prueba" para autoverificarlo.
  Ver la limitación honesta más abajo: la entrega real a un dispositivo
  no se ha podido probar en este entorno de desarrollo.
- **Preferencias persistentes no sensibles** (`@react-native-async-storage/async-storage`,
  nunca tokens/credenciales — eso sigue en SecureStore): último símbolo
  usado en Trading, si las notificaciones están activadas.
- **`eas.json`** con perfiles `development`/`preview`/`production`, listo
  para `eas build` en cuanto el usuario tenga su propia cuenta de Expo.

**Lo que NO hay todavía**:
- "Olvidé mi contraseña" no está implementado: necesitaría un servicio
  de envío de email (Resend/SendGrid/...) que todavía no existe en el
  proyecto — no se ha simulado un botón que no hace nada.
- Compras dentro de la app (planes Pro/Business): la arquitectura está
  documentada al detalle en [`SUBSCRIPTIONS.md`](./SUBSCRIPTIONS.md),
  pero no hay código de pagos — implementarlo de verdad requiere que el
  usuario cree sus propias cuentas de Apple Developer/Google Play
  Console y dé de alta los productos ahí, algo que no se puede hacer
  desde este entorno. Mientras tanto, cuando hace falta un plan de pago
  la app lo dice claramente y remite a la web en vez de fingir un cobro.

## Cómo ejecutarlo

```bash
cd market-analyzer/mobile
npm install
npx expo start          # abre el menú (QR para Expo Go, o pulsa i/a/w)
npx expo start --web    # previsualización en navegador (útil para verificar
                         # el layout rápido sin simulador/dispositivo)
```

Requiere un dispositivo con la app **Expo Go** instalada, o un simulador
de iOS (solo en macOS) / emulador de Android, para probarlo como app
nativa de verdad. La vista `--web` sirve para iterar rápido pero no
sustituye probarlo en un dispositivo real antes de publicar.

### A qué backend apunta

`src/services/api.ts` lee `EXPO_PUBLIC_API_BASE_URL` (variable de
entorno pública de Expo, se inlinea en el bundle del cliente); si no
está puesta, usa por defecto `https://vantex.onrender.com` — el
backend real ya desplegado. Para probar contra un backend en tu propio
ordenador durante el desarrollo:

```bash
EXPO_PUBLIC_API_BASE_URL="http://localhost:3100" npx expo start
```

Ojo: un dispositivo físico con Expo Go **no puede** alcanzar
`localhost` de tu ordenador — para eso hace falta o bien
`--tunnel`/una IP de tu red local, o probarlo con `--web` (el navegador
sí puede llegar a `localhost`). Y si `vantex.onrender.com` todavía no
tiene esta rama desplegada con su Postgres provisionado, signup/login
fallarán ahí hasta que se despliegue — no es un fallo de la app.

## Identificadores (cambiables antes de la primera publicación)

- Nombre visible: **Cryptolyzer.AI**
- `slug` / scheme interno: `cryptolyzer` / `cryptolyzer://`
- iOS `bundleIdentifier`: `com.cryptolyzer.app`
- Android `package`: `com.cryptolyzer.app`

Estos son valores de partida razonables, no inventados al azar — pero
confírmalos (o cámbialos) antes de crear el registro de la app en App
Store Connect / Google Play Console, porque el bundle identifier de iOS
no se puede cambiar después de la primera subida.

## Estructura

```
mobile/
  app/                    Rutas (Expo Router: cada archivo es una pantalla)
    _layout.tsx           Layout raíz (fuentes, splash, safe areas, protección de rutas)
    (auth)/
      _layout.tsx
      login.tsx           Login + signup (única pantalla accesible sin sesión)
    (tabs)/
      _layout.tsx         Bottom tabs: Inicio/Analyzer/Trading/Picks/Perfil
      index.tsx           Inicio
      analyzer.tsx
      trading.tsx          Ticket de orden + posiciones + sparkline
      picks.tsx
      profile.tsx          Cuenta real, editar nombre/bio/foto, notificaciones, cerrar sesión
    wallet.tsx             Wallet Tracker (fuera de las tabs, se llega desde Inicio)
    copy.tsx                Copy Trading (fuera de las tabs, se llega desde Inicio)
  src/
    theme/                Paleta y radios — copia 1:1 de public/shared/style.css
    utils/format.ts         fmtUsd/fmtPct compartidos
    components/           Screen, PendingCard, CryptolyzerMark, ConfirmModal, Sparkline,
                          BackHeader (reutilizables)
    services/
      api.ts                fetch con Authorization: Bearer + refresco automático del access token
                            (incluye postForm para subir la imagen del gráfico como multipart)
      authStorage.ts         guarda los tokens en SecureStore (localStorage solo en el target web)
      notifications.ts       registro/token de expo-notifications + envío de prueba
      preferences.ts          AsyncStorage: último símbolo usado, notificaciones activadas (nunca tokens/credenciales)
    state/
      AuthContext.tsx        sesión (usuario, signup/login/logout) disponible en toda la app
  assets/                 icon.png, adaptive-icon-foreground.png, splash-icon.png
                          (generados a partir del icono real de la marca)
  eas.json                Perfiles de build (development/preview/production)
  SUBSCRIPTIONS.md        Arquitectura de compras dentro de la app (documentada, sin código de pagos)
```

## Limitaciones conocidas de este icono

El icono/splash se generó ampliando (LANCZOS) el recorte del icono que
ya usa la web (`public/assets/cryptolyzer-mark.png`), porque no existe una
fuente vectorial del glifo por separado del fondo. Se ve nítido en los
tamaños probados, pero si en algún momento hay una versión vectorial
(SVG/AI/Figma) del logo, conviene regenerar los assets desde ahí para
máxima nitidez a 1024px.

## Notificaciones push: limitación conocida de este entorno

El código de registro/envío de notificaciones está completo y
verificado hasta la frontera de red: `POST /api/notifications/register-token`
guarda el token en Postgres, y `POST /api/notifications/test`
efectivamente construye y envía la petición a la API de Expo
(`https://exp.host/--/api/v2/push/send`). Pero este sandbox de
desarrollo bloquea el acceso saliente a `exp.host` (proxy de salida por
allowlist), así que **la entrega real a un dispositivo no se ha podido
comprobar aquí** — solo que el backend construye y envía la petición
correctamente y maneja el error de red con un mensaje claro en vez de
fingir un envío exitoso. Además, obtener un token de push real requiere
un `projectId` de EAS (`eas init`, con la cuenta de Expo del propio
usuario — ver más abajo) y, en SDKs recientes, una development/production
build instalada en un dispositivo físico (Expo Go no soporta push
remoto). La pantalla de Perfil refleja honestamente cada uno de estos
motivos si el registro no puede completarse, en vez de mostrar
"activado" sin comprobarlo.

## Build de producción con EAS (pasos manuales del propio usuario)

Este entorno no tiene una cuenta de Expo ni puede ejecutar `eas build`
(requiere subir el proyecto a los servidores de EAS con credenciales
propias). Los pasos, para cuando el usuario quiera generar la primera
build real:

```bash
npm install -g eas-cli   # o usar npx eas-cli@latest en cada comando
cd market-analyzer/mobile
eas login                # con tu propia cuenta de Expo (gratis)
eas init                 # crea el proyecto en EAS y escribe extra.eas.projectId en app.json
eas build:configure       # confirma/ajusta los perfiles de eas.json ya presentes
eas build --profile preview --platform ios      # o android, o "all"
eas submit --platform ios                        # sube el build a App Store Connect / Play Console
```

Antes del primer `eas build --profile production` hay que confirmar (no
se puede cambiar después en iOS): el `bundleIdentifier`/`package`
(`com.cryptolyzer.app`, ver sección de identificadores más arriba), y tener
ya creadas las cuentas de Apple Developer Program y Google Play Console.
`eas init` añade automáticamente un `extra.eas.projectId` a `app.json`
— sin él, `expo-notifications` no puede obtener un token de push real
(ver sección anterior).

## Siguiente paso

Con la Fase 6 completa, todo lo que se puede construir dentro de este
entorno de desarrollo está hecho: auth, las 5 herramientas, notificaciones
push, preferencias, y ahora edición de perfil real. Lo único que queda
"Próximamente" en la app (recuperar contraseña, compras dentro de la app)
depende de acciones del propio usuario fuera de aquí: dar de alta un
servicio de email para recuperar contraseña, crear sus cuentas de
Apple/Google, ejecutar `eas init`/`eas build`/`eas submit`, y — si quiere
compras dentro de la app — dar de alta los productos de suscripción en
App Store Connect/Play Console (ver [`SUBSCRIPTIONS.md`](./SUBSCRIPTIONS.md)).
