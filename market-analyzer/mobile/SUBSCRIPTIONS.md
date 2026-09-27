# Suscripciones dentro de la app (arquitectura, sin implementar todavía)

Este documento describe **cómo** se implementarán las compras de los
planes Pro/Business dentro de la app móvil cuando llegue el momento —
deliberadamente no hay código de pagos todavía. La instrucción original
del usuario fue explícita: **"NO implementes pagos ficticios"**. Un
checkout de Stripe embebido en un WebView (lo que usa la web) no es una
opción válida para una app nativa: tanto Apple como Google exigen que
las compras de contenido/funciones digitales dentro de una app usen su
propio sistema de compras in-app, no una pasarela externa. Saltarse
esto no es solo una cuestión de estilo — Apple rechaza la build en
revisión (App Store Review Guideline 3.1.1) y Google hace lo mismo
(Play Billing policy) si detectan un checkout de terceros para un
producto digital.

## Por qué no se ha implementado ya

Para implementar compras reales hace falta, como mínimo:
1. Una cuenta de Apple Developer Program (99$/año) y acceso a App Store
   Connect, donde se crean los "in-app purchases" (uno por plan/periodo:
   p.ej. `pro_monthly`, `pro_yearly`, `business_monthly`,
   `business_yearly`) con sus precios y textos localizados.
2. Una cuenta de Google Play Console (25$ único) con los mismos
   productos dados de alta como suscripciones.
3. Credenciales de servidor (una clave compartida de App Store Server
   API / Google Play Developer API) para que el backend pueda verificar
   los recibos de compra del lado del servidor — sin esto, cualquiera
   podría "desbloquear" un plan de pago falsificando la respuesta del
   cliente.

Ninguna de estas tres cosas existe todavía en este proyecto (son cuentas
y configuraciones que solo el propio usuario puede crear, con su propia
identidad de desarrollador/empresa), así que no hay nada real que
conectar. Escribir el código de compra ahora, sin productos dados de
alta ni forma de verificar un recibo, solo podría producir dos cosas: un
botón que no hace nada (justo lo que el usuario pidió evitar) o un botón
que "activa" el plan sin haber cobrado nada (un pago ficticio, prohibido
explícitamente).

## Diseño previsto (cuando existan las cuentas)

**Librería**: [`react-native-iap`](https://github.com/hyochan/react-native-iap)
es hoy el wrapper más usado y mantenido sobre StoreKit 2 (iOS) y Play
Billing Library (Android) para Expo/React Native — evita escribir código
nativo Swift/Kotlin a mano para algo tan sensible como pagos. Requiere
una development build (no funciona en Expo Go, igual que
`expo-notifications` — ver más abajo).

**Flujo de compra**:
1. La pantalla de Perfil (o una nueva pantalla "Planes") lista los
   productos vía `getSubscriptions()`, con precio ya localizado por
   Apple/Google según la región del usuario (nunca un precio fijo en
   USD escrito a mano).
2. Al pulsar "Suscribirme", `requestSubscription()` abre la hoja nativa
   de pago del sistema operativo (Face ID/huella + confirmación) — la
   app nunca ve el método de pago del usuario.
3. Tras la compra, el cliente recibe un recibo/token de transacción y lo
   envía a un endpoint nuevo del backend, p.ej. `POST /api/billing/verify-purchase`
   con `{ platform, productId, purchaseToken/receiptData }`.
4. El backend valida ese recibo contra la API de Apple o Google
   (nunca confía en el cliente) y, solo si es válido, llama a la misma
   función que ya existe, `store.setUserPlan(userId, plan)` — la que hoy
   dispara el webhook de Stripe en la web — así que la lógica de "qué
   significa tener el plan Pro" no se duplica, se reutiliza tal cual.
5. Renovaciones/cancelaciones llegan como notificaciones server-to-server
   (App Store Server Notifications v2 / Google Play RTDN) a un nuevo
   endpoint, que vuelve a llamar a `store.setUserPlan` para mantener el
   plan sincronizado sin que el usuario tenga que reabrir la app.

**Qué NO cambia**: `store.setUserPlan` y todo lo que ya depende del
campo `plan` del usuario (el bloqueo de Copy Trading en el plan
gratuito, los límites del AI Analyzer) siguen funcionando exactamente
igual — sea cual sea el origen del pago (Stripe en la web, StoreKit en
iOS, Play Billing en Android), todos convergen en la misma función.

**Qué haría falta antes de escribir código**: las tres cuentas/accesos
de la sección anterior, más decidir si los precios de iOS/Android van a
coincidir con los de Stripe en la web (recomendable, para no confundir
al usuario) — eso también requiere crear los productos manualmente en
App Store Connect/Play Console, un paso que no se puede automatizar
desde aquí.

## Notificaciones push (ya implementadas, nota relacionada)

Las notificaciones push (Fase 5) usan `expo-notifications`, que sí está
implementado, pero tiene la misma restricción de fondo: **Expo Go no
soporta push remoto** en versiones recientes del SDK, así que probarlo
de verdad (más allá del código que ya existe y compila) requiere una
development build (`eas build --profile development`) instalada en un
dispositivo físico. Este entorno de desarrollo no tiene forma de generar
ni instalar esa build ni de recibir un push real (el endpoint de Expo,
`https://exp.host`, está bloqueado por el proxy de salida de este
sandbox), así que el código de registro/envío está verificado hasta esa
frontera (registrar un token, guardarlo, intentar enviar, manejar el
error) pero la entrega real a un dispositivo no se ha podido probar
aquí.
