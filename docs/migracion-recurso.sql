-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: recurso físico compartido Dental/Estético + Box Médico 2h
-- Ejecutar en Supabase → SQL Editor (requiere rol de administrador).
-- Es idempotente: se puede ejecutar más de una vez sin daño.
--
-- Qué hace:
--   1. boxes.recurso: 'dental_estetico' para Box 1 y 2, 'medico' para Box 3.
--   2. arriendos.recurso: se rellena desde boxes y se mantiene por trigger.
--   3. arriendos.legacy: marca las filas anteriores a la migración para que
--      los conflictos históricos NO bloqueen la creación del constraint.
--      (Las reservas históricas no se modifican en su contenido.)
--   4. Constraint de EXCLUSIÓN: dos reservas activas (pendiente/confirmado)
--      del mismo recurso físico no pueden solaparse en fecha+horario.
--      Esto es lo que impide la doble reserva incluso con dos inserts
--      simultáneos: la segunda transacción falla con error 23P01.
--   5. CHECK: reservas del recurso 'medico' duran mínimo 2 horas.
-- ════════════════════════════════════════════════════════════════════

-- 1. Extensión necesaria para EXCLUDE con igualdad escalar
create extension if not exists btree_gist;

-- 2. Recurso físico en boxes
alter table boxes add column if not exists recurso text;
update boxes
   set recurso = case when tipo = 'medico' then 'medico' else 'dental_estetico' end
 where recurso is distinct from
       case when tipo = 'medico' then 'medico' else 'dental_estetico' end;

-- 3. Recurso + marca legacy en arriendos
alter table arriendos add column if not exists recurso text;
alter table arriendos add column if not exists legacy boolean not null default false;

-- Filas existentes: heredan recurso desde su box y quedan marcadas legacy
-- (solo la primera vez; filas ya migradas no se vuelven a tocar)
update arriendos a
   set recurso = b.recurso,
       legacy  = true
  from boxes b
 where a.box_id = b.id
   and a.recurso is null;

-- Trigger: toda fila nueva o re-asignada de box recibe su recurso automáticamente
create or replace function set_arriendo_recurso()
returns trigger language plpgsql as $$
begin
  select recurso into new.recurso from boxes where id = new.box_id;
  if new.recurso is null then
    new.recurso := 'dental_estetico';
  end if;
  return new;
end $$;

drop trigger if exists trg_arriendo_recurso on arriendos;
create trigger trg_arriendo_recurso
before insert or update of box_id on arriendos
for each row execute function set_arriendo_recurso();

-- 4. Anti doble-reserva a nivel de base de datos (validación final del servidor)
--    Rango semiabierto [inicio, fin): reservas consecutivas (10-11 y 11-12) NO chocan.
--    Solo aplica a reservas activas y no-legacy.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'arriendos_no_solape_recurso'
  ) then
    alter table arriendos add constraint arriendos_no_solape_recurso
      exclude using gist (
        recurso with =,
        tsrange((fecha::date + hora_inicio::time), (fecha::date + hora_fin::time)) with &&
      )
      where (estado in ('pendiente', 'confirmado') and not legacy);
  end if;
end $$;

-- 5. Box Médico: mínimo 2 horas consecutivas (a nivel de BD)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'arriendos_medico_min_2h'
  ) then
    alter table arriendos add constraint arriendos_medico_min_2h
      check (
        recurso <> 'medico'
        or legacy
        or (hora_fin::time - hora_inicio::time) >= interval '2 hours'
      );
  end if;
end $$;

-- 6. Corrección de tarifa del Box Médico
--    La BD tenía tarifa_hora=10000, pero el catálogo comercial (landing,
--    selector de planes y bot) define $12.000/hora para el Box Médico.
--    Se alinea la BD con el catálogo:
update boxes set tarifa_hora = 12000
 where tipo = 'medico' and tarifa_hora = 10000;

-- ════════════════════════════════════════════════════════════════════
-- Verificación rápida (opcional, solo lectura):
--   select nombre, tipo, recurso, tarifa_hora from boxes order by nombre;
--   select count(*) filter (where legacy) as legacy,
--          count(*) filter (where recurso is null) as sin_recurso
--     from arriendos;
--
-- Prueba del constraint (opcional): dentro de un BEGIN…ROLLBACK, intenta
-- insertar dos arriendos activos del mismo recurso con horario solapado:
-- el segundo insert debe fallar con error 23P01 (exclusion_violation).
-- ════════════════════════════════════════════════════════════════════
