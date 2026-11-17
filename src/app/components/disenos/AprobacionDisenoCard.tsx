/**
 * AprobacionDisenoCard.tsx — Sección "Aprobación del diseño" del detalle de la orden.
 *
 * Por cada producto que pasa por Diseño: última versión del boceto, su estado y la
 * respuesta del cliente, con el historial de versiones. Acciones:
 *  - Diseñador / admin primario: subir versión nueva.
 *  - Quien puede editar la orden (vendedor dueño, admin primario): enviar al cliente
 *    (WhatsApp/correo con enlace de 7 días, u hoja de aprobación impresa) y registrar
 *    su respuesta (aprobado, o cambios solicitados).
 */
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, History, Palette, Send, Upload, XCircle } from "lucide-react";
import type { Orden, ProductoOrden } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import ContactarClienteDialog from "../ContactarClienteDialog";
import BocetoMiniatura from "./BocetoMiniatura";
import SubirBocetoDialog from "./SubirBocetoDialog";
import { detallePartida, type PlantillaMensaje } from "../../lib/notaOrden";
import { NOMBRE_EMPRESA } from "../../lib/documentoVenta";
import { fechaISO, formatFecha, hoyISO } from "../../lib/fechas";
import { tiempoRelativo } from "../../lib/notificaciones";
import {
  CANALES,
  ESTADO_PROPUESTA,
  enlaceArchivo,
  esPdf,
  imprimirHojaAprobacion,
  marcarEnviada,
  responderPropuesta,
  textoRespuesta,
  usePropuestasDiseno,
  type CanalRespuesta,
  type PropuestaDiseno,
} from "../../lib/disenos";

interface Envio {
  propuesta: PropuestaDiseno;
  producto: ProductoOrden;
  url: string;
}

function plantillasEnvio(orden: Orden, producto: ProductoOrden, p: PropuestaDiseno, url: string): PlantillaMensaje[] {
  const det = detallePartida(producto);
  const firma = `Quedamos a sus órdenes.\n${orden.vendedor}\n${NOMBRE_EMPRESA}`;
  return [
    {
      tipo: "boceto",
      titulo: "Boceto para aprobación",
      texto: [
        `Hola, buen día. Le saludamos de ${NOMBRE_EMPRESA}.`,
        "",
        `Le compartimos el diseño de su pedido ${orden.numero} para su revisión:`,
        `• ${producto.cantidad} × ${producto.nombre}${det ? ` (${det})` : ""}${p.version > 1 ? ` — versión ${p.version}` : ""}`,
        "",
        `Ver diseño: ${url}`,
        "(el enlace está disponible 7 días)",
        "",
        "Por favor revise colores, logotipo, textos y ubicación. Si está de acuerdo, respóndanos «Aprobado» con su nombre para pasarlo a producción; si necesita algún ajuste, indíquenos qué cambiar.",
        "",
        firma,
      ].join("\n"),
    },
  ];
}

