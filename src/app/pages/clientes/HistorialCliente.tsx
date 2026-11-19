/**
 * HistorialCliente.tsx — Ficha comercial de un cliente (ruta /clientes/historial/:id).
 *
 *  - Resumen: órdenes, monto comprado, ticket promedio, última compra y frecuencia.
 *  - Lo que suele pedir: productos (veces, piezas, último precio), tallas y colores.
 *  - Órdenes: con "Repetir pedido", que abre una orden nueva con los mismos productos,
 *    tallas, colores, talleres y bordado (lib/clientesCrm.ts → capturaDesdeOrden).
 *  - Seguimiento: bitácora de contactos y botón para escribirle por WhatsApp o correo.
 *
 * El vendedor ve solo sus órdenes con el cliente (RLS).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  MessageCircle,
  NotebookPen,
  Phone,
  Mail,
  Repeat,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useErpData } from "../../context/ErpDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import ContactarClienteDialog from "../../components/ContactarClienteDialog";
import RegistrarContactoDialog from "../../components/clientes/RegistrarContactoDialog";
import NuevaOrdenMultiProducto, { type CapturaInicial } from "../../components/NuevaOrdenMultiProducto";
import { Button } from "../../components/ui/button";
import {
  CANAL_CONTACTO,
  RESULTADO_CONTACTO,
  SITUACION_INFO,
  capturaDesdeOrden,
  cargarContactos,
  cargarResumenClientes,
  eliminarContacto,
  historialCliente,
  ordenesDeCliente,
  plantillasRecontacto,
  situacionCliente,
  type CanalContacto,
  type ContactoCliente,
  type ResumenCliente,
} from "../../lib/clientesCrm";
import { formatFecha } from "../../lib/fechas";
import { formatMonto } from "../../lib/pagos";
import { hasPermission } from "../../utils/permissions";
import type { Orden } from "../../data/mockData";

interface ClienteBasico {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  notas: string | null;
}

export default function HistorialCliente() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ordenes, productos, crearOrden } = useErpData();
  const [cliente, setCliente] = useState<ClienteBasico | null>(null);
  const [resumen, setResumen] = useState<ResumenCliente | null>(null);
  const [contactos, setContactos] = useState<ContactoCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [contactar, setContactar] = useState(false);
  const [registrar, setRegistrar] = useState<{ canal?: CanalContacto } | null>(null);
  const [repetir, setRepetir] = useState<CapturaInicial | null>(null);

  const puedeCrearOrden = !!user && hasPermission(user.rol, "/ordenes", "canCreate");
  const puedeRegistrar = !!user && hasPermission(user.rol, "/clientes/historial", "canCreate");

  const cargarSeguimiento = async () => {
    try {
      setContactos(await cargarContactos(id));
      const filas = await cargarResumenClientes();
      setResumen(filas.find((f) => f.clienteId === id) ?? null);
    } catch (err: any) {
      toast.error("No se pudo cargar el seguimiento", { description: err?.message });
    }
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const { data, error } = await supabase
        .from("clientes")
        .select("id,razon_social,nombre_comercial,telefono,email,contacto,notas")
        .eq("id", id)
        .maybeSingle();
      if (!vivo) return;
      if (error) toast.error("No se pudo cargar el cliente", { description: error.message });
      setCliente((data as ClienteBasico | null) ?? null);
      await cargarSeguimiento();
      if (vivo) setCargando(false);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const suyas = useMemo(() => ordenesDeCliente(ordenes, id, cliente?.razon_social), [ordenes, id, cliente]);
  const hist = useMemo(() => historialCliente(suyas), [suyas]);
  const maxTalla = Math.max(1, ...hist.tallas.map((t) => t.piezas));

  if (!cargando && !cliente) {
    return (
      <div className="p-6 text-center space-y-4">
        <h2>Cliente no encontrado</h2>
        <Button onClick={() => navigate("/clientes/historial")}>Volver al historial</Button>
      </div>
    );
  }

  const nombre = cliente?.razon_social ?? "…";
  const situacion = resumen ? situacionCliente(resumen, 90) : null;

  const abrirRepetir = (o: Orden) => {
    setRepetir(capturaDesdeOrden(o, productos));
  };

  const guardarOrden = async (orden: Orden): Promise<boolean> => {
    try {
      const { id: nueva, folio } = await crearOrden(orden);
      toast.success("Orden creada", { description: `${folio} - ${orden.cliente}` });
      setRepetir(null);
      navigate(`/ordenes/${nueva}`);
      return true;
    } catch (err: any) {
      toast.error("No se pudo crear la orden", { description: err?.message, duration: 10000 });
      return false;
    }
  };

  const borrarContacto = async (c: ContactoCliente) => {
    if (!window.confirm("¿Borrar este seguimiento?")) return;
    try {
      await eliminarContacto(c.id);
      await cargarSeguimiento();
    } catch (err: any) {
      toast.error("No se pudo borrar", { description: err?.message });
    }
  };

  const copiarResumen = async () => {
    const texto = [
      nombre,
      ...hist.productos.slice(0, 5).map((p) => `• ${p.nombre}: ${p.piezas} pza(s) en ${p.veces} pedido(s)${p.tallas.length ? ` — tallas ${p.tallas.join(", ")}` : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumen copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/clientes/historial")}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
          aria-label="Volver al historial de clientes"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate">{nombre}</h1>
            {situacion && (
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${SITUACION_INFO[situacion].clase}`}>
                {SITUACION_INFO[situacion].texto}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
            {cliente?.nombre_comercial && <span>{cliente.nombre_comercial}</span>}
            {cliente?.contacto && <span>Contacto: {cliente.contacto}</span>}
            {cliente?.telefono && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {cliente.telefono}
              </span>
            )}
            {cliente?.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {cliente.email}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setContactar(true)}>
          <MessageCircle className="w-4 h-4" />
          Escribir al cliente
        </Button>
        {puedeRegistrar && (
          <Button variant="outline" onClick={() => setRegistrar({})}>
            <NotebookPen className="w-4 h-4" />
            Registrar seguimiento
          </Button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Dato titulo="Órdenes" valor={String(resumen?.ordenes ?? suyas.length)} />
        <Dato titulo="Comprado (con IVA)" valor={formatMonto(resumen?.comprado ?? hist.comprado)} />
        <Dato titulo="Ticket promedio" valor={resumen?.ticketPromedio ? formatMonto(resumen.ticketPromedio) : "—"} />
        <Dato
          titulo="Última compra"
          valor={resumen?.ultimaCompra ? formatFecha(resumen.ultimaCompra) : "—"}
          pie={resumen?.diasSinComprar != null ? `hace ${resumen.diasSinComprar} día(s)` : undefined}
        />
        <Dato
          titulo="Compra cada"
          valor={resumen?.frecuenciaDias ? `${resumen.frecuenciaDias} días` : "—"}
          pie={resumen?.primeraCompra ? `cliente desde ${formatFecha(resumen.primeraCompra)}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Lo que suele pedir */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Lo que suele pedir</CardTitle>
            {hist.productos.length > 0 && (
              <Button size="sm" variant="ghost" onClick={copiarResumen}>
                <Copy className="w-4 h-4" />
                Copiar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {hist.productos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay compras registradas.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Producto</th>
                        <th className="py-2 pr-4 text-right">Pedidos</th>
                        <th className="py-2 pr-4 text-right">Piezas</th>
                        <th className="py-2 pr-4">Tallas</th>
                        <th className="py-2 pr-4 text-right">Último precio</th>
                        <th className="py-2">Última vez</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {hist.productos.map((p) => (
                        <tr key={p.nombre}>
                          <td className="py-2 pr-4 font-medium">{p.nombre}</td>
                          <td className="py-2 pr-4 text-right">{p.veces}</td>
                          <td className="py-2 pr-4 text-right">{p.piezas}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{p.tallas.join(", ") || "—"}</td>
                          <td className="py-2 pr-4 text-right">{formatMonto(p.ultimoPrecio)}</td>
                          <td className="py-2 text-muted-foreground">{formatFecha(p.ultimaVez)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Tallas que pide (piezas)</h3>
                    {hist.tallas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin tallas registradas.</p>
                    ) : (
                      <ul className="space-y-2">
                        {hist.tallas.map((t) => (
                          <li key={t.talla} className="flex items-center gap-3 text-sm">
                            <span className="w-12 shrink-0 font-medium">{t.talla}</span>
                            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${(t.piezas / maxTalla) * 100}%` }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-muted-foreground">
                              {t.piezas} · {Math.round((t.piezas / Math.max(hist.piezas, 1)) * 100)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-3">Colores</h3>
                    {hist.colores.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin colores registrados.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {hist.colores.map((c) => (
                          <span key={c.color} className="rounded-full bg-secondary px-3 py-1 text-sm">
                            {c.color} <span className="text-muted-foreground">· {c.piezas}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Seguimiento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" />
              Seguimiento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resumen?.proximoContacto && (
              <p className="rounded-md bg-secondary p-3 text-sm">
                Próximo contacto: <strong>{formatFecha(resumen.proximoContacto)}</strong>
              </p>
            )}
            {contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin seguimientos registrados.</p>}
            <ol className="space-y-3">
              {contactos.map((c) => (
                <li key={c.id} className="rounded-md border border-border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {formatFecha(c.fecha.slice(0, 10))} · {CANAL_CONTACTO[c.canal]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${RESULTADO_CONTACTO[c.resultado].clase}`}>
                      {RESULTADO_CONTACTO[c.resultado].texto}
                    </span>
                  </div>
                  {c.notas && <p className="whitespace-pre-line">{c.notas}</p>}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {c.usuario ?? ""}
                      {c.proximoContacto ? ` · volver el ${formatFecha(c.proximoContacto)}` : ""}
                    </span>
                    {(user?.rol === "admin_primario" || c.usuarioId === user?.id) && (
                      <button
                        type="button"
                        onClick={() => borrarContacto(c)}
                        className="p-1 rounded hover:bg-secondary"
                        aria-label="Borrar seguimiento"
                        title="Borrar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Órdenes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Órdenes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suyas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin órdenes{user?.rol === "vendedor" ? " tuyas" : ""} con este cliente.</p>
          ) : (
            <ul className="divide-y divide-border">
              {suyas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <button type="button" onClick={() => navigate(`/ordenes/${o.id}`)} className="text-left min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium hover:text-primary">{o.numero}</span>
                      <StatusBadge status={o.estado} size="sm" />
                      <span className="text-xs text-muted-foreground">{o.estadoNombre}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {formatFecha(o.fechaCreacion)} ·{" "}
                      {o.productos
                        .map((p) => `${p.cantidad} × ${p.nombre}${p.talla ? ` ${p.talla}` : ""}`)
                        .join(", ")}
                    </p>
                  </button>
                  <span className="font-semibold">{formatMonto(o.total)}</span>
                  {puedeCrearOrden && o.estadoNombre !== "Cancelada" && (
                    <Button size="sm" variant="outline" onClick={() => abrirRepetir(o)}>
                      <Repeat className="w-4 h-4" />
                      Repetir pedido
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {contactar && cliente && (
        <ContactarClienteDialog
          open={contactar}
          onClose={() => setContactar(false)}
          cliente={nombre}
          telefono={cliente.telefono ?? undefined}
          email={cliente.email ?? undefined}
          plantillas={plantillasRecontacto(
            { razonSocial: nombre, ultimaCompra: resumen?.ultimaCompra },
            user?.nombre ?? "",
            hist.productos[0]
          )}
          folio={nombre}
          onEnviado={(_tipo, canal) => {
            setContactar(false);
            if (puedeRegistrar) setRegistrar({ canal });
          }}
        />
      )}

      <RegistrarContactoDialog
        cliente={registrar && cliente ? { id: cliente.id, nombre } : null}
        canalInicial={registrar?.canal}
        onClose={() => setRegistrar(null)}
        onGuardado={() => {
          setRegistrar(null);
          void cargarSeguimiento();
        }}
      />

      <NuevaOrdenMultiProducto
        isOpen={!!repetir}
        onClose={() => setRepetir(null)}
        onSubmit={guardarOrden}
        inicial={repetir}
        titulo="Repetir pedido"
      />
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold mt-1">{valor}</p>
      {pie && <p className="text-xs text-muted-foreground mt-1">{pie}</p>}
    </div>
  );
}
