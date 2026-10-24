# Precio Luz Casa — Alexa (fase de prueba)

Estado: modelo de voz es-ES y función Node.js preparados. No se ha creado, instalado ni probado todavía una Skill en la cuenta Amazon.

## Configuración prevista
1. Entrar en Alexa Developer Console con la cuenta Amazon vinculada al dispositivo.
2. Crear Custom Skill «Precio Luz Casa», idioma es-ES, invocation «precio luz casa».
3. Importar `interactionModels/custom/es-ES.json` como modelo de interacción.
4. Configurar un endpoint AWS Lambda/Alexa-hosted compatible y usar el código de `lambda/index.js`.
5. Construir y probar «precio hoy» y «precio mañana» con datos verificados.
6. Si hay pantalla compatible, añadir APL después de validar la respuesta por voz.

**Coste**: no activar servicios de pago. Comprobar límites gratuitos vigentes antes de alojar el endpoint.
**Privacidad**: no guardar teléfonos ni tokens en el repositorio.
**Precios**: PVPC término energía sin impuestos; fechas de Europe/Madrid. Se bloquea la respuesta si las fuentes no permiten verificar el día solicitado.