export default function AprobacionDisenoCard({ orden, puedeEditar }: { orden: Orden; puedeEditar: boolean }) {
  const { user } = useAuth();
  const productos = (orden.productos ?? []).filter((p) => p.talleres.includes("diseno"));
  const { porDetalle, disponible, recargar } = usePropuestasDiseno(orden.id, productos.length > 0);
  const puedeSubir = user?.rol === "admin_primario" || user?.rol === "disenador";

  const [subiendo, setSubiendo] = useState<{ producto: ProductoOrden; ultima?: PropuestaDiseno } | null>(null);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [respondiendo, setRespondiendo] = useState<{ propuesta: PropuestaDiseno; producto: ProductoOrden } | null>(null);
  const [historial, setHistorial] = useState<Set<string>>(new Set());

  if (productos.length === 0 || !disponible) return null;

  const abrirEnvio = async (propuesta: PropuestaDiseno, producto: ProductoOrden) => {
    try {
      const url = await enlaceArchivo(propuesta.archivoPath);
      setEnvio({ propuesta, producto, url });
    } catch (err: any) {
      toast.error("No se pudo generar el enlace del boceto", { description: err?.message });
    }
  };

  const hojaAprobacion = (e: Envio) =>
    imprimirHojaAprobacion({
      folio: orden.numero,
      cliente: orden.cliente,
      producto: e.producto.nombre,
      cantidad: e.producto.cantidad,
      detalle: detallePartida(e.producto),
      version: e.propuesta.version,
      urlArchivo: e.url,
      pdf: esPdf(e.propuesta),
      notas: e.propuesta.notas,
      vendedor: orden.vendedor,
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" /> Aprobación del diseño
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {productos.map((producto) => {
          const versiones = porDetalle.get(producto.id) ?? [];
          const ultima = versiones[0];
          const pendiente = ultima && (ultima.estado === "por_enviar" || ultima.estado === "enviada");
          const verHistorial = historial.has(producto.id);
          return (
            <div key={producto.id} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-start gap-4">
                {ultima ? (
                  <BocetoMiniatura propuesta={ultima} className="h-24 w-24" />
                ) : (
                  <div className="h-24 w-24 shrink-0 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground text-center p-2">
                    Sin boceto
                  </div>
                )}
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <p className="font-medium">
                    {producto.cantidad} × {producto.nombre}
                  </p>
                  {ultima ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PROPUESTA[ultima.estado].clase}`}>
                          {ESTADO_PROPUESTA[ultima.estado].texto}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Versión {ultima.version} · subida {tiempoRelativo(ultima.subidaAt)}
                          {ultima.enviadaAt && ultima.estado === "enviada" && ` · enviada ${tiempoRelativo(ultima.enviadaAt)}`}
                        </span>
                      </div>
                      {textoRespuesta(ultima) && <p className="text-sm">{textoRespuesta(ultima)}</p>}
                      {ultima.respuestaComentarios && (
                        <p className="text-sm text-muted-foreground whitespace-pre-line">“{ultima.respuestaComentarios}”</p>
                      )}
                      {ultima.notas && <p className="text-xs text-muted-foreground">Notas de Diseño: {ultima.notas}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Diseño aún no sube el boceto. Producción no avanza de Diseño sin la aprobación del cliente.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {puedeEditar && pendiente && (
                    <>
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => abrirEnvio(ultima, producto)}>
                        <Send className="w-4 h-4" /> {ultima.estado === "enviada" ? "Reenviar" : "Enviar al cliente"}
                      </Button>
                      <Button size="sm" className="gap-2" onClick={() => setRespondiendo({ propuesta: ultima, producto })}>
                        <CheckCircle2 className="w-4 h-4" /> Registrar respuesta
                      </Button>
                    </>
                  )}
                  {puedeSubir && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setSubiendo({ producto, ultima })}>
                      <Upload className="w-4 h-4" /> {ultima ? "Nueva versión" : "Subir boceto"}
                    </Button>
                  )}
                  {versiones.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-2"
                      onClick={() =>
                        setHistorial((prev) => {
                          const s = new Set(prev);
                          if (s.has(producto.id)) s.delete(producto.id);
                          else s.add(producto.id);
                          return s;
                        })
                      }
                    >
                      <History className="w-4 h-4" /> {verHistorial ? "Ocultar" : `${versiones.length - 1} anterior(es)`}
                    </Button>
                  )}
                </div>
              </div>
              {verHistorial && (
                <div className="space-y-2 border-t border-border pt-3">
                  {versiones.slice(1).map((v) => (
                    <div key={v.id} className="flex items-start gap-3">
                      <BocetoMiniatura propuesta={v} className="h-14 w-14" />
                      <div className="text-sm">
                        <p>
                          Versión {v.version} ·{" "}
                          <span className="text-muted-foreground">{ESTADO_PROPUESTA[v.estado].texto}</span>
                        </p>
                        {textoRespuesta(v) && <p className="text-xs text-muted-foreground">{textoRespuesta(v)}</p>}
                        {v.respuestaComentarios && <p className="text-xs text-muted-foreground">“{v.respuestaComentarios}”</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <SubirBocetoDialog
        destino={
          subiendo
            ? {
                ordenId: orden.id,
                detalleId: subiendo.producto.id,
                titulo: `${orden.numero} · ${subiendo.producto.cantidad} × ${subiendo.producto.nombre}`,
                versionNueva: (subiendo.ultima?.version ?? 0) + 1,
                cambiosPedidos: subiendo.ultima?.estado === "rechazada" ? subiendo.ultima.respuestaComentarios : null,
              }
            : null
        }
        onClose={() => setSubiendo(null)}
        onSubido={() => {
          setSubiendo(null);
          recargar();
        }}
      />

      {envio && (
        <ContactarClienteDialog
          open={!!envio}
          onClose={() => setEnvio(null)}
          cliente={orden.cliente}
          telefono={orden.clienteTelefono}
          email={orden.clienteEmail}
          plantillas={plantillasEnvio(orden, envio.producto, envio.propuesta, envio.url)}
          folio={`Diseño ${orden.numero}`}
          onGuardarPdf={() => hojaAprobacion(envio)}
          textoPdf="Hoja de aprobación (imprimir)"
          onEnviado={() => {
            marcarEnviada(envio.propuesta.id, "mensaje")
              .then(recargar)
              .catch((err) => toast.error("No se pudo marcar como enviado", { description: err?.message }));
          }}
        />
      )}

      <RespuestaDialog
        datos={respondiendo}
        clienteDefecto={orden.cliente}
        onClose={() => setRespondiendo(null)}
        onGuardado={() => {
          setRespondiendo(null);
          recargar();
        }}
      />
    </Card>
  );
}

/** Registrar lo que respondió el cliente sobre una versión del boceto. */
function RespuestaDialog({
  datos,
  clienteDefecto,
  onClose,
  onGuardado,
}: {
  datos: { propuesta: PropuestaDiseno; producto: ProductoOrden } | null;
  clienteDefecto: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [aprobada, setAprobada] = useState(true);
  const [quien, setQuien] = useState("");
  const [canal, setCanal] = useState<CanalRespuesta>("whatsapp");
  const [fecha, setFecha] = useState(hoyISO());
  const [comentarios, setComentarios] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre para otra propuesta.
  if (datos && abiertoPara !== datos.propuesta.id) {
    setAbiertoPara(datos.propuesta.id);
    setAprobada(true);
    setQuien("");
    setCanal("whatsapp");
    setFecha(hoyISO());
    setComentarios("");
  }

  // Día (hora local) en que se subió el boceto: la respuesta no puede ser anterior.
  const minimo = datos ? fechaISO(new Date(datos.propuesta.subidaAt)) : undefined;
  const error = aprobada && !quien.trim()
    ? "Indica quién aprobó por parte del cliente."
    : !aprobada && !comentarios.trim()
    ? "Describe los cambios que pidió el cliente."
    : !fecha
    ? "Indica la fecha."
    : null;

  const guardar = async () => {
    if (!datos || error) return;
    setGuardando(true);
    try {
      await responderPropuesta(datos.propuesta.id, { aprobada, quien, canal, fecha, comentarios });
      toast.success(aprobada ? "Diseño aprobado" : "Cambios registrados", {
        description: aprobada ? "Diseño ya puede terminar este producto." : "Se avisó a Diseño para que suba una versión nueva.",
      });
      onGuardado();
    } catch (err: any) {
      toast.error("No se pudo registrar la respuesta", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!datos} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respuesta del cliente · versión {datos?.propuesta.version}</DialogTitle>
          <DialogDescription>
            {datos && `${datos.producto.cantidad} × ${datos.producto.nombre}. Queda registrado con fecha como constancia.`}
          </DialogDescription>
        </DialogHeader>
        {datos && (
          <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <BocetoMiniatura propuesta={datos.propuesta} className="h-20 w-20" />
              <div className="flex flex-1 gap-2">
                <Button
                  type="button"
                  variant={aprobada ? "default" : "outline"}
                  className="flex-1 gap-2"
                  onClick={() => setAprobada(true)}
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprobó
                </Button>
                <Button
                  type="button"
                  variant={!aprobada ? "destructive" : "outline"}
                  className="flex-1 gap-2"
                  onClick={() => setAprobada(false)}
                >
                  <XCircle className="w-4 h-4" /> Pidió cambios
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="resp-quien">{aprobada ? "¿Quién aprobó?" : "¿Quién respondió? (opcional)"}</Label>
                <Input
                  id="resp-quien"
                  value={quien}
                  maxLength={120}
                  onChange={(e) => setQuien(e.target.value)}
                  placeholder={`Nombre (de ${clienteDefecto})`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resp-fecha">Fecha</Label>
                <Input id="resp-fecha" type="date" value={fecha} min={minimo} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp-canal">¿Por qué medio?</Label>
              <select
                id="resp-canal"
                value={canal}
                onChange={(e) => setCanal(e.target.value as CanalRespuesta)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {CANALES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.texto}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp-comentarios">{aprobada ? "Comentarios (opcional)" : "Cambios que pidió"}</Label>
              <textarea
                id="resp-comentarios"
                value={comentarios}
                maxLength={2000}
                rows={3}
                onChange={(e) => setComentarios(e.target.value)}
                placeholder={aprobada ? "Aprobó por WhatsApp a las 10:30…" : "Logo 2 cm más grande, cambiar azul por marino…"}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {error && <p className="text-sm text-muted-foreground">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Subido el {formatFecha(minimo)}. Si el cliente aprobó por WhatsApp, conserva el
              chat como respaldo.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!!error || guardando}>
            {guardando ? "Guardando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
