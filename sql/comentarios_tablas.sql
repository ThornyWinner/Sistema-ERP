-- =============================================================================
-- comentarios_tablas.sql — Descripción (COMMENT ON TABLE) de cada tabla de `public`.
--
-- Se ven en el Table Editor de Supabase, en psql (\dt+) y en cualquier
-- herramienta que lea el catálogo de Postgres. Es idempotente: volver a
-- ejecutarlo solo reemplaza el texto.
-- =============================================================================

-- ----- Usuarios y seguridad --------------------------------------------------
comment on table public.roles is
  'Catálogo de roles del sistema: admin primario, admin secundario, vendedor y uno por taller (diseñador, sublimador, cortador, costurera, bordador). Define qué módulos ve y edita cada usuario.';
comment on table public.usuarios is
  'Perfil de cada usuario del ERP, vinculado a su cuenta de Supabase Auth (auth_user_id). Guarda rol, estado (activo/inactivo) y último acceso.';
comment on table public.notificaciones is
  'Mensajes entre usuarios (campana del encabezado). Una fila por destinatario; envio_id agrupa las copias de un mismo envío y leida_at marca la lectura.';

-- ----- Clientes y ventas ------------------------------------------------------
comment on table public.clientes is
  'Clientes de la empresa: razón social, contacto, teléfono, correo, dirección y notas.';
comment on table public.ordenes is
  'Órdenes de venta/producción. Folio ORD-AAAA-NNNNNN generado por trigger, cliente, vendedor, fechas, importes (subtotal, descuento, total, anticipo) y estados de la orden y del pago.';
comment on table public.orden_detalles is
  'Partidas de cada orden: producto o variante, cantidad, precio unitario y tipo de producción.';
comment on table public.personalizaciones is
  'Personalización de una partida de orden: lugar del bordado, logo del cliente y notas.';
comment on table public.personalizacion_hilos is
  'Colores de hilo que usa cada personalización (una fila por color).';
comment on table public.pagos is
  'Pagos de una orden: anticipo inicial y abonos. Por trigger, la suma no puede superar el total y actualiza el estado de pago de la orden.';
comment on table public.historial_ordenes is
  'Bitácora de cambios de estado de cada orden: estado anterior, estado nuevo, usuario y comentario. La creación de la orden se registra con estado_anterior_id nulo.';
comment on table public.comentarios_orden is
  'Comentarios de los usuarios sobre una orden, con su visibilidad (p. ej. interno).';
comment on table public.archivos is
  'Archivos adjuntos a una orden (diseños, logos, referencias): nombre, URL, tipo MIME, tamaño y quién lo subió.';
comment on table public.consecutivos_documentos is
  'Último número usado por tipo de documento y año (p. ej. ORDEN 2026). Lo usa el trigger que genera los folios consecutivos.';

-- ----- Catálogos de órdenes y pagos -------------------------------------------
comment on table public.estados_orden is
  'Catálogo de estados de una orden según su avance: Pendiente, En Diseño, En Sublimación, En Corte, En Costura, En Bordado, Control de Calidad, Lista para Entrega, Entregada y Cancelada (orden_visualizacion define la secuencia).';
comment on table public.estados_pago is
  'Catálogo de estados de pago de una orden: Pendiente, Anticipo, Pagado, Vencido y Cancelado. Los tres primeros los asigna el trigger de pagos según lo cobrado.';
comment on table public.estados_produccion is
  'Catálogo de estados del trabajo de un taller sobre una partida: Pendiente, Asignado, En proceso, Pausado, Finalizado y Entregado.';
comment on table public.metodos_pago is
  'Catálogo de métodos de pago: efectivo, transferencia, tarjeta de débito o crédito, cheque y crédito.';
comment on table public.tipos_venta is
  'Catálogo de tipos de venta: Fabricación (se produce en los talleres), Comercialización (reventa), Venta Rápida (mostrador) y Mixto.';

-- ----- Producción --------------------------------------------------------------
comment on table public.talleres is
  'Catálogo de talleres de producción: Diseño, Sublimación, Corte, Costura y Bordado.';
comment on table public.produccion_taller is
  'Avance de cada partida de orden en cada taller: estado, responsable, fechas de inicio y fin y observaciones.';

-- ----- Productos e inventario ----------------------------------------------------
comment on table public.categorias_producto is
  'Catálogo de categorías de producto.';
comment on table public.productos is
  'Productos (prendas) que vende la empresa: nombre, tipo de prenda, categoría e imagen de referencia.';
comment on table public.variantes_producto is
  'Variantes de un producto por talla y color, con su SKU, precio y existencias.';
comment on table public.tallas is
  'Catálogo de tallas disponibles para las variantes de producto.';
comment on table public.colores is
  'Catálogo de colores disponibles para las variantes de producto.';
comment on table public.movimientos_producto is
  'Kárdex de producto terminado: entradas y salidas por variante, con existencia anterior y nueva, referencia y usuario.';
comment on table public.materiales is
  'Materia prima (telas, hilos, insumos): tipo, unidad, existencias actual y mínima, precio unitario y proveedor.';
comment on table public.movimientos_material is
  'Kárdex de materia prima: entradas, salidas y ajustes por material, con existencia anterior y nueva, motivo y usuario.';
comment on table public.proveedores is
  'Proveedores de materia prima: contacto, teléfono, correo y calificación.';

-- ----- Recursos humanos (LFT) ---------------------------------------------------
comment on table public.empleados is
  'Empleados de la empresa: puesto, fecha de ingreso, salario diario, prima vacacional, datos fiscales (RFC, CURP, NSS), usuario vinculado y baja.';
comment on table public.vacaciones is
  'Periodos de vacaciones otorgados a cada empleado por año de servicio, con días y prima vacacional (LFT, Arts. 76 a 81).';
comment on table public.incidencias is
  'Incidencias laborales de cada empleado: retardos, faltas justificadas e injustificadas, incapacidades, permisos con y sin goce y suspensiones (máx. 8 días), con motivo y acta administrativa.';
comment on table public.documentos is
  'Expediente laboral de cada empleado: contrato, alta IMSS, identificación, recibos (nómina, vacaciones, aguinaldo, PTU), actas, justificantes, renuncia, convenios, finiquito firmado, etc., con su archivo y si están firmados.';
comment on table public.finiquitos is
  'Cálculos de finiquito o liquidación al terminar la relación laboral (renuncia, mutuo acuerdo, despido justificado o injustificado, rescisión por el patrón): salarios base, conceptos desglosados y total.';

