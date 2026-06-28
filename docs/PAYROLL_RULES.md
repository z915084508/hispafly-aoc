# Reglas de nómina virtual — Versión 1

HISPAFLY AOC genera nómina únicamente para PIREPs con estado `accepted` procedente de vAMSYS. La restricción única `PayrollRecord.pirepId` garantiza un solo registro por PIREP. Volver a ejecutar la generación crea los registros que falten y recalcula únicamente los que sigan `pending`; nunca modifica automáticamente registros aprobados, rechazados o pagados.

## Fórmula

`importe final = max(0, pago base + bonificaciones - penalizaciones)`

`pago base = flightTimeMinutes / 60 × tarifa horaria de la aeronave`

Todos los importes persistidos se guardan como céntimos enteros. El resultado detallado, su explicación y la versión de la regla se guardan con el registro para facilitar auditorías.

## Tarifas por aeronave

| Aeronave | Créditos/hora |
| --- | ---: |
| A320 | 80 |
| A321 | 85 |
| B772 | 120 |
| A359 | 130 |
| A388 | 150 |

## Bonificaciones

- Vuelo realizado en VATSIM o IVAO: 10 % del pago base.
- Toma entre -50 y -300 fpm, ambos incluidos: 100 créditos.
- Puntuación igual o superior a 95: 150 créditos.

## Penalizaciones

- Toma peor que -600 fpm: 200 créditos.
- Puntuación inferior a 70: 150 créditos.
- El importe final nunca puede ser negativo.

## Ejemplos verificables

### A320 normal en VATSIM

120 minutos, toma -180 fpm y puntuación 90: base 160 + red 16 + toma 100 = **276 créditos**.

### A388 de largo recorrido

600 minutos, fuera de red, toma -400 fpm y puntuación 96: base 1.500 + puntuación 150 = **1.650 créditos**.

### Toma dura

A320, 60 minutos, toma -601 fpm y puntuación 90: base 80 - penalización 200; el mínimo de cero produce **0 créditos**.

### Puntuación baja

A321, 120 minutos, toma -400 fpm y puntuación 69: base 170 - penalización 150 = **20 créditos**.

### PIREP rechazado

Un PIREP con estado `rejected` no es elegible y no genera ningún `PayrollRecord`.

Ejecutar los cinco casos: `pnpm test:payroll`.

## Flujo del personal

- `pending`: puede recalcularse con la regla activa, aprobarse o rechazarse.
- `approved`: revisado y listo para liquidación; no se recalcula automáticamente.
- `rejected`: excluido por el personal; no se recalcula automáticamente.
- `paid`: liquidado una sola vez mediante una transacción de cartera inmutable.

Recalcular, aprobar, rechazar y pagar producen entradas en `AocAuditLog`. El pago es transaccional y solo puede reclamar una nómina aprobada una vez.
