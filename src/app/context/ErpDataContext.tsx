/**
 * ErpDataContext.tsx — Contexto global con los datos de negocio del ERP.
 *
 * Carga desde Supabase y comparte con toda la app:
 *  - materiales (inventario de materia prima),
 *  - productos (con sus variantes de talla/color),
 *  - proveedores,
 *  - órdenes (con detalles, producción por taller, personalizaciones y pagos).
 *
 * También expone operaciones de escritura:
 *  - crearOrden:               inserta una orden completa (cliente, detalles, talleres, pagos).
 *  - actualizarProgresoTaller: cambia el estado de producción de un producto en un taller.
 *  - registrarPago:            registra un abono (pago a plazos) de una orden.
 *  - editarOrden:              aplica los cambios que pidió el cliente (función editar_orden de la BD).
 *
 * Las filas de la base de datos (snake_case, con joins anidados) se transforman a los
 * tipos de la UI definidos en data/mockData.ts, de modo que las páginas no dependen
 * de la estructura exacta de las tablas.
 *
 * Uso: envolver la app con <ErpDataProvider> y consumir con el hook useErpData().
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type {
  Material,
  Orden,
  Pago,
  Producto,
  Proveedor,
  ProductoOrden,
  Taller,
  TallerEstado,
} from '../data/mockData';

/** Valores y funciones que expone el contexto. */
type ErpData = {
  materiales: Material[];
  productos: Producto[];
  proveedores: Proveedor[];
  ordenes: Orden[];
  /** true mientras se cargan los datos desde Supabase. */
  loading: boolean;
  /** Mensaje del primer error de carga, o null si todo fue bien. */
  error: string | null;
  /** Vuelve a descargar todos los datos. */
  refresh: () => Promise<void>;
  /** Guarda una orden nueva y devuelve su folio (generado por la base de datos). */
  crearOrden: (orden: Orden) => Promise<string>;
  /** Cambia el estado (pendiente / en proceso / completado) de un producto en un taller. */
  actualizarProgresoTaller: (
    ordenDetalleId: string,
    taller: Taller,
    nuevoEstado: TallerEstado
  ) => Promise<void>;
  /**
   * Registra un abono de la orden. El trigger de la BD recalcula su estado de pago
   * (Anticipo mientras quede saldo, Pagado al liquidarse).
   */
  registrarPago: (ordenId: string, pago: Pago) => Promise<void>;
  /**
   * Aplica los cambios que pidió el cliente a una orden (función editar_orden de la BD,
   * en una sola transacción): datos generales, partidas, inventario, total y estado de
   * pago. Deja el motivo en el historial y avisa al admin y a los talleres afectados.
   */
  editarOrden: (ordenId: string, cambios: CambiosOrden, motivo: string) => Promise<void>;
};

/** Partida tal como la recibe editar_orden (id null = partida nueva). */
export type PartidaEditada = {
  id: string | null;
  producto_id: string | null;
  variante_id: string | null;
  cantidad: number;
  precio_unitario: number;
  tipo_produccion: ProductoOrden['tipoProduccion'];
  notas: string | null;
  talleres: Taller[];
  personalizacion: {
    lugar_bordado: string | null;
    logo_url: string | null;
    notas: string | null;
    hilos: string[];
  } | null;
};

/** Estado completo deseado de la orden que se envía a editar_orden. */
export type CambiosOrden = {
  fecha_entrega: string | null;
  notas: string | null;
  descuento: number;
  cliente_telefono: string | null;
  cliente_email: string | null;
  /** Lista COMPLETA de partidas: las que no vengan se quitan de la orden. */
  partidas: PartidaEditada[];
};

const ErpDataContext = createContext<ErpData | undefined>(undefined);

// --- Catálogos: mapeo entre los valores de negocio usados en la UI y los
// nombres exactos guardados en las tablas catálogo de Supabase. ---

// Sufijo _DB: valor de la app → nombre en la tabla catálogo (para escribir).
// Sufijo _APP: nombre en la tabla (en minúsculas) → valor de la app (para leer).

// Tipos de venta (tabla `tipos_venta`).
const TIPO_VENTA_DB: Record<string, string> = {
  directa: 'Venta Rápida',
  fabricacion: 'Fabricacion',
  comercializacion: 'Comercialización',
  mixta: 'Mixto',
};

