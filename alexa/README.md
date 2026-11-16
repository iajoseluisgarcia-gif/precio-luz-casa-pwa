# Precio Luz Casa — Alexa

Proyecto: PRECIO LUZ ELÉCTRICO CASA. Fecha: 16/11/2026. Coste autorizado: 0 €.

## Estado verificado
- Habilidad creada en Amazon: `amzn1.ask.skill.b69f1be3-0732-4e38-8ade-09ae9c822620`.
- Nombre: Precio Luz Casa. Idioma: es-ES. Invocación: `precio luz casa`.
- Alojamiento Alexa-hosted Node.js, EU (Ireland), sin vincular AWS de pago.
- Modelo de interacción guardado en la consola; compilación solicitada, resultado pendiente de comprobar.
- Código v1.1 preparado y probado localmente; **todavía no desplegado en Amazon**.
- Bloqueo: la pestaña Código queda en blanco; Chrome traduce la página (translated-ltr) y el editor registra NotFoundError/removeChild. Es necesario desactivar la traducción de esta página y recargar antes de continuar.

## Siguiente paso
1. Mostrar la página original de Amazon (sin traducción automática de Chrome).
2. Abrir Código, sustituir lambda/index.js y package.json por los archivos de este repositorio y desplegar.
3. Confirmar compilación del modelo y activar pruebas en Development.
4. Probar «abre precio luz casa» y «pregunta a precio luz casa por los precios de mañana» en el simulador.
5. Comprobar una vez en el Echo vinculado a la misma cuenta Amazon. No declarar completado antes de las pruebas.

## Funcionamiento
Consulta automáticamente PVPC peninsular de hoy o mañana. Sin PC encendido, sin tokens personales ni tareas diarias manuales. Fuentes públicas Preciluz y EnergiAlert. Valida fecha, zona/mercado, unidad, orden y número de intervalos, incluidos días de 23 y 25 horas. Si faltan datos verificados, lo comunica. No enciende electrodomésticos ni emite avisos espontáneos.

Si la hora más barata ya pasó, informa de ello y propone la más barata entre las horas completas restantes. Precios de energía sin impuestos, no factura total ni necesariamente la tarifa del usuario.

## Pruebas
`node tests/test_alexa.js`

Validadas fechas en Madrid, cambio de año, DST marzo/octubre, rechazo de horas duplicadas y valores nulos, fecha obsoleta, fuente de respaldo, consultas hoy/mañana y control de sesión. Las dos fuentes devolvieron datos coincidentes del 16/11/2026 mediante consulta HTTPS. La prueba Node desde el entorno de trabajo no pudo recuperar datos dentro del plazo; falta comprobar desde Amazon.

No ampliar permisos de GitHub, activar facturación ni publicar la habilidad para terceros como parte de este despliegue personal.
