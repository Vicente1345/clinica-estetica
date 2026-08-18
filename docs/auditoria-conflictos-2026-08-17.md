# Auditoría de reservas existentes — conflictos de solapamiento

**Fecha de auditoría:** 17-08-2026
**Fuente:** tabla `arriendos` en Supabase (40 filas totales)
**Regla aplicada:** dos reservas entran en conflicto si comparten fecha y recurso físico y sus rangos horarios se intersectan (`hora_inicio < otra.hora_fin AND otra.hora_inicio < hora_fin`).

## Resumen

| Métrica | Valor |
|---|---|
| Arriendos totales | 40 |
| Arriendos Box 1 – Estético | 40 |
| Arriendos Box 2 – Dental | 0 |
| Arriendos Box 3 – Médico | 0 |
| Pares en conflicto (mismo box) | 49 |
| Pares en conflicto cruzados Dental↔Estético | **0** |

**Conclusión para la migración:** como el Box Dental no tiene ninguna reserva histórica, la unificación del calendario Dental+Estético **no genera ningún conflicto nuevo**. Todos los solapamientos detectados ya existían dentro del propio Box 1 – Estético (el sistema anterior permitía doble reserva del mismo box; la nueva validación lo impide hacia adelante).

Según lo instruido, **ninguna reserva histórica fue modificada ni eliminada**. Los conflictos quedan reportados aquí para revisión manual.

## Detalle por grupo de conflicto

### 15-03-2026 — duplicado exacto 09:00–14:00
| id (corto) | Horario | Estado | Profesional |
|---|---|---|---|
| bcb363a0 | 09:00–14:00 | pendiente | Francisca Salvo |
| 98bb71b4 | 09:00–14:00 | pendiente | Francisca Salvo |

### 16-03-2026 — 8 reservas idénticas 09:00–14:00 (¡3 confirmadas!)
| id (corto) | Horario | Estado | Profesional |
|---|---|---|---|
| f37e43d9 | 09:00–14:00 | pendiente | Francisca Salvo |
| fc4390b1 | 09:00–14:00 | **confirmado** | Valentina Ríos |
| 36f31c0e | 09:00–14:00 | pendiente | Francisca Salvo |
| 4157c56a | 09:00–14:00 | pendiente | Francisca Salvo |
| 9c942eac | 09:00–14:00 | **confirmado** | Francisca Salvo |
| 7822a26e | 09:00–14:00 | pendiente | Francisca Salvo |
| 70ca8fef | 09:00–14:00 | **confirmado** | Francisca Salvo |
| d9603a8a | 09:00–14:00 | pendiente | Francisca Salvo |

Nota: aquí hay dos profesionales distintas (Valentina Ríos y Francisca Salvo) con reservas confirmadas sobre el mismo bloque — es el único caso con potencial conflicto real entre personas distintas.

### 17-03-2026 — solapamientos parciales
| id (corto) | Horario | Estado | Profesional |
|---|---|---|---|
| 94d94328 | 08:00–11:00 | pendiente | Francisca Salvo |
| 38e3b10d | 08:00–10:00 | pendiente | Francisca Salvo |
| e97f3176 | 10:00–11:00 | pendiente | Francisca Salvo |

### 18-03-2026 — bloque largo que tapa reservas de 1 hora + duplicados
| id (corto) | Horario | Estado | Profesional |
|---|---|---|---|
| dcc8691d | 09:00–15:00 | pendiente | Francisca Salvo |
| 2f12321c | 09:00–10:00 | pendiente | Francisca Salvo |
| 8025c079 | 09:00–10:00 | pendiente | Francisca Salvo |
| d8ab5ca1 | 10:00–11:00 | pendiente | Francisca Salvo |
| e5605c02 | 12:00–14:00 | pendiente | Francisca Salvo |
| fd729a72 | 12:00–13:00 | pendiente | Francisca Salvo |
| 18b2d66d | 13:00–14:00 | pendiente | Francisca Salvo |
| b68fc425 | 13:00–14:00 | pendiente | Francisca Salvo |

### 14-05-2026 — 4 duplicados exactos 09:00–14:00 (pago rechazado)
| id (corto) | Horario | Estado | Profesional |
|---|---|---|---|
| c6e4f29b | 09:00–14:00 | pendiente (rechazado) | Katherine Büchner |
| ef487cd4 | 09:00–14:00 | pendiente (rechazado) | Katherine Büchner |
| 8011feee | 09:00–14:00 | pendiente (rechazado) | Katherine Büchner |
| 93a3d905 | 09:00–14:00 | pendiente (rechazado) | Katherine Büchner |

## Recomendación (no ejecutada)

La mayoría de estos registros parecen datos de prueba de marzo/mayo (misma profesional repitiendo el mismo bloque). Si se desea limpiar, conviene decidir manualmente cuál conservar por bloque; el caso a resolver con más cuidado es el del 16-03 donde Valentina Ríos y Francisca Salvo tienen ambas reservas **confirmadas** sobre el mismo horario.
