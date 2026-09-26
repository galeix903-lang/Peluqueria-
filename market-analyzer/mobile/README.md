# Vantex.AI — app móvil (Expo + EAS)

App nativa real para iOS/Android (no web empaquetada en un WebView),
construida con Expo Router sobre la misma identidad de marca que
`market-analyzer/public/` (la web de Vantex).

## Estado actual: Fase 2 — autenticación real

Login, signup, logout, sesión persistente y protección de rutas ya son
reales, contra el mismo backend Postgres que usa la web (ver
`market-analyzer/README.md`, sección "Autenticación de la app móvil").
`(auth)/login.tsx` es la única pantalla accesible sin sesión; en cuanto
hay un usuario, `(tabs)/` (Inicio/Analyzer/Trading/Picks/Perfil) queda
disponible y Perfil muestra la cuenta real (nombre, email, plan,
saldo) con un botón de cerrar sesión de verdad.

**Lo que NO hay todavía** (fases siguientes, ver `market-analyzer/PLAN.md`
para el roadmap completo acordado con el usuario):
- Analyzer/Trading/Picks/Wallet/Copy siguen siendo pantallas honestas
  de "esto se conecta en la Fase X", no datos simulados.
- "Olvidé mi contraseña" no está implementado: necesitaría un servicio
  de envío de email (Resend/SendGrid/...) que todavía no existe en el
  proyecto — no se ha simulado un botón que no hace nada.
- Sin build de EAS todavía (necesita una cuenta de Expo/EAS del usuario).

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

- Nombre visible: **Vantex.AI**
- `slug` / scheme interno: `vantex-ai` / `vantex://`
- iOS `bundleIdentifier`: `com.vantexai.app`
- Android `package`: `com.vantexai.app`

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
      trading.tsx
      picks.tsx
      profile.tsx          Cuenta real + cerrar sesión
  src/
    theme/                Paleta y radios — copia 1:1 de public/shared/style.css
    components/           Screen, PendingCard, VantexMark (reutilizables)
    services/
      api.ts                fetch con Authorization: Bearer + refresco automático del access token
      authStorage.ts         guarda los tokens en SecureStore (localStorage solo en el target web)
    state/
      AuthContext.tsx        sesión (usuario, signup/login/logout) disponible en toda la app
  assets/                 icon.png, adaptive-icon-foreground.png, splash-icon.png
                          (generados a partir del icono real de la marca)
```

## Limitaciones conocidas de este icono

El icono/splash se generó ampliando (LANCZOS) el recorte del icono que
ya usa la web (`public/assets/vantex-mark.png`), porque no existe una
fuente vectorial del glifo por separado del fondo. Se ve nítido en los
tamaños probados, pero si en algún momento hay una versión vectorial
(SVG/AI/Figma) del logo, conviene regenerar los assets desde ahí para
máxima nitidez a 1024px.

## Siguiente paso (Fase 3, no empezado)

Conectar el AI Analyzer: selector de cámara/galería (`expo-image-picker`),
subida de la imagen a `POST /api/analyzer` con el access token, y
mostrar el resultado real (mismo motor que la web).
