-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v3.1: blindaje de integridad de arriendos
-- Ejecutar en Supabase → SQL Editor DESPUÉS de migracion-recurso-v3.sql.
-- Idempotente.
--
-- Hallazgo de la verificación en producción (08-10-2026): la BD aceptaba
-- arriendos sin box_id (o con un box inexistente) y el trigger los
-- clasificaba en silencio como Box Mixto / estético. La app nunca lo hace
-- (/api/reservar valida el box), pero la anon key permite inserts directos
-- mientras RLS siga abierta. Verificado antes de escribir esto: 0 filas
-- con box_id nulo, así que el NOT NULL no rompe datos existentes.
-- ════════════════════════════════════════════════════════════════════

-- 1. Toda reserva debe pertenecer a un box
alter table arriendos alter column box_id set not null;

-- 2. El trigger rechaza un box inexistente en vez de asignar un recurso
--    por defecto (que podía hacer chocar o liberar el espacio equivocado)
create or replace function set_arriendo_recurso()
returns trigger language plpgsql as $$
declare
  vtipo text;
begin
  select tipo into vtipo from boxes where id = new.box_id;
  if vtipo is null then
    raise exception 'El box % no existe: no se puede registrar el arriendo', new.box_id
      using errcode = '23503';
  end if;
  new.modalidad := vtipo;
  new.recurso := case
    when vtipo = 'dental'   then 'dental'
    when vtipo = 'pabellon' then 'pabellon'
    else 'medico_estetico'
  end;
  return new;
end $$;

-- Verificación (solo lectura):
--   select is_nullable from information_schema.columns
--    where table_name = 'arriendos' and column_name = 'box_id';   -- debe ser NO
