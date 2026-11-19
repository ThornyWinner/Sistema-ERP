/**
 * busquedaGlobal.ts — Búsqueda en la base para el buscador global del Header.
 *
 * Órdenes, productos, materiales y proveedores ya están en memoria (ErpDataContext) y se
 * filtran en el componente. Los demás módulos no se cargan al iniciar sesión, así que se
 * consultan aquí: una consulta por módulo, con un máximo de resultados y el total
 * (count exact). Cada consulta respeta el RLS de la tabla, así que cada quien solo
 * encuentra lo que podría ver en su página (p. ej. el vendedor, sus cotizaciones).
 *
 * ilike no ignora acentos: "pantalon" no encuentra "Pantalón" en estos módulos.
 */
import { supabase } from "./supabase";
import { formatMonto } from "./pagos";
import { hoyISO } from "./fechas";
import { ESTADO_COTIZACION_LABEL, estadoVisible as estadoCotizacion } from "./cotizaciones";
import { roleLabels } from "../utils/permissions";
import type { UserRole } from "../types/auth";

export type ResultadoRemoto = {
  key: string;
  titulo: string;
  detalle: string;
  destino: string;
};

export type GrupoRemoto = {
  id: string;
  total: number;
  resultados: ResultadoRemoto[];
};

/** Quita los caracteres que rompen el filtro `or` de PostgREST. */
export const limpiarTermino = (q: string) => q.replace(/[,()*%\\:"]/g, " ").replace(/\s+/g, " ").trim();

const conQ = (ruta: string, q: string) => `${ruta}?q=${encodeURIComponent(q)}`;

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "";

const ilike = (campos: string[], t: string) => campos.map((c) => `${c}.ilike.*${t}*`);

type Opciones = {
  /** Texto ya limpio con limpiarTermino. */
  termino: string;
  /** Rutas que el rol puede ver (mismo criterio que el menú). */
  rutas: Set<string>;
  /** Ids de las órdenes visibles cuyo folio o cliente coincide (para buscar por orden). */
  ordenIds: string[];
  /** Ids de los productos cuyo nombre coincide (para las listas de precios). */
  productoIds: string[];
  max: number;
};

type Buscador = {
  id: string;
  ruta: string;
  buscar: (o: Opciones) => Promise<GrupoRemoto>;
};

const porOrden = (ids: string[]) => (ids.length ? [`orden_id.in.(${ids.slice(0, 40).join(",")})`] : []);

const BUSCADORES: Buscador[] = [
  {
    id: "cotizaciones",
    ruta: "/cotizaciones",
    buscar: async ({ termino, max }) => {
      const { data, count, error } = await supabase
        .from("cotizaciones")
        .select("id,folio,cliente_nombre,estado,vigencia,total,fecha", { count: "exact" })
        .or(ilike(["folio", "cliente_nombre", "cliente_telefono", "cliente_email"], termino).join(","))
        .order("fecha", { ascending: false })
        .limit(max);
      if (error) throw error;
      return {
        id: "cotizaciones",
        total: count ?? 0,
        resultados: (data ?? []).map((c) => ({
          key: `cotizacion-${c.id}`,
          titulo: c.folio,
          detalle: `${c.cliente_nombre} · ${ESTADO_COTIZACION_LABEL[estadoCotizacion(c as never)]} · ${formatMonto(Number(c.total))}`,
          destino: conQ("/cotizaciones", c.folio),
        })),
      };
    },
  },
  {
    id: "clientes",
    ruta: "/catalogos/clientes",
    buscar: async ({ termino, max, rutas }) => {
      const { data, count, error } = await supabase
        .from("clientes")
        .select("id,razon_social,nombre_comercial,rfc,contacto,telefono", { count: "exact" })
        .or(ilike(["razon_social", "nombre_comercial", "rfc", "contacto", "telefono", "email"], termino).join(","))
        .order("razon_social")
        .limit(max);
      if (error) throw error;
      // Con acceso al historial se abre la ficha del cliente (compras y seguimiento).
      const historial = rutas.has("/clientes/historial");
      return {
        id: "clientes",
        total: count ?? 0,
        resultados: (data ?? []).map((c) => ({
          key: `cliente-${c.id}`,
          titulo: c.nombre_comercial || c.razon_social,
          detalle: [c.nombre_comercial ? c.razon_social : null, c.rfc, c.contacto || c.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto",
          destino: historial ? `/clientes/historial/${c.id}` : conQ("/catalogos/clientes", c.razon_social),
        })),
      };
    },
  },
  {
    id: "devoluciones",
    ruta: "/devoluciones",
    buscar: async ({ termino, max, ordenIds }) => {
      const { data, count, error } = await supabase
        .from("devoluciones")
        .select("id,folio,tipo,fecha,ordenes(folio,clientes(razon_social))", { count: "exact" })
        .or([...ilike(["folio", "descripcion"], termino), ...porOrden(ordenIds)].join(","))
        .order("created_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      return {
        id: "devoluciones",
        total: count ?? 0,
        resultados: (data ?? []).map((d) => {
          const orden = d.ordenes as unknown as { folio: string; clientes: { razon_social: string } | null } | null;
          return {
            key: `devolucion-${d.id}`,
            titulo: d.folio,
            detalle: [d.tipo === "cambio" ? "Cambio" : "Devolución", orden?.folio, orden?.clientes?.razon_social, fecha(d.fecha)]
              .filter(Boolean)
              .join(" · "),
            destino: conQ("/devoluciones", d.folio),
          };
        }),
      };
    },
  },
  {
    id: "tallas",
    ruta: "/tallas",
    buscar: async ({ termino, max }) => {
      const { data, count, error } = await supabase
        .from("listas_tallas")
        .select("id,titulo,cliente_nombre,estado,cierra", { count: "exact" })
        .or(ilike(["titulo", "cliente_nombre"], termino).join(","))
        .order("created_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      return {
        id: "tallas",
        total: count ?? 0,
        resultados: (data ?? []).map((l) => ({
          key: `tallas-${l.id}`,
          titulo: l.titulo,
          detalle: `${l.cliente_nombre} · ${l.estado === "abierta" ? (l.cierra ? `abierta hasta ${fecha(l.cierra)}` : "abierta") : "cerrada"}`,
          destino: `/tallas/${l.id}`,
        })),
      };
    },
  },
  {
    id: "autorizaciones",
    ruta: "/autorizaciones",
    buscar: async ({ termino, max, ordenIds }) => {
      const { data, count, error } = await supabase
        .from("autorizaciones_venta")
        .select("id,cliente_nombre,estado,total,descuento,saldo,vence,orden_id", { count: "exact" })
        .or([...ilike(["cliente_nombre", "justificacion"], termino), ...porOrden(ordenIds)].join(","))
        .order("created_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      const ESTADO: Record<string, string> = {
        pendiente: "Pendiente",
        aprobada: "Aprobada",
        rechazada: "Rechazada",
        cancelada: "Retirada",
      };
      return {
        id: "autorizaciones",
        total: count ?? 0,
        resultados: (data ?? []).map((a) => ({
          key: `autorizacion-${a.id}`,
          titulo: a.cliente_nombre,
          detalle: [
            a.estado === "aprobada" && a.orden_id ? "Usada" : ESTADO[a.estado] ?? a.estado,
            a.descuento ? "descuento" : null,
            a.saldo ? "crédito" : null,
            formatMonto(Number(a.total)),
          ]
            .filter(Boolean)
            .join(" · "),
          destino: "/autorizaciones",
        })),
      };
    },
  },
  ...(["I", "P"] as const).map<Buscador>((tipo) => {
    const ruta = tipo === "I" ? "/facturacion/facturas" : "/facturacion/complementos";
    const id = tipo === "I" ? "facturas" : "complementos";
    return {
      id,
      ruta,
      buscar: async ({ termino, max }) => {
        const condiciones = ilike(["receptor_rfc", "receptor_nombre", "receptor_nombre_comercial"], termino);
        const numero = termino.replace(/^[A-Za-z]+\s*-?\s*/, "");
        if (/^\d{1,9}$/.test(numero)) condiciones.push(`folio.eq.${numero}`);
        if (/^[0-9a-fA-F-]{36}$/.test(termino)) condiciones.push(`uuid.eq.${termino}`);
        const { data, count, error } = await supabase
          .from("cfdis")
          .select("id,serie,folio,receptor_nombre,estado,total,fecha,origen", { count: "exact" })
          .eq("tipo_comprobante", tipo)
          .or(condiciones.join(","))
          .order("fecha", { ascending: false })
          .limit(max);
        if (error) throw error;
        return {
          id,
          total: count ?? 0,
          resultados: (data ?? []).map((c) => {
            const folio = `${c.serie ?? ""}${c.serie && c.folio != null ? "-" : ""}${c.folio ?? "s/folio"}`;
            return {
              key: `cfdi-${c.id}`,
              titulo: folio,
              detalle: `${c.receptor_nombre} · ${c.estado} · ${formatMonto(Number(c.total))}`,
              destino:
                tipo === "I" && c.origen === "erp" ? `/facturacion/facturas/${c.id}` : conQ(ruta, c.folio != null ? String(c.folio) : c.receptor_nombre),
            };
          }),
        };
      },
    };
  }),
  {
    id: "solicitudes",
    ruta: "/facturacion/solicitudes",
    buscar: async ({ termino, max, ordenIds }) => {
      const { data, count, error } = await supabase
        .from("solicitudes_factura")
        .select("id,receptor_nombre,receptor_rfc,estado,cfdi_folio,ordenes(folio)", { count: "exact" })
        .or([...ilike(["receptor_nombre", "receptor_rfc", "cfdi_folio"], termino), ...porOrden(ordenIds)].join(","))
        .order("solicitada_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      const ESTADO: Record<string, string> = { pendiente: "Pendiente", en_proceso: "En proceso", emitida: "Facturada", rechazada: "Rechazada", cancelada: "Cancelada" };
      return {
        id: "solicitudes",
        total: count ?? 0,
        resultados: (data ?? []).map((s) => {
          const orden = s.ordenes as unknown as { folio: string } | null;
          return {
            key: `solicitud-${s.id}`,
            titulo: s.receptor_nombre,
            detalle: [orden?.folio, s.receptor_rfc, ESTADO[s.estado] ?? s.estado, s.cfdi_folio].filter(Boolean).join(" · "),
            destino: "/facturacion/solicitudes",
          };
        }),
      };
    },
  },
  {
    id: "precios",
    ruta: "/catalogos/precios",
    buscar: async ({ termino, max, productoIds }) => {
      // Las condiciones se guardan por id; primero se buscan los clientes por nombre y RFC
      // (los productos ya vienen filtrados de memoria).
      const { data: clientes, error: errClientes } = await supabase
        .from("clientes")
        .select("id")
        .or(ilike(["razon_social", "nombre_comercial", "rfc"], termino).join(","))
        .limit(40);
      if (errClientes) throw errClientes;
      const clienteIds = (clientes ?? []).map((c) => c.id as string);
      const condiciones = [
        ...ilike(["notas"], termino),
        ...(clienteIds.length ? [`cliente_id.in.(${clienteIds.join(",")})`] : []),
        ...(productoIds.length ? [`producto_id.in.(${productoIds.slice(0, 40).join(",")})`] : []),
      ];
      const { data, count, error } = await supabase
        .from("precios_cliente")
        .select("id,descuento_pct,precio,vigente_hasta,clientes(razon_social),productos(nombre)", { count: "exact" })
        .or(condiciones.join(","))
        .order("updated_at", { ascending: false })
        .limit(max);
      if (error) throw error;
      const hoy = hoyISO();
      return {
        id: "precios",
        total: count ?? 0,
        resultados: (data ?? []).map((p) => {
          const cliente = (p.clientes as unknown as { razon_social: string } | null)?.razon_social ?? "Cliente";
          const producto = (p.productos as unknown as { nombre: string } | null)?.nombre ?? "Todos los productos";
          const condicion =
            p.precio != null ? `precio fijo ${formatMonto(Number(p.precio))}` : `−${Number(p.descuento_pct ?? 0)} %`;
          const vencida = !!p.vigente_hasta && p.vigente_hasta < hoy;
          return {
            key: `precio-${p.id}`,
            titulo: cliente,
            detalle: [producto, condicion, vencida ? "vencida" : p.vigente_hasta ? `hasta ${fecha(p.vigente_hasta)}` : null]
              .filter(Boolean)
              .join(" · "),
            destino: conQ("/catalogos/precios", cliente),
          };
        }),
      };
    },
  },
  {
    id: "usuarios",
    ruta: "/usuarios",
    buscar: async ({ termino, max }) => {
      const { data, count, error } = await supabase
        .from("usuarios")
        .select("id,nombre,username,email,estado,roles(nombre)", { count: "exact" })
        .or(ilike(["nombre", "username", "email"], termino).join(","))
        .order("nombre")
        .limit(max);
      if (error) throw error;
      return {
        id: "usuarios",
        total: count ?? 0,
        resultados: (data ?? []).map((u) => {
          const rol = (u.roles as unknown as { nombre: UserRole } | null)?.nombre;
          return {
            key: `usuario-${u.id}`,
            titulo: u.nombre,
            detalle: [`@${u.username}`, rol ? roleLabels[rol] ?? rol : "Sin rol", u.estado === "activo" ? null : "inactivo"]
              .filter(Boolean)
              .join(" · "),
            destino: conQ("/usuarios", u.username),
          };
        }),
      };
    },
  },
  {
    id: "empleados",
    ruta: "/vacaciones",
    buscar: async ({ termino, max }) => {
      const { data, count, error } = await supabase
        .from("empleados")
        .select("id,nombre,puesto,activo,fecha_ingreso", { count: "exact" })
        .or(ilike(["nombre", "puesto", "rfc", "curp", "nss"], termino).join(","))
        .order("activo", { ascending: false })
        .order("nombre")
        .limit(max);
      if (error) throw error;
      return {
        id: "empleados",
        total: count ?? 0,
        resultados: (data ?? []).map((e) => ({
          key: `empleado-${e.id}`,
          titulo: e.nombre,
          detalle: [e.puesto || "Sin puesto", e.activo ? `desde ${fecha(e.fecha_ingreso)}` : "inactivo"].join(" · "),
          destino: `/vacaciones?empleado=${e.id}`,
        })),
      };
    },
  },
  {
    id: "activos",
    ruta: "/activo-fijo",
    buscar: async ({ termino, max }) => {
      const { data, count, error } = await supabase
        .from("activos")
        .select("id,codigo,nombre,marca,modelo,ubicacion,estado", { count: "exact" })
        .or(ilike(["codigo", "nombre", "marca", "modelo", "numero_serie", "ubicacion", "descripcion"], termino).join(","))
        .order("codigo")
        .limit(max);
      if (error) throw error;
      return {
        id: "activos",
        total: count ?? 0,
        resultados: (data ?? []).map((a) => ({
          key: `activo-${a.id}`,
          titulo: `${a.codigo} · ${a.nombre}`,
          detalle: [[a.marca, a.modelo].filter(Boolean).join(" "), a.ubicacion, a.estado === "activo" ? null : a.estado]
            .filter(Boolean)
            .join(" · ") || "Sin detalle",
          destino: conQ("/activo-fijo", a.codigo),
        })),
      };
    },
  },
];

/** Rutas de los módulos que se buscan en la base (para saber si hay algo que consultar). */
export const RUTAS_REMOTAS = BUSCADORES.map((b) => b.ruta);

/**
 * Busca en todos los módulos a los que el rol tiene acceso. Si un módulo falla (p. ej.
 * una tabla que aún no existe), se omite sin tumbar a los demás.
 */
export async function buscarEnModulos(o: Opciones): Promise<GrupoRemoto[]> {
  const activos = BUSCADORES.filter((b) => o.rutas.has(b.ruta));
  const res = await Promise.allSettled(activos.map((b) => b.buscar(o)));
  return res.flatMap((r) => (r.status === "fulfilled" && r.value.total > 0 ? [r.value] : []));
}
