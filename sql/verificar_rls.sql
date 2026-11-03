-- =============================================================================
-- verificar_rls.sql — Comprueba lo que ve y lo que puede modificar cada usuario
-- después de aplicar rls_por_rol.sql.
--
-- Simula a cada usuario activo (rol `authenticated` + su auth.uid()) y cuenta las
-- filas visibles por tabla e intenta escrituras. Todo corre dentro de una
-- transacción que se deshace al final (ROLLBACK): no deja cambios.
-- Ejecutar completo en el SQL Editor de Supabase.
-- =============================================================================
begin;

create temp table resultado (usuario text, rol text, prueba text, valor text);
grant insert on resultado to authenticated;

do $$
declare
  u record;
  n bigint;
  t text;
  orden_ajena uuid;
  taller_ajeno uuid;
begin
  for u in
    select us.auth_user_id, us.nombre, r.nombre as rol
    from public.usuarios us join public.roles r on r.id = us.rol_id
    where us.estado = 'activo'
    order by r.nombre
  loop
    -- Suplanta al usuario (solo dura hasta el siguiente cambio de rol).
    perform set_config('request.jwt.claims',
      json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- Filas visibles por tabla.
    foreach t in array array['ordenes','orden_detalles','produccion_taller','pagos','clientes',
                             'productos','variantes_producto','materiales','proveedores','usuarios',
                             'historial_ordenes','roles'] loop
      execute format('select count(*) from public.%I', t) into n;
      insert into resultado values (u.nombre, u.rol, 've ' || t, n::text);
    end loop;

    -- ¿Puede cambiarse a sí mismo el rol a admin_primario? (debe ser 0)
    update public.usuarios set rol_id = (select id from public.roles where nombre = 'admin_primario')
    where auth_user_id = auth.uid() and u.rol <> 'admin_primario';
    get diagnostics n = row_count;
    insert into resultado values (u.nombre, u.rol, 'se auto-asciende a admin', n::text);

    -- ¿Puede editar alguna orden? (notas → mismo valor, no cambia nada real)
    update public.ordenes set notas = notas;
    get diagnostics n = row_count;
    insert into resultado values (u.nombre, u.rol, 'órdenes que puede editar', n::text);

    -- ¿Puede actualizar el avance de algún taller?
    update public.produccion_taller set estado = estado;
    get diagnostics n = row_count;
    insert into resultado values (u.nombre, u.rol, 'avances de taller que puede editar', n::text);

    -- ¿Puede modificar el inventario?
    update public.materiales set stock_actual = stock_actual;
    get diagnostics n = row_count;
    insert into resultado values (u.nombre, u.rol, 'materiales que puede editar', n::text);

    reset role;
  end loop;
end $$;

-- Una fila por usuario y una columna por prueba.
select usuario, rol,
  max(valor) filter (where prueba = 've ordenes')                         as ordenes,
  max(valor) filter (where prueba = 've orden_detalles')                  as detalles,
  max(valor) filter (where prueba = 've pagos')                           as pagos,
  max(valor) filter (where prueba = 've clientes')                        as clientes,
  max(valor) filter (where prueba = 've productos')                       as productos,
  max(valor) filter (where prueba = 've materiales')                      as materiales,
  max(valor) filter (where prueba = 've proveedores')                     as proveedores,
  max(valor) filter (where prueba = 've usuarios')                        as usuarios,
  max(valor) filter (where prueba = 'órdenes que puede editar')           as edita_ordenes,
  max(valor) filter (where prueba = 'avances de taller que puede editar') as edita_avance,
  max(valor) filter (where prueba = 'materiales que puede editar')        as edita_materiales,
  max(valor) filter (where prueba = 'se auto-asciende a admin')           as auto_admin
from resultado group by usuario, rol order by rol, usuario;

rollback;
