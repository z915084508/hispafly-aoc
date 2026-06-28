# Reglas de n贸mina virtual 鈥?Versi贸n 1

HISPAFLY AOC genera n贸mina 煤nicamente para PIREPs con estado `accepted` procedente de vAMSYS. La restricci贸n 煤nica `PayrollRecord.pirepId` garantiza un solo registro por PIREP. Volver a ejecutar la generaci贸n crea los registros que falten y recalcula 煤nicamente los que sigan `pending`; nunca modifica autom谩ticamente registros aprobados, rechazados o pagados.

## F贸rmula

`importe final = max(0, pago base + bonificaciones - penalizaciones)`

`pago base = flightTimeMinutes / 60 脳 tarifa horaria de la aeronave`

Todos los importes persistidos se guardan como c茅ntimos enteros. El resultado detallado, su explicaci贸n y la versi贸n de la regla se guardan con el registro para facilitar auditor铆as.

## Tarifas por aeronave

| Aeronave | Cr茅ditos/hora |
| --- | ---: |
| A320 | 80 |
| A321 | 85 |
| B772 | 120 |
| A359 | 130 |
| A388 | 150 |

## Bonificaciones

- Vuelo realizado en VATSIM o IVAO: 10 % del pago base.
- Toma entre -50 y -300 fpm, ambos incluidos: 100 cr茅ditos.
- Puntuaci贸n igual o superior a 95: 150 cr茅ditos.

## Penalizaciones

- Toma peor que -600 fpm: 200 cr茅ditos.
- Puntuaci贸n inferior a 70: 150 cr茅ditos.
- El importe final nunca puede ser negativo.

## Ejemplos verificables

### A320 normal en VATSIM

120 minutos, toma -180 fpm y puntuaci贸n 90: base 160 + red 16 + toma 100 = **276 cr茅ditos**.

### A388 de largo recorrido

600 minutos, fuera de red, toma -400 fpm y puntuaci贸n 96: base 1.500 + puntuaci贸n 150 = **1.650 cr茅ditos**.

### Toma dura

A320, 60 minutos, toma -601 fpm y puntuaci贸n 90: base 80 - penalizaci贸n 200; el m铆nimo de cero produce **0 cr茅ditos**.

### Puntuaci贸n baja

A321, 120 minutos, toma -400 fpm y puntuaci贸n 69: base 170 - penalizaci贸n 150 = **20 cr茅ditos**.

### PIREP rechazado

Un PIREP con estado `rejected` no es elegible y no genera ning煤n `PayrollRecord`.

Ejecutar los cinco casos: `pnpm test:payroll`.

## Flujo del personal

- `pending`: puede recalcularse con la regla activa, aprobarse o rechazarse.
- `approved`: revisado y listo para liquidaci贸n; no se recalcula autom谩ticamente.
- `rejected`: excluido por el personal; no se recalcula autom谩ticamente.
- `paid`: liquidado una sola vez mediante una transacci贸n de cartera inmutable.

Recalcular, aprobar, rechazar y pagar producen entradas en `AocAuditLog`. El pago es transaccional y solo puede reclamar una n贸mina aprobada una vez.
