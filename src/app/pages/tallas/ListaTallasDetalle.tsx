/**
 * ListaTallasDetalle.tsx — Una lista de tallas del cliente (ruta /tallas/:id).
 *
 *  - Enlace para el cliente: copiar o mandarlo por WhatsApp con el mensaje armado.
 *  - Concentrado: piezas por prenda y talla (lo que va a la orden), y quién no eligió.
 *  - Respuestas: una fila por persona; el vendedor puede capturar, corregir o borrar.
 *  - Crear orden: abre el formulario con una partida por prenda y talla. Al guardarla,
 *    la lista queda ligada a la orden y se cierra (ya no acepta respuestas).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  Lock,
  LockOpen,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/Card";
import { Button } from "../../components/ui/button";
import NuevaOrdenMultiProducto from "../../components/NuevaOrdenMultiProducto";
import ListaTallasDialog from "../../components/tallas/ListaTallasDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useAuth } from "../../context/AuthContext";
import { useErpData } from "../../context/ErpDataContext";
import type { Orden } from "../../data/mockData";
import { hasPermission } from "../../utils/permissions";
import { copiarTexto } from "../../lib/contacto";
import { formatFecha, hoyISO } from "../../lib/fechas";
import {
  actualizarLista,
  capturaDesdeLista,
  cargarLista,
  cargarRespuestas,
  concentrado,
  eliminarLista,
  eliminarRespuesta,
  enlaceTallas,
  guardarRespuesta,
  mensajeInvitacion,
  type ListaTallas,
  type RespuestaTallas,
} from "../../lib/listasTallas";

export default function ListaTallasDetalle() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { crearOrden } = useErpData();
  const [lista, setLista] = useState<ListaTallas | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaTallas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [capturando, setCapturando] = useState<RespuestaTallas | "nueva" | null>(null);
  const [creandoOrden, setCreandoOrden] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [l, r] = await Promise.all([cargarLista(id), cargarRespuestas(id)]);
      setLista(l);
      setRespuestas(r);
    } catch (e) {
      toast.error("No se pudo cargar la lista", { description: (e as Error).message });
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => (lista ? concentrado(lista, respuestas) : []), [lista, respuestas]);
  const captura = useMemo(() => (creandoOrden && lista ? capturaDesdeLista(lista, respuestas) : null), [creandoOrden, lista, respuestas]);
  // Datos del formulario de edición (memorizados: un objeto nuevo reiniciaría lo que se escribe).
  const inicialEdicion = useMemo(
    () =>
      lista
        ? {
            clienteNombre: lista.clienteNombre,
            titulo: lista.titulo,
            instrucciones: lista.instrucciones ?? "",
            cierra: lista.cierra ?? "",
            productos: lista.productos,
          }
        : undefined,
    [lista]
  );

  if (cargando) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  if (!lista) {
    return (
      <div className="p-6 text-center space-y-3">
        <h2>Lista no encontrada</h2>
        <Link to="/tallas" className="text-primary hover:underline">
          Volver a las listas
        </Link>
      </div>
    );
  }

  // Edita el dueño de la lista o el admin primario (la BD aplica lo mismo).
  const puedeEditar = user?.rol === "admin_primario" || lista.vendedorId === user?.id;
  const puedeCrearOrden = puedeEditar && !!user && hasPermission(user.rol, "/ordenes", "canCreate") && !lista.ordenId;
  const enlace = enlaceTallas(lista.token);
  const vencida = !!lista.cierra && lista.cierra < hoyISO();
  const piezas = resumen.reduce((s, c) => s + c.total, 0);

  const cambiarEstado = async () => {
    try {
      await actualizarLista(lista.id, { estado: lista.estado === "abierta" ? "cerrada" : "abierta" });
      await cargar();
    } catch (e) {
      toast.error("No se pudo cambiar la lista", { description: (e as Error).message });
    }
  };

  const borrarLista = async () => {
    if (!window.confirm(`¿Borrar la lista "${lista.titulo}" con sus ${respuestas.length} respuestas?`)) return;
    try {
      await eliminarLista(lista.id);
      toast.success("Lista borrada");
      navigate("/tallas");
    } catch (e) {
      toast.error("No se pudo borrar", { description: (e as Error).message });
    }
  };

  const borrarRespuesta = async (r: RespuestaTallas) => {
    if (!window.confirm(`¿Quitar a ${r.nombre} de la lista?`)) return;
    try {
      await eliminarRespuesta(r.id);
      await cargar();
    } catch (e) {
      toast.error("No se pudo quitar", { description: (e as Error).message });
    }
  };

  const guardarOrden = async (orden: Orden): Promise<boolean> => {
    try {
      const { id: ordenId, folio } = await crearOrden(orden);
      try {
        await actualizarLista(lista.id, { estado: "cerrada", ordenId });
      } catch {
        // La orden ya quedó; ligarla a la lista es secundario.
      }
      toast.success("Orden creada", { description: `${folio} - ${orden.cliente}` });
      setCreandoOrden(false);
      navigate(`/ordenes/${ordenId}`);
      return true;
    } catch (e) {
      toast.error("No se pudo crear la orden", { description: (e as Error)?.message, duration: 10000 });
      return false;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/tallas" className="p-2 hover:bg-secondary rounded-lg transition-colors" aria-label="Volver">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="truncate">{lista.titulo}</h1>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                lista.estado === "abierta" && !vencida
                  ? "bg-status-completed-bg text-status-completed-text"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {lista.estado === "cerrada" ? "Cerrada" : vencida ? "Fecha límite vencida" : "Abierta"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            {lista.clienteNombre}
            {lista.cierra && ` · límite ${formatFecha(lista.cierra)}`}
            {lista.vendedor && user?.rol !== "vendedor" && ` · ${lista.vendedor}`}
          </p>
        </div>
        {puedeCrearOrden && (
          <Button onClick={() => setCreandoOrden(true)} disabled={piezas === 0}>
            <ClipboardList className="w-4 h-4" />
            Crear orden ({piezas} pzs)
          </Button>
        )}
        {lista.ordenId && (
          <Button variant="outline" onClick={() => navigate(`/ordenes/${lista.ordenId}`)}>
            <ClipboardList className="w-4 h-4" />
            Ver orden {lista.ordenFolio ?? ""}
          </Button>
        )}
        {puedeEditar && (
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={cambiarEstado}>
              {lista.estado === "abierta" ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
              {lista.estado === "abierta" ? "Cerrar" : "Reabrir"}
            </Button>
          </>
        )}
      </div>

      {lista.estado === "abierta" && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Enlace para el cliente</p>
              <p className="text-xs text-muted-foreground break-all">{enlace}</p>
            </div>
            <Button variant="outline" onClick={() => copiarTexto(enlace, "Enlace")}>
              <Copy className="w-4 h-4" /> Copiar
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(`https://wa.me/?text=${encodeURIComponent(mensajeInvitacion(lista, user?.nombre ?? ""))}`, "_blank", "noopener")
              }
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Concentrado ({piezas} piezas)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {resumen.map((c) => (
            <div key={c.producto.clave}>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="font-medium">
                  {c.producto.nombre}
                  {c.producto.color && <span className="text-muted-foreground font-normal"> · {c.producto.color}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {c.total} pzs{c.sinTalla > 0 && ` · ${c.sinTalla} sin elegir`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.porTalla.map((x) => (
                  <div
                    key={x.talla}
                    className={`min-w-14 text-center rounded-lg border px-2 py-1 ${x.piezas ? "border-primary/40 bg-primary/5" : "border-border opacity-60"}`}
                  >
                    <p className="text-xs text-muted-foreground">{x.talla}</p>
                    <p className="font-semibold">{x.piezas}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Respuestas ({respuestas.length})
            </CardTitle>
            {puedeEditar && !lista.ordenId && (
              <Button variant="outline" size="sm" onClick={() => setCapturando("nueva")}>
                <Plus className="w-4 h-4" /> Capturar persona
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {respuestas.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aún no responde nadie. Manda el enlace al contacto del cliente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Área</th>
                    {lista.productos.map((p) => (
                      <th key={p.clave} className="px-4 py-2 font-medium whitespace-nowrap">
                        {p.nombre}
                      </th>
                    ))}
                    <th className="px-4 py-2 font-medium">Comentarios</th>
                    {puedeEditar && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {respuestas.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium whitespace-nowrap">{r.nombre}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.area ?? "—"}</td>
                      {lista.productos.map((p) => (
                        <td key={p.clave} className="px-4 py-2">
                          {r.tallas[p.clave] ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-muted-foreground">{r.notas ?? ""}</td>
                      {puedeEditar && (
                        <td className="px-4 py-2 whitespace-nowrap text-right">
                          <button onClick={() => setCapturando(r)} className="p-1.5 rounded hover:bg-secondary" aria-label={`Editar a ${r.nombre}`}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => void borrarRespuesta(r)}
                            className="p-1.5 rounded hover:bg-secondary text-red-600 dark:text-red-400"
                            aria-label={`Quitar a ${r.nombre}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {puedeEditar && (
        <div>
          <button onClick={borrarLista} className="text-sm text-red-600 dark:text-red-400 hover:underline">
            Borrar esta lista
          </button>
        </div>
      )}

      <ListaTallasDialog
        open={editando}
        onClose={() => setEditando(false)}
        inicial={inicialEdicion}
        onGuardar={async (l) => {
          try {
            await actualizarLista(lista.id, l);
            toast.success("Lista actualizada");
            await cargar();
            return true;
          } catch (e) {
            toast.error("No se pudo guardar", { description: (e as Error).message });
            return false;
          }
        }}
      />

      {capturando && (
        <CapturaManualDialog
          lista={lista}
          respuesta={capturando === "nueva" ? null : capturando}
          onClose={() => setCapturando(null)}
          onGuardada={async () => {
            setCapturando(null);
            await cargar();
          }}
        />
      )}

      {puedeCrearOrden && (
        <NuevaOrdenMultiProducto
          isOpen={creandoOrden}
          onClose={() => setCreandoOrden(false)}
          onSubmit={guardarOrden}
          inicial={captura}
          titulo={`Orden con tallas — ${lista.clienteNombre}`}
        />
      )}
    </div>
  );
}

/** El vendedor captura (o corrige) las tallas de una persona. */
function CapturaManualDialog({
  lista,
  respuesta,
  onClose,
  onGuardada,
}: {
  lista: ListaTallas;
  respuesta: RespuestaTallas | null;
  onClose: () => void;
  onGuardada: () => void | Promise<void>;
}) {
  const [nombre, setNombre] = useState(respuesta?.nombre ?? "");
  const [area, setArea] = useState(respuesta?.area ?? "");
  const [notas, setNotas] = useState(respuesta?.notas ?? "");
  const [tallas, setTallas] = useState<Record<string, string>>(respuesta?.tallas ?? {});
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      toast.error("Escribe el nombre");
      return;
    }
    if (!Object.values(tallas).some(Boolean)) {
      toast.error("Elige al menos una talla");
      return;
    }
    setGuardando(true);
    try {
      await guardarRespuesta(lista.id, { nombre, area, tallas, notas }, respuesta?.id);
      await onGuardada();
    } catch (err) {
      toast.error("No se pudo guardar", { description: (err as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const claseCampo =
    "w-full px-3 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{respuesta ? "Corregir tallas" : "Capturar persona"}</DialogTitle>
          <DialogDescription>{lista.titulo}</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="cm-nombre">
                Nombre *
              </label>
              <input id="cm-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseCampo} maxLength={120} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="cm-area">
                Área
              </label>
              <input id="cm-area" value={area} onChange={(e) => setArea(e.target.value)} className={claseCampo} maxLength={120} />
            </div>
          </div>
          {lista.productos.map((p) => (
            <div key={p.clave}>
              <label className="block text-sm font-medium mb-1" htmlFor={`cm-${p.clave}`}>
                {p.nombre}
                {p.color && <span className="text-muted-foreground font-normal"> · {p.color}</span>}
              </label>
              <select
                id={`cm-${p.clave}`}
                value={tallas[p.clave] ?? ""}
                onChange={(e) => setTallas({ ...tallas, [p.clave]: e.target.value })}
                className={claseCampo}
              >
                <option value="">No la usa</option>
                {p.tallas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="cm-notas">
              Comentarios
            </label>
            <input id="cm-notas" value={notas} onChange={(e) => setNotas(e.target.value)} className={claseCampo} maxLength={300} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
