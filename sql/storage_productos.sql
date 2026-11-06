-- =============================================================================
-- storage_productos.sql — Imágenes de referencia de productos (bucket `productos`).
--
-- El bucket ya existe y es público (las imágenes se ven con su URL pública), pero no
-- tenía políticas: nadie podía subir archivos. Aquí:
--  - Se limita a imágenes PNG, JPG o WEBP de hasta 5 MB.
--  - Solo el administrador primario sube, reemplaza o borra imágenes (mismo criterio
--    que el alta/edición de productos en rls_por_rol.sql).
-- Ruta de cada archivo: <id del producto>/<marca de tiempo>.<extensión>
-- =============================================================================

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'productos';

create policy productos_img_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'productos'
              and (select private.current_user_role()) = 'admin_primario');

create policy productos_img_edicion on storage.objects for update to authenticated
  using (bucket_id = 'productos'
         and (select private.current_user_role()) = 'admin_primario')
  with check (bucket_id = 'productos'
              and (select private.current_user_role()) = 'admin_primario');

create policy productos_img_baja on storage.objects for delete to authenticated
  using (bucket_id = 'productos'
         and (select private.current_user_role()) = 'admin_primario');

-- Necesaria para que el cliente pueda reemplazar/borrar (Storage consulta el objeto
-- antes de modificarlo). Las imágenes ya son públicas, así que no expone nada nuevo.
create policy productos_img_lectura on storage.objects for select to authenticated
  using (bucket_id = 'productos'
         and (select private.current_user_role()) = 'admin_primario');
