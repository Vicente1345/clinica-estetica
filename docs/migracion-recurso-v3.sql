-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v3: estructura definitiva de espacios
-- Ejecutar en Supabase → SQL Editor (requiere rol de administrador).
-- Es idempotente: se puede ejecutar más de una vez sin daño.
-- REQUIERE que la migración v2 (docs/migracion-recurso.sql) ya se haya
-- ejecutado (columnas recurso/legacy, función hora_a_minutos, constraint).
--
-- ⚠ ORDEN DE DESPLIEGUE (auditado): 1° desplegar el código v3 (push a main),
--   2° ejecutar ESTE SQL de inmediato. Mientras la BD siga en el mapeo v2 y
--   el código v3 ya esté servido, una reserva Dental sobre un horario tomado
--   en Estético (o viceversa) será rechazada por el candado viejo con un
--   mensaje de "carrera" (falso rechazo, sin riesgo de doble reserva), y la
--   doble reserva Médico×Estético solo está protegida por la validación de
--   la aplicación (el candado atómico llega con este SQL). Por eso la
--   ventana entre push y migración debe ser mínima.
--
-- Cambio de estructura respecto de v2:
--   ANTES: Dental+Estético compartían espacio · Médico independiente
--   AHORA: - Box Dental: INDEPENDIENTE (recurso 'dental')
--          - Box Mixto: Médico y Estético comparten espacio
--            (recurso 'medico_estetico')
--          - Pabellón: NUEVO espacio independiente (recurso 'pabellon'),
--            SOLO bloques de 1h $55.000 · 2h $100.000 · 4h $200.000 ·
--            8h $360.000 (CHECK en BD)
--
-- Qué hace:
--   1. Crea el box Pabellón si no existe.
--   2. Normaliza el box dental creado a mano ("Box dental " con tarifa 15):
--      tarifa 15 → 15.000 y nombre sin espacios colgantes.
--   3. Re-mapea boxes.recurso a la estructura nueva.
--   4. Agrega arriendos.modalidad (tipo comercial) mantenida por trigger.
--      El trigger v3 deriva recurso y modalidad DEL TIPO del box (no de la
--      columna recurso), por lo que un box creado desde el panel sin recurso
--      queda igualmente bien clasificado.
--   5. Antes de re-mapear los arriendos, marca como legacy cualquier par
--      de reservas ACTIVAS Médico×Estético que se solaparían bajo la nueva
--      agenda compartida (eran legales cuando eran espacios separados);
--      quedan intactas en contenido y exentas del candado, para revisión.
--   6. Re-backfill de recurso+modalidad en TODOS los arriendos.
--   7. Redefine el CHECK de mínimo 2 horas del médico sobre la modalidad.
--   8. NUEVO CHECK: el Pabellón solo admite bloques de 1, 2, 4 u 8 horas.
-- ════════════════════════════════════════════════════════════════════

-- 1. Box Pabellón
insert into boxes (nombre, tipo, tarifa_hora, activo, recurso)
select 'Pabellón', 'pabellon', 55000, true, 'pabellon'
where not exists (select 1 from boxes where tipo = 'pabellon');

-- 2. Normalización del box dental creado manualmente
update boxes set tarifa_hora = 15000 where tipo = 'dental' and tarifa_hora < 1000;
update boxes set nombre = btrim(nombre) where nombre <> btrim(nombre);

-- 3. Nuevo mapeo de recursos físicos
update boxes set recurso = case
  when tipo = 'dental'   then 'dental'
  when tipo = 'pabellon' then 'pabellon'
  else 'medico_estetico'
end;

-- 4. Modalidad comercial en arriendos + trigger v3 (deriva del TIPO del box,
--    robusto ante boxes creados desde el panel sin columna recurso)
alter table arriendos add column if not exists modalidad text;

create or replace function set_arriendo_recurso()
returns trigger language plpgsql as $$
declare
  vtipo text;
begin
  select tipo into vtipo from boxes where id = new.box_id;
  new.modalidad := coalesce(vtipo, 'estetico');
  new.recurso := case
    when vtipo = 'dental'   then 'dental'
    when vtipo = 'pabellon' then 'pabellon'
    else 'medico_estetico'
  end;
  return new;
end $$;
-- (el trigger trg_arriendo_recurso ya existe sobre esta función)

-- 5. Reservas activas Médico×Estético que chocarían bajo la agenda
--    compartida: se marcan legacy (exentas del candado, contenido intacto)
with mixto as (
  select a.id, a.fecha, a.hora_inicio, a.hora_fin
  from arriendos a
  join boxes b on b.id = a.box_id
  where b.tipo in ('medico', 'estetico')
    and a.estado in ('pendiente', 'confirmado')
    and not a.legacy
), pares as (
  select distinct m1.id
  from mixto m1
  join mixto m2 on m1.id <> m2.id and m1.fecha = m2.fecha
    and hora_a_minutos(m1.hora_inicio) < hora_a_minutos(m2.hora_fin)
    and hora_a_minutos(m2.hora_inicio) < hora_a_minutos(m1.hora_fin)
)
update arriendos set legacy = true where id in (select id from pares);

-- 6. Re-backfill de recurso y modalidad en TODOS los arriendos
update arriendos a
   set recurso   = case
         when b.tipo = 'dental'   then 'dental'
         when b.tipo = 'pabellon' then 'pabellon'
         else 'medico_estetico'
       end,
       modalidad = b.tipo
  from boxes b
 where a.box_id = b.id
   and (a.recurso is distinct from case
          when b.tipo = 'dental'   then 'dental'
          when b.tipo = 'pabellon' then 'pabellon'
          else 'medico_estetico'
        end
        or a.modalidad is distinct from b.tipo);

-- 7. CHECK de mínimo 2 horas del médico, ahora por modalidad
alter table arriendos drop constraint if exists arriendos_medico_min_2h;
alter table arriendos add constraint arriendos_medico_min_2h
  check (
    modalidad is null
    or modalidad <> 'medico'
    or legacy
    or (hora_a_minutos(hora_fin) - hora_a_minutos(hora_inicio)) >= 120
  );

-- 8. CHECK de bloques del Pabellón (1, 2, 4 u 8 horas exactas)
alter table arriendos drop constraint if exists arriendos_pabellon_bloques;
alter table arriendos add constraint arriendos_pabellon_bloques
  check (
    modalidad is null
    or modalidad <> 'pabellon'
    or legacy
    or (hora_a_minutos(hora_fin) - hora_a_minutos(hora_inicio)) in (60, 120, 240, 480)
  );

-- ════════════════════════════════════════════════════════════════════
-- Verificación (solo lectura):
--   select nombre, tipo, recurso, tarifa_hora, activo from boxes order by nombre;
--   select recurso, modalidad, count(*) from arriendos group by 1,2 order by 1,2;
--   -- Reservas marcadas legacy por el paso 5 (conflictos Médico×Estético):
--   select id, box_nombre, fecha, hora_inicio, hora_fin, estado
--     from arriendos where legacy and estado in ('pendiente','confirmado')
--     order by fecha, hora_inicio;
--
-- Prueba del candado (opcional): dentro de BEGIN…ROLLBACK, insertar un
-- arriendo médico y otro estético solapados el mismo día: el segundo debe
-- fallar con 23P01. Un dental o pabellón al mismo horario debe pasar, y un
-- pabellón de 3 horas debe fallar por arriendos_pabellon_bloques.
-- ════════════════════════════════════════════════════════════════════