const TIPO_VENTA_APP: Record<string, Orden['tipoVenta']> = {
  'venta rápida': 'directa',
  fabricacion: 'fabricacion',
  'comercialización': 'comercializacion',
  mixto: 'mixta',
};

// Métodos de pago (tabla `metodos_pago`). Tarjeta de crédito y débito se agrupan como 'tarjeta'.
const METODO_PAGO_DB: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta Crédito',
  cheque: 'Cheque',
  credito: 'Crédito',
};

const METODO_PAGO_APP: Record<string, Orden['metodoPago']> = {
  efectivo: 'efectivo',
  transferencia: 'transferencia',
  'tarjeta crédito': 'tarjeta',
  'tarjeta débito': 'tarjeta',
  cheque: 'cheque',
  'crédito': 'credito',
};

// Estados de pago (tabla `estados_pago`). En la UI "pagado" se muestra como 'liquidado'.
const ESTADO_PAGO_APP: Record<string, Orden['estadoPago']> = {
  pendiente: 'pendiente',
  anticipo: 'anticipo',
  pagado: 'liquidado',
  cancelado: 'cancelado',
  vencido: 'vencido',
};

// Estados de producción en taller (tabla `estados_produccion`).
const ESTADO_PRODUCCION_DB: Record<TallerEstado, string> = {
  pending: 'Pendiente',
  'in-progress': 'En proceso',
  completed: 'Finalizado',
};

// Orden real del flujo de producción.
const ORDEN_TALLERES: Taller[] = ['diseno', 'sublimacion', 'corte', 'costura', 'bordado'];

// El estado general de la orden (pending/in-progress/completed que usa la
// UI) se deriva de estados_orden.orden_visualizacion, que refleja el orden
// real del flujo de producción, en vez de intentar adivinarlo por substring
// del nombre (lo cual fallaba para todos los estados existentes).
// Regla: posición ≤ 1 → pendiente; ≥ 9 → completada; intermedia → en proceso.
const estadoGeneral = (nombre?: string | null, ordenVisualizacion?: number | null): Orden['estado'] => {
  if (nombre === 'Cancelada') return 'pending';
  if (ordenVisualizacion == null) return 'pending';
  if (ordenVisualizacion <= 1) return 'pending';
  if (ordenVisualizacion >= 9) return 'completed';
  return 'in-progress';
};

// --- Consultas SELECT de Supabase (PostgREST). Las tablas entre paréntesis son joins
// por llave foránea, p. ej. `proveedores(nombre)` trae el nombre del proveedor. ---

const SELECT_MATERIALES =
  'id,nombre,tipo,unidad,stock_actual,stock_minimo,precio_unitario,proveedor_id,proveedores(nombre)';
const SELECT_PRODUCTOS =
  'id,nombre,tipo_prenda,imagen_url,categorias_producto(nombre),variantes_producto(id,talla,color,stock,precio,sku)';
const SELECT_PROVEEDORES =
  'id,nombre,contacto,telefono,email,calificacion,materiales(nombre)';
// Consulta de órdenes con todo su árbol de datos:
//  - usuarios!ordenes_vendedor_id_fkey: el vendedor (se indica la FK porque `ordenes`
//    tiene varias relaciones con `usuarios`).
//  - orden_detalles: cada producto de la orden, con su variante, su avance en cada
//    taller (produccion_taller) y su personalización (bordado, logo, hilos).
const SELECT_ORDENES =
  'id,folio,fecha_creacion,fecha_entrega,subtotal,descuento,total,anticipo,notas,' +
  'usuarios!ordenes_vendedor_id_fkey(id,nombre),clientes(razon_social,telefono,email),' +
  'estados_orden(nombre,orden_visualizacion),estados_pago(nombre),metodos_pago(nombre),tipos_venta(nombre),' +
  'orden_detalles(id,producto_id,variante_id,cantidad,precio_unitario,tipo_produccion,notas,' +
  'productos(nombre,tipo_prenda),variantes_producto(talla,color),' +
  'produccion_taller(estado,talleres(nombre)),' +
  'personalizaciones(lugar_bordado,logo_url,notas,personalizacion_hilos(color_hilo)))';
