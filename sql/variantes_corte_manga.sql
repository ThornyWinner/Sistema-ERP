-- =====================================================================================
-- variantes_corte_manga.sql — Corte y manga en las variantes; descripción en los productos.
--
--  - variantes_producto.corte:  Caballero, Dama, Unisex, Juvenil, Niño o Bebé (null = no aplica).
--  - variantes_producto.manga:  Corta, Larga, 3/4 o Sin mangas (null = no aplica).
--  - variantes_producto.modelo: clave del modelo en el catálogo del proveedor (C0300, HELI_DCP…).
--  - productos.composicion / incluye / notas: ficha técnica del catálogo.
-- Una variante es la combinación corte × manga × talla × color.
-- =====================================================================================
alter table public.productos
  add column if not exists composicion text,
  add column if not exists incluye text,
  add column if not exists notas text;

comment on column public.productos.composicion is 'Composición de la tela (gramaje, tejido, fibras).';
comment on column public.productos.incluye is 'Qué incluye el precio (p. ej. bordado tamaño bolsillo).';
comment on column public.productos.notas is 'Notas del catálogo: decorado sugerido, características, aclaraciones.';

alter table public.variantes_producto
  add column if not exists corte text,
  add column if not exists manga text,
  add column if not exists modelo text;

alter table public.variantes_producto drop constraint if exists chk_variante_corte;
alter table public.variantes_producto add constraint chk_variante_corte
  check (corte is null or corte in ('Caballero', 'Dama', 'Unisex', 'Juvenil', 'Niño', 'Bebé'));

alter table public.variantes_producto drop constraint if exists chk_variante_manga;
alter table public.variantes_producto add constraint chk_variante_manga
  check (manga is null or manga in ('Corta', 'Larga', '3/4', 'Sin mangas'));

comment on column public.variantes_producto.corte is 'Corte: Caballero, Dama, Unisex, Juvenil, Niño o Bebé (null = no aplica).';
comment on column public.variantes_producto.manga is 'Manga: Corta, Larga, 3/4 o Sin mangas (null = no aplica).';
comment on column public.variantes_producto.modelo is 'Clave del modelo en el catálogo del proveedor (C0300, HELI_DCP…).';
