import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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

type ErpData = {
  materiales: Material[];
  productos: Producto[];
  proveedores: Proveedor[];
  ordenes: Orden[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  crearOrden: (orden: Orden) => Promise<string>;
  actualizarProgresoTaller: (
    ordenDetalleId: string,
    taller: Taller,
    nuevoEstado: TallerEstado
  ) => Promise<void>;
};

const ErpDataContext = createContext<ErpData | undefined>(undefined);

// --- Catálogos: mapeo entre los valores de negocio usados en la UI y los
// nombres exactos guardados en las tablas catálogo de Supabase. ---

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

const ESTADO_PAGO_APP: Record<string, Orden['estadoPago']> = {
  pendiente: 'pendiente',
  anticipo: 'anticipo',
  pagado: 'liquidado',
  cancelado: 'cancelado',
  vencido: 'vencido',
};

const ESTADO_PRODUCCION_DB: Record<TallerEstado, string> = {
  pending: 'Pendiente',
  'in-progress': 'En proceso',
  completed: 'Finalizado',
};

// El estado general de la orden (pending/in-progress/completed que usa la
// UI) se deriva de estados_orden.orden_visualizacion, que refleja el orden
// real del flujo de producción, en vez de intentar adivinarlo por substring
// del nombre (lo cual fallaba para todos los estados existentes).
const estadoGeneral = (nombre?: string | null, ordenVisualizacion?: number | null): Orden['estado'] => {
  if (nombre === 'Cancelada') return 'pending';
  if (ordenVisualizacion == null) return 'pending';
  if (ordenVisualizacion <= 1) return 'pending';
  if (ordenVisualizacion >= 9) return 'completed';
  return 'in-progress';
};

const SELECT_MATERIALES =
  'id,nombre,tipo,unidad,stock_actual,stock_minimo,precio_unitario,proveedores(nombre)';
const SELECT_PRODUCTOS =
  'id,nombre,tipo_prenda,categorias_producto(nombre),variantes_producto(id,talla,color,stock,precio,sku)';
const SELECT_PROVEEDORES =
  'id,nombre,contacto,telefono,email,calificacion,materiales(nombre)';
const SELECT_ORDENES =
  'id,folio,fecha_creacion,fecha_entrega,prioridad,total,anticipo,notas,' +
  'usuarios!ordenes_vendedor_id_fkey(id,nombre),clientes(razon_social),' +
  'estados_orden(nombre,orden_visualizacion),estados_pago(nombre),metodos_pago(nombre),tipos_venta(nombre),' +
  'orden_detalles(id,cantidad,precio_unitario,tipo_produccion,notas,' +
  'productos(nombre,tipo_prenda),variantes_producto(talla,color),' +
  'produccion_taller(estado,talleres(nombre)),' +
  'personalizaciones(lugar_bordado,logo_url,notas,personalizacion_hilos(color_hilo)))';
const SELECT_PAGOS = 'id,orden_id,fecha,monto,metodo_pago,metodos_pago(nombre)';

export function ErpDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Omit<ErpData, 'loading' | 'error' | 'refresh' | 'crearOrden' | 'actualizarProgresoTaller'>>({
    materiales: [],
    productos: [],
    proveedores: [],
    ordenes: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [materialesResult, productosResult, proveedoresResult, ordenesResult, pagosResult] = await Promise.all([
      supabase.from('materiales').select(SELECT_MATERIALES).order('nombre'),
      supabase.from('productos').select(SELECT_PRODUCTOS).order('nombre'),
      supabase.from('proveedores').select(SELECT_PROVEEDORES).order('nombre'),
      supabase.from('ordenes').select(SELECT_ORDENES).order('created_at', { ascending: false }),
      supabase.from('pagos').select(SELECT_PAGOS).order('fecha'),
    ]);
    const firstError =
      materialesResult.error || productosResult.error || proveedoresResult.error || ordenesResult.error || pagosResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const pagosPorOrden = new Map<string, Pago[]>();
    for (const p of pagosResult.data ?? []) {
      const lista = pagosPorOrden.get((p as any).orden_id) ?? [];
      lista.push({
        fecha: (p as any).fecha ?? '',
        monto: Number((p as any).monto ?? 0),
        metodo: METODO_PAGO_APP[(p as any).metodos_pago?.nombre?.toLowerCase()] ?? 'efectivo',
        referencia: undefined,
      });
      pagosPorOrden.set((p as any).orden_id, lista);
    }

    setData({
      materiales: (materialesResult.data ?? []).map((m: any) => ({
        id: m.id,
        nombre: m.nombre,
        tipo: m.tipo,
        unidad: m.unidad,
        stock: Number(m.stock_actual),
        stockMinimo: Number(m.stock_minimo),
        proveedor: m.proveedores?.nombre ?? 'Sin proveedor',
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
        return {
          id: p.id,
          nombre: p.nombre,
          tipo: p.tipo_prenda,
          tallas: [...new Set(variantes.map((v: any) => v.talla).filter(Boolean))],
          colores: [...new Set(variantes.map((v: any) => v.color).filter(Boolean))],
          stock: variantes.reduce((s: number, v: any) => s + v.stock, 0),
          precio: variantes[0]?.precio ?? 0,
          categoria: p.categorias_producto?.nombre ?? 'Sin categoría',
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
        const tipoVenta = TIPO_VENTA_APP[o.tipos_venta?.nombre?.toLowerCase()] ?? 'fabricacion';
        const metodoPago = METODO_PAGO_APP[o.metodos_pago?.nombre?.toLowerCase()] ?? 'efectivo';
        const estadoPago = ESTADO_PAGO_APP[o.estados_pago?.nombre?.toLowerCase()] ?? 'pendiente';
        return {
          id: o.id,
          numero: o.folio,
          vendedor: o.usuarios?.nombre ?? 'Sin asignar',
          vendedorId: o.usuarios?.id ?? '',
          cliente: o.clientes?.razon_social ?? 'Sin cliente',
          fechaCreacion: o.fecha_creacion ?? '',
          fechaEntrega: o.fecha_entrega ?? '',
          tipoVenta,
          estado: estadoGeneral(o.estados_orden?.nombre, o.estados_orden?.orden_visualizacion),
          prioridad: o.prioridad ?? 'media',
          metodoPago,
          estadoPago,
          total: Number(o.total ?? 0),
          anticipo: Number(o.anticipo ?? 0),
          pagos: pagosPorOrden.get(o.id) ?? [],
          notas: o.notas ?? undefined,
          productos: (o.orden_detalles ?? []).map((d: any): ProductoOrden => {
            const talleres: Taller[] = (d.produccion_taller ?? [])
              .map((x: any) => x.talleres?.nombre)
              .filter(Boolean);
            const progreso = Object.fromEntries(
              (d.produccion_taller ?? [])
                .filter((x: any) => x.talleres?.nombre)
                .map((x: any) => [x.talleres.nombre, x.estado ?? 'pending'])
            );
            const personalizacionRaw = d.personalizaciones?.[0];
            return {
              id: d.id,
              nombre: d.productos?.nombre ?? 'Producto',
              tipoPrenda: d.productos?.tipo_prenda ?? '',
              talla: d.variantes_producto?.talla ?? '',
              color: d.variantes_producto?.color ?? '',
              cantidad: d.cantidad,
              precioUnitario: Number(d.precio_unitario ?? 0),
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
            };
          }),
        };
      }),
    });
    setLoading(false);
  }, []);

  const crearOrden = useCallback(
    async (orden: Orden) => {
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

      let clienteId: string | null = null;
      if (orden.cliente) {
        const { data: clienteExistente } = await supabase
          .from('clientes')
          .select('id')
          .eq('razon_social', orden.cliente)
          .maybeSingle();
        if (clienteExistente) {
          clienteId = clienteExistente.id;
        } else {
          const { data: clienteNuevo, error: clienteError } = await supabase
            .from('clientes')
            .insert({ razon_social: orden.cliente })
            .select('id')
            .single();
          if (clienteError) throw clienteError;
          clienteId = clienteNuevo.id;
        }
      }

      const { data: ordenRow, error: ordenError } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: clienteId,
          vendedor_id: orden.vendedorId || null,
          prioridad: orden.prioridad,
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

      const { data: estadoProduccionPendiente } = await supabase
        .from('estados_produccion')
        .select('id')
        .eq('nombre', 'Pendiente')
        .maybeSingle();

      for (const producto of orden.productos) {
        let productoId: string | null = producto.productoId ?? null;
        let varianteId: string | null = producto.varianteId ?? null;

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

  const actualizarProgresoTaller = useCallback(
    async (ordenDetalleId: string, taller: Taller, nuevoEstado: TallerEstado) => {
      const nombreEstado = ESTADO_PRODUCCION_DB[nuevoEstado] ?? 'Pendiente';
      const [{ data: estadoRow }, { data: tallerRow }] = await Promise.all([
        supabase.from('estados_produccion').select('id').eq('nombre', nombreEstado).maybeSingle(),
        supabase.from('talleres').select('id').eq('nombre', taller).maybeSingle(),
      ]);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ErpDataContext.Provider value={{ ...data, loading, error, refresh, crearOrden, actualizarProgresoTaller }}>
      {children}
    </ErpDataContext.Provider>
  );
}

export function useErpData() {
  const value = useContext(ErpDataContext);
  if (!value) throw new Error('useErpData debe usarse dentro de ErpDataProvider');
  return value;
}
