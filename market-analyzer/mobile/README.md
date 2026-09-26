# Vantex.AI — app móvil (Expo + EAS)

App nativa real para iOS/Android (no web empaquetada en un WebView),
construida con Expo Router sobre la misma identidad de marca que
`market-analyzer/public/` (la web de Vantex).

## Estado actual: Fase 0 — scaffold

Lo que hay hoy: proyecto Expo (SDK 57, TypeScript) con navegación real
por pestañas inferiores (Expo Router, file-based), branding aplicado
(icono, splash, colores, tipografía Inter portada de `shared/style.css`)
y 5 pantallas vacías pero honestas: cada una dice explícitamente qué
falta conectar y en qué fase, en vez de simular datos o funciones que
todavía no existen.

**Lo que NO hay todavía** (fases siguientes, ver `market-analyzer/PLAN.md`
para el roadmap completo acordado con el usuario):
- Sin autenticación real todavía (Fase 2 — necesita el backend por token
  del punto de la Fase 1, distinto de las cookies de sesión que usa hoy
  la web).
- Sin conexión a ningún dato real (analyzer, trading, picks, wallet,
  copy) — cada pantalla lo dice explícitamente.
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
    _layout.tsx           Layout raíz (fuentes, splash, safe areas)
    (tabs)/
      _layout.tsx         Bottom tabs: Inicio/Analyzer/Trading/Picks/Perfil
      index.tsx           Inicio
      analyzer.tsx
      trading.tsx
      picks.tsx
      profile.tsx
  src/
    theme/                Paleta y radios — copia 1:1 de public/shared/style.css
    components/           Screen, PendingCard, VantexMark (reutilizables)
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

## Siguiente paso (Fase 1, no empezado)

Backend con base de datos real (Postgres) + autenticación por token
(JWT), sin tocar la web (que sigue funcionando con su sesión de cookie
actual) — es el bloqueante real para que esta app deje de ser un
scaffold y empiece a mostrar datos de verdad.
