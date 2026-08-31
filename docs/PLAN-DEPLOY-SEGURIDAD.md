# Plan de despliegue — rama `seguridad-fase0`

**Qué es:** el paso 5 del plan de Fase 0 (spec v4 §1.3, S3-S5 y S8) implementado
en código. **Nada de esto está desplegado ni aplicado**: la rama no se mergea a
`main` y la migración SQL no se ejecuta hasta seguir este plan, en orden.

## Qué contiene la rama

| Pieza | Archivo | Qué hace |
|---|---|---|
| Librería de seguridad | `api/_lib/seguridad.js` | service_role en servidor, hash scrypt (crypto nativo, sin dependencias nuevas), tokens de sesión firmados HMAC con expiración (12 h), rate limiting, helper de horas en zona America/Santiago |
| Login en servidor | `api/login.js` | Reemplaza la consulta directa a `usuarios` desde el navegador. Respuesta idéntica para "no existe" y "no coincide" (anti-enumeración), rate limit por IP e IP+email, y **upgrade-on-login**: las contraseñas en texto plano se re-guardan hasheadas en el primer login exitoso de cada usuario — sin migración big-bang |
| Gestión de usuarios | `api/usuarios.js` | listar/crear/actualizar/activar solo con token de admin; contraseñas siempre hasheadas; nunca devuelve hashes |
| Cancelación de arriendos | `api/cancelar-arriendo.js` | Reemplaza el `update` directo desde el navegador (S8); exige admin y re-aplica la regla de 48 h en hora de Chile |
| Protección del bot web | `api/chat.js` | CORS restringido por `ALLOWED_ORIGINS`, rate limit 20 req/min por IP, tope de 2.000 caracteres por mensaje |
| Fix de zona horaria | `api/recordatorio.js` | `mañanaChile()` ahora usa America/Santiago real (antes fijaba UTC-3 y se desviaba en invierno) |
| Frontend | `src/Login.js`, `src/Landing.js`, `src/App.js`, `src/ModificarReserva.js` | Login vía `/api/login` (guarda el token en la sesión), usuarios vía `/api/usuarios`, cancelación vía `/api/cancelar-arriendo` |
| Migración SQL por etapas | `docs/migracion-seguridad.sql` | Etapa 0 (DDL nuevas, sin riesgo) · Etapa 1 (blindar `usuarios`) · Etapa 2 (diseño objetivo, aún no ejecutable) |
| Tests | `package.json` (`npm test`) | El test de paridad ESM↔CJS ahora corre: 57/57 en verde. Build CI limpio |

## Orden de despliegue (hacerlo juntos, ~30 min)

1. **Env vars en Vercel** (Settings → Environment Variables, scope Production):
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API Keys → `service_role`. **Nunca** con prefijo `REACT_APP_`.
   - `SESSION_SECRET` — generar: `openssl rand -base64 48` (o cualquier cadena aleatoria larga).
   - `ALLOWED_ORIGINS` — dominios del sitio separados por coma, p. ej. `https://clinica-estetica-xxx.vercel.app,https://www.dominio.cl`. Mientras no exista, el CORS del chat queda abierto como hoy (transición no rompiente).
2. **Merge y deploy**: `git checkout main && git merge seguridad-fase0 && git push`.
3. **Prueba de humo** (5 min): login con un usuario real → entra y el panel carga usuarios; crear un usuario de prueba y desactivarlo; cancelar (o intentar cancelar) un arriendo de prueba; el chatbot web responde.
4. **Ejecutar Etapa 0 del SQL** (DDL nuevas — sin riesgo) en Supabase → SQL Editor.
5. **Logins de todo el equipo**: pedir a cada usuaria que entre una vez → sus contraseñas quedan hasheadas solas (verificar: `select email, left(password_hash,7) from usuarios;` → todas deben empezar con `scrypt:`).
6. **Ejecutar Etapa 1 del SQL** (blindar `usuarios`) y correr su verificación.
7. Marcar S3 (parcial: usuarios), S4, S5 y S8 como cerrados en la spec.

## Qué queda pendiente después (Etapa 2)

- Mover a endpoints las escrituras que el navegador aún hace directo:
  `planes_profesional`, `pagos_plan`, `insumos`/`movimientos`, `boxes`/`profesionales`,
  `arriendos.comprobante_url` (Comprobante.js).
- Vista `citas_ocupacion` sin datos personales para el calendario público
  (hoy la anon key puede leer nombre/teléfono/RUT de `solicitudes_paciente`).
- Decisión de los 40 arriendos `legacy` (S2, par por par).
- Sesión: considerar expiración deslizante o refresh si 12 h resulta incómodo.

## Notas de diseño

- **Sin dependencias nuevas**: hash con `crypto.scryptSync` y tokens HMAC con
  `crypto` nativo. No cambió `package.json` salvo el script `test`.
- **Todo es transición no rompiente**: sin las env vars, `/api/login` responde
  503 con mensaje claro y el resto del sitio sigue igual que hoy; con ellas, el
  sistema completo queda activo. El orden del plan evita cualquier ventana rota.
- El rate limiting es por instancia serverless (best-effort). Suficiente para
  frenar ráfagas; si algún día se necesita límite global duro, se agrega una
  tabla de contadores.