const SELECT_PAGOS = 'id,orden_id,fecha,monto,metodo_pago,referencia,metodos_pago(nombre)';

/** Colecciones vacías: estado inicial y el que queda al cerrar sesión. */
const SIN_DATOS = { materiales: [], productos: [], proveedores: [], ordenes: [] };

export function ErpDataProvider({ children }: { children: React.ReactNode }) {
  // Lo que cada usuario puede ver depende de su rol (RLS), así que los datos se
  // vuelven a cargar cada vez que cambia el usuario con sesión.
  const { user } = useAuth();
  const userId = user?.id;
  // Estado con las cuatro colecciones de datos (las funciones y banderas van aparte).
  const [data, setData] = useState<Omit<ErpData, 'loading' | 'error' | 'refresh' | 'crearOrden' | 'actualizarProgresoTaller' | 'registrarPago' | 'editarOrden'>>(SIN_DATOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Número de la carga más reciente: si llega tarde la respuesta de una carga anterior
  // (p. ej. del usuario que acaba de cerrar sesión), se descarta.
  const ultimaCarga = useRef(0);

  /**
   * Descarga todos los datos del ERP en paralelo y los transforma al formato de la UI.
   * useCallback mantiene la misma referencia entre renders para usarla en dependencias.
   */
  const refresh = useCallback(async () => {
    const carga = ++ultimaCarga.current;
    setLoading(true);
    setError(null);
    // Las cinco consultas se lanzan a la vez para reducir el tiempo de carga.
    const [materialesResult, productosResult, proveedoresResult, ordenesResult, pagosResult] = await Promise.all([
      supabase.from('materiales').select(SELECT_MATERIALES).order('nombre'),
      supabase.from('productos').select(SELECT_PRODUCTOS).order('nombre'),
      supabase.from('proveedores').select(SELECT_PROVEEDORES).order('nombre'),
      // FIFO: de la orden más antigua a la más reciente (primero en llegar, primero en atenderse).
      supabase.from('ordenes').select(SELECT_ORDENES).order('created_at', { ascending: true }),
      supabase.from('pagos').select(SELECT_PAGOS).order('fecha'),
    ]);
    // Ya se pidió una carga más nueva (o se cerró sesión): esta respuesta es obsoleta.
    if (carga !== ultimaCarga.current) return;
    // Si cualquier consulta falla, se muestra el primer error y no se actualizan los datos.
    const firstError =
      materialesResult.error || productosResult.error || proveedoresResult.error || ordenesResult.error || pagosResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    // Agrupa los pagos por id de orden para adjuntarlos después a cada orden.
    const pagosPorOrden = new Map<string, Pago[]>();
    for (const p of pagosResult.data ?? []) {
      const lista = pagosPorOrden.get((p as any).orden_id) ?? [];
      lista.push({
        fecha: (p as any).fecha ?? '',
        monto: Number((p as any).monto ?? 0),
        metodo: METODO_PAGO_APP[(p as any).metodos_pago?.nombre?.toLowerCase()] ?? 'efectivo',
        referencia: (p as any).referencia ?? undefined,
      });
      pagosPorOrden.set((p as any).orden_id, lista);
    }

    // Transformación de filas de la BD (snake_case) a objetos de la UI (camelCase).
    // Number(...) convierte los campos numeric de PostgreSQL, que llegan como texto.
    setData({
      materiales: (materialesResult.data ?? []).map((m: any) => ({
        id: m.id,
        nombre: m.nombre,
        tipo: m.tipo,
        unidad: m.unidad,
        stock: Number(m.stock_actual),
        stockMinimo: Number(m.stock_minimo),
        proveedor: m.proveedores?.nombre ?? 'Sin proveedor',
        proveedorId: m.proveedor_id ?? undefined,
        precio: Number(m.precio_unitario ?? 0),
      })),
      productos: (productosResult.data ?? []).map((p: any) => {
        const variantes = (p.variantes_producto ?? []).map((v: any) => ({
          id: v.id,
          talla: v.talla ?? '',
          color: v.color ?? '',
          stock: Number(v.stock ?? 0),
          precio: Number(v.precio ?? 0),
          sku: v.sku ?? null,
        }));
        // Datos agregados a partir de las variantes:
        //  - tallas/colores: valores únicos (Set) sin vacíos.
        //  - stock: suma del stock de todas las variantes.
        //  - precio: el de la primera variante, como precio de referencia.
        return {
          id: p.id,
          nombre: p.nombre,
          tipo: p.tipo_prenda,
          tallas: [...new Set<string>(variantes.map((v: any) => v.talla).filter(Boolean))],
          colores: [...new Set<string>(variantes.map((v: any) => v.color).filter(Boolean))],
          stock: variantes.reduce((s: number, v: any) => s + v.stock, 0),
          precio: variantes[0]?.precio ?? 0,
          categoria: p.categorias_producto?.nombre ?? 'Sin categoría',
          imagen: p.imagen_url ?? undefined,
          variantes,
        };
      }),
      proveedores: (proveedoresResult.data ?? []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        contacto: p.contacto ?? '',
        telefono: p.telefono ?? '',
        email: p.email ?? '',
        calificacion: Number(p.calificacion ?? 0),
        insumos: (p.materiales ?? []).map((m: any) => m.nombre),
      })),
      ordenes: (ordenesResult.data ?? []).map((o: any) => {
        // Los nombres de catálogo se comparan en minúsculas; si no hay coincidencia se usa un valor por defecto.
        const tipoVenta = TIPO_VENTA_APP[o.tipos_venta?.nombre?.toLowerCase()] ?? 'fabricacion';
        const metodoPago = METODO_PAGO_APP[o.metodos_pago?.nombre?.toLowerCase()] ?? 'efectivo';
        const estadoPago = ESTADO_PAGO_APP[o.estados_pago?.nombre?.toLowerCase()] ?? 'pendiente';
        return {
          id: o.id,
          numero: o.folio,
          vendedor: o.usuarios?.nombre ?? 'Sin asignar',
          vendedorId: o.usuarios?.id ?? '',
          cliente: o.clientes?.razon_social ?? 'Sin cliente',
          clienteTelefono: o.clientes?.telefono ?? undefined,
          clienteEmail: o.clientes?.email ?? undefined,
          fechaCreacion: o.fecha_creacion ?? '',
          fechaEntrega: o.fecha_entrega ?? '',
          tipoVenta,
          estado: estadoGeneral(o.estados_orden?.nombre, o.estados_orden?.orden_visualizacion),
          metodoPago,
          estadoPago,
          total: Number(o.total ?? 0),
          anticipo: Number(o.anticipo ?? 0),
          subtotal: o.subtotal != null ? Number(o.subtotal) : undefined,
          descuento: Number(o.descuento ?? 0),
          estadoNombre: o.estados_orden?.nombre ?? undefined,
          pagos: pagosPorOrden.get(o.id) ?? [],
          notas: o.notas ?? undefined,
          productos: (o.orden_detalles ?? []).map((d: any): ProductoOrden => {
            // Talleres por los que debe pasar este producto (p. ej. ['corte', 'costura']),
            // en el orden del flujo: la base de datos no garantiza el orden de las filas.
            const talleres: Taller[] = (d.produccion_taller ?? [])
              .map((x: any) => x.talleres?.nombre)
              .filter(Boolean)
              .sort((a: Taller, b: Taller) => ORDEN_TALLERES.indexOf(a) - ORDEN_TALLERES.indexOf(b));
            // Objeto { taller: estado } con el avance del producto en cada taller.
            const progreso = Object.fromEntries(
              (d.produccion_taller ?? [])
                .filter((x: any) => x.talleres?.nombre)
                .map((x: any) => [x.talleres.nombre, x.estado ?? 'pending'])
            );
            // Solo se usa la primera personalización registrada del producto.
            const personalizacionRaw = d.personalizaciones?.[0];
            return {
              id: d.id,
              nombre: d.productos?.nombre ?? 'Producto',
              tipoPrenda: d.productos?.tipo_prenda ?? '',
              talla: d.variantes_producto?.talla ?? '',
              color: d.variantes_producto?.color ?? '',
              cantidad: d.cantidad,
              precioUnitario: Number(d.precio_unitario ?? 0),
              // Usa el tipo de producción guardado en el detalle si es válido; si no,
              // lo deduce del tipo de venta de la orden.
              tipoProduccion: (['directa', 'fabricacion', 'comercializacion'] as const).includes(d.tipo_produccion)
                ? d.tipo_produccion
                : tipoVenta === 'directa'
                ? 'directa'
                : tipoVenta === 'comercializacion'
                ? 'comercializacion'
                : 'fabricacion',
              talleres,
              progreso,
              personalizacion: personalizacionRaw
                ? {
                    lugarBordado: personalizacionRaw.lugar_bordado ?? undefined,
                    logotipo: personalizacionRaw.logo_url ?? undefined,
                    coloresHilo: (personalizacionRaw.personalizacion_hilos ?? []).map((h: any) => h.color_hilo),
                    notas: personalizacionRaw.notas ?? undefined,
                  }
                : undefined,
              notas: d.notas ?? undefined,
              productoId: d.producto_id ?? undefined,
              varianteId: d.variante_id ?? undefined,
            };
          }),
        };
      }),
    });
    setLoading(false);
  }, []);

  /**
   * Crea una orden completa en Supabase. Pasos:
   *  1. Busca los ids de catálogo (estado inicial, tipo de venta, método de pago).
   *  2. Busca el cliente por razón social o lo crea si no existe.
   *  3. Inserta la orden (la BD genera el folio).
   *  4. Por cada producto: inserta el detalle, su personalización (y colores de hilo)
   *     y una fila de produccion_taller "pendiente" por cada taller asignado.
   *  5. Registra los pagos (o el anticipo como respaldo).
   *  6. Recarga los datos y devuelve el folio.
   * Nota: las inserciones no son transaccionales; si un paso falla, los anteriores ya
   * quedaron guardados.
   */
  const crearOrden = useCallback(
    async (orden: Orden) => {
      // Una venta ya completada (p. ej. venta rápida) nace como 'Entregada'.
      const estadoInicialNombre = orden.estado === 'completed' ? 'Entregada' : 'Pendiente';
      const [{ data: estadoRow }, { data: tipoVentaRow }, { data: metodoPagoRow }] = await Promise.all([
        supabase.from('estados_orden').select('id').eq('nombre', estadoInicialNombre).maybeSingle(),
        supabase
          .from('tipos_venta')
          .select('id')
          .eq('nombre', TIPO_VENTA_DB[orden.tipoVenta] ?? 'Fabricacion')
          .maybeSingle(),
        supabase
          .from('metodos_pago')
          .select('id')
          .eq('nombre', METODO_PAGO_DB[orden.metodoPago] ?? 'Efectivo')
          .maybeSingle(),
      ]);

      // Reutiliza el cliente si ya existe con la misma razón social; si no, lo crea.
      // Los datos de contacto capturados en la orden actualizan los del cliente.
      let clienteId: string | null = null;
      if (orden.cliente) {
        const contacto: Record<string, string> = {};
        if (orden.clienteTelefono) contacto.telefono = orden.clienteTelefono;
        if (orden.clienteEmail) contacto.email = orden.clienteEmail;
        const { data: clienteExistente } = await supabase
          .from('clientes')
          .select('id')
          .eq('razon_social', orden.cliente)
          .maybeSingle();
        if (clienteExistente) {
          clienteId = clienteExistente.id;
          if (Object.keys(contacto).length) {
            const { error: contactoError } = await supabase
              .from('clientes')
              .update(contacto)
              .eq('id', clienteExistente.id);
            if (contactoError) throw contactoError;
          }
        } else {
          const { data: clienteNuevo, error: clienteError } = await supabase
            .from('clientes')
            .insert({ razon_social: orden.cliente, ...contacto })
            .select('id')
            .single();
          if (clienteError) throw clienteError;
          clienteId = clienteNuevo.id;
        }
      }

      // Inserta la cabecera de la orden y recupera el id y el folio generados.
      const { data: ordenRow, error: ordenError } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: clienteId,
          vendedor_id: orden.vendedorId || null,
          fecha_creacion: orden.fechaCreacion || new Date().toISOString().split('T')[0],
          fecha_entrega: orden.fechaEntrega || null,
          subtotal: orden.total,
          total: orden.total,
          anticipo: orden.anticipo || 0,
          notas: orden.notas || null,
          estado_id: estadoRow?.id ?? null,
          metodo_pago_id: metodoPagoRow?.id ?? null,
          tipo_venta_id: tipoVentaRow?.id ?? null,
        })
        .select('id, folio')
        .single();
      if (ordenError) throw ordenError;

      // Id del estado "Pendiente" para las filas iniciales de produccion_taller.
      const { data: estadoProduccionPendiente } = await supabase
        .from('estados_produccion')
        .select('id')
        .eq('nombre', 'Pendiente')
        .maybeSingle();

      for (const producto of orden.productos) {
        let productoId: string | null = producto.productoId ?? null;
        let varianteId: string | null = producto.varianteId ?? null;

        // Si el formulario no indicó la variante, se intenta localizar por talla + color
        // + nombre del producto (comparación sin distinguir mayúsculas).
        if (!varianteId && producto.talla && producto.color) {
          const { data: variantesEncontradas } = await supabase
            .from('variantes_producto')
            .select('id, producto_id, productos(nombre)')
            .eq('talla', producto.talla)
            .eq('color', producto.color);
          const match = (variantesEncontradas ?? []).find(
            (v: any) => v.productos?.nombre?.toLowerCase() === producto.nombre.toLowerCase()
          );
          if (match) {
            varianteId = match.id;
            productoId = match.producto_id;
          }
        }

        // Línea de detalle de la orden (un producto con su cantidad y precio).
        const { data: detalleRow, error: detalleError } = await supabase
          .from('orden_detalles')
          .insert({
            orden_id: ordenRow.id,
            producto_id: productoId,
            variante_id: varianteId,
            cantidad: producto.cantidad,
            precio_unitario: producto.precioUnitario,
            tipo_produccion: producto.tipoProduccion,
            notas: producto.notas || null,
          })
          .select('id')
          .single();
        if (detalleError) throw detalleError;

        // Guarda la personalización solo si tiene algún dato útil (lugar, logo o hilos).
        if (producto.personalizacion && (producto.personalizacion.lugarBordado || producto.personalizacion.logotipo || producto.personalizacion.coloresHilo?.length)) {
          const { data: personalizacionRow, error: personalizacionError } = await supabase
            .from('personalizaciones')
            .insert({
              orden_detalle_id: detalleRow.id,
              lugar_bordado: producto.personalizacion.lugarBordado ?? null,
              logo_url: producto.personalizacion.logotipo ?? null,
              notas: producto.personalizacion.notas ?? null,
            })
            .select('id')
            .single();
          if (personalizacionError) throw personalizacionError;
          const hilos = producto.personalizacion.coloresHilo ?? [];
          if (hilos.length) {
            await supabase
              .from('personalizacion_hilos')
              .insert(hilos.map((color_hilo) => ({ personalizacion_id: personalizacionRow.id, color_hilo })));
          }
        }

        // Crea el registro de producción "pendiente" en cada taller asignado; así el
        // producto aparece en el tablero Kanban de esos talleres.
        if (producto.talleres?.length) {
          const { data: talleresRows } = await supabase.from('talleres').select('id, nombre').in('nombre', producto.talleres);
          const rows = (talleresRows ?? []).map((t: any) => ({
            orden_detalle_id: detalleRow.id,
            taller_id: t.id,
            estado: 'pending',
            estado_id: estadoProduccionPendiente?.id ?? null,
          }));
          if (rows.length) await supabase.from('produccion_taller').insert(rows);
        }
      }

      // Se registra un pago por cada entrada en orden.pagos (cubre tanto el
      // anticipo de una orden de fabricación como el pago total de una
      // venta rápida). Si el formulario no trae pagos pero sí anticipo,
      // se registra ese anticipo como respaldo.
      const pagosARegistrar = orden.pagos.length > 0 ? orden.pagos : orden.anticipo > 0 ? [{ fecha: orden.fechaCreacion, monto: orden.anticipo, metodo: orden.metodoPago }] : [];
      for (const pago of pagosARegistrar) {
        // Reutiliza el id del método de pago de la orden si coincide; si no, lo consulta.
        const { data: metodoPagoDelPago } = pago.metodo && pago.metodo !== orden.metodoPago
          ? await supabase.from('metodos_pago').select('id').eq('nombre', METODO_PAGO_DB[pago.metodo] ?? 'Efectivo').maybeSingle()
          : { data: metodoPagoRow };
        const { error: pagoError } = await supabase.from('pagos').insert({
          orden_id: ordenRow.id,
          fecha: pago.fecha || new Date().toISOString().split('T')[0],
          monto: pago.monto,
          metodo_pago: METODO_PAGO_DB[pago.metodo] ?? 'Efectivo',
          metodo_pago_id: metodoPagoDelPago?.id ?? null,
        });
        if (pagoError) throw pagoError;
      }

      await refresh();
      return ordenRow.folio as string;
    },
    [refresh]
  );

  /**
   * Actualiza el estado de un producto (orden_detalle) en un taller concreto.
   * Además registra la fecha de inicio al pasar a "en proceso" y la de fin al
   * completarse. Al terminar recarga los datos para reflejar el cambio.
   */
  const actualizarProgresoTaller = useCallback(
    async (ordenDetalleId: string, taller: Taller, nuevoEstado: TallerEstado) => {
      const nombreEstado = ESTADO_PRODUCCION_DB[nuevoEstado] ?? 'Pendiente';
      const [{ data: estadoRow }, { data: tallerRow }] = await Promise.all([
        supabase.from('estados_produccion').select('id').eq('nombre', nombreEstado).maybeSingle(),
        supabase.from('talleres').select('id').eq('nombre', taller).maybeSingle(),
      ]);
      // Si el taller no existe en la BD no hay nada que actualizar.
      if (!tallerRow) return;
      const patch: Record<string, unknown> = { estado: nuevoEstado, estado_id: estadoRow?.id ?? null };
      if (nuevoEstado === 'in-progress') patch.fecha_inicio = new Date().toISOString();
      if (nuevoEstado === 'completed') patch.fecha_fin = new Date().toISOString();
      const { error } = await supabase
        .from('produccion_taller')
        .update(patch)
        .eq('orden_detalle_id', ordenDetalleId)
        .eq('taller_id', tallerRow.id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  /** Inserta un abono en `pagos` y recarga los datos para reflejar el nuevo saldo. */
  const registrarPago = useCallback(
    async (ordenId: string, pago: Pago) => {
      const nombreMetodo = METODO_PAGO_DB[pago.metodo] ?? 'Efectivo';
      const { data: metodoRow } = await supabase
        .from('metodos_pago')
        .select('id')
        .eq('nombre', nombreMetodo)
        .maybeSingle();
      const { error } = await supabase.from('pagos').insert({
        orden_id: ordenId,
        fecha: pago.fecha || new Date().toISOString().split('T')[0],
        monto: pago.monto,
        metodo_pago: nombreMetodo,
        metodo_pago_id: metodoRow?.id ?? null,
        referencia: pago.referencia?.trim() || null,
      });
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  /** Llama a la función editar_orden de la BD y recarga los datos. */
  const editarOrden = useCallback(
    async (ordenId: string, cambios: CambiosOrden, motivo: string) => {
      const { error } = await supabase.rpc('editar_orden', {
        p_orden: ordenId,
        p_cambios: cambios,
        p_motivo: motivo,
      });
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  // Al cambiar de usuario se descartan los datos del anterior y se cargan los del
  // nuevo; sin sesión no se carga nada (RLS no devolvería filas).
  useEffect(() => {
    setData(SIN_DATOS);
    if (userId) {
      void refresh();
    } else {
      ultimaCarga.current++;
      setLoading(false);
    }
  }, [userId, refresh]);

  return (
    <ErpDataContext.Provider value={{ ...data, loading, error, refresh, crearOrden, actualizarProgresoTaller, registrarPago, editarOrden }}>
      {children}
    </ErpDataContext.Provider>
  );
}

/** Hook para acceder a los datos del ERP. Debe usarse dentro de <ErpDataProvider>. */
export function useErpData() {
  const value = useContext(ErpDataContext);
  if (!value) throw new Error('useErpData debe usarse dentro de ErpDataProvider');
  return value;
}
