/**
 * Autorizaciones.tsx — Excepciones a las políticas de venta (ruta /autorizaciones).
 *
 * Cuando el tope de descuento o el crédito del cliente bloquean una orden, el vendedor la
 * manda desde el formulario ("Solicitar autorización"). Aquí:
 *  - Administrador primario: ve las pendientes y las aprueba (puede ajustar el descuento,
 *    el saldo y la vigencia) o las rechaza con un motivo. Las demás, de consulta.
 *  - Vendedor / admin secundario: ve las suyas; con una aprobada y vigente, "Crear orden"
 *    abre el formulario con lo que capturó, y la BD deja pasar la orden. También puede
 *    retirar una solicitud.
 * Las notificaciones van y vienen solas (sql/autorizaciones_venta.sql).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, ShieldCheck, ShieldQuestion, Undo2, XCircle } from "lucide-react";
import { Card, CardContent } from "../components/Card";
import StatCard from "../components/StatCard";
import NuevaOrdenMultiProducto from "../components/NuevaOrdenMultiProducto";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import type { Orden } from "../data/mockData";
import {
  ESTADO_AUTORIZACION,
  cancelarAutorizacion,
  cargarAutorizaciones,
  estadoVisible,
  resolverAutorizacion,
  type AutorizacionVenta,
} from "../lib/autorizacionesVenta";
import { formatFecha } from "../lib/fechas";
import { formatMonto } from "../lib/pagos";

type Pestana = "pendientes" | "aprobadas" | "historial";

const claseCampo =
  "w-full px-3 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

export default function Autorizaciones() {
  const { user } = useAuth();
  const { crearOrden } = useErpData();
  const navigate = useNavigate();
  const esPrimario = user?.rol === "admin_primario";

  const [lista, setLista] = useState<AutorizacionVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("pendientes");
  const [resolviendo, setResolviendo] = useState<{ a: AutorizacionVenta; aprobar: boolean } | null>(null);
  const [creando, setCreando] = useState<AutorizacionVenta | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await cargarAutorizaciones());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const pendientes = lista.filter((a) => a.estado === "pendiente");
    const aprobadas = lista.filter((a) => estadoVisible(a) === "aprobada");
    const historial = lista.filter((a) => a.estado !== "pendiente" && estadoVisible(a) !== "aprobada");
    return { pendientes, aprobadas, historial };
  }, [lista]);
  const visibles = grupos[pestana];

  const retirar = async (a: AutorizacionVenta) => {
    if (!window.confirm(`¿Retirar la solicitud de ${a.clienteNombre}?`)) return;
    try {
      await cancelarAutorizacion(a.id);
      toast.success("Solicitud retirada");
      await cargar();
    } catch (e) {
      toast.error("No se pudo retirar", { description: (e as Error).message });
    }
  };

  const guardarOrden = async (orden: Orden): Promise<boolean> => {
    try {
      const { id, folio } = await crearOrden(orden);
      toast.success("Orden creada con autorización", { description: `${folio} - ${orden.cliente}` });
      setCreando(null);
      await cargar();
      navigate(`/ordenes/${id}`);
      return true;
    } catch (e) {
      toast.error("No se pudo crear la orden", {
        description: (e as Error)?.message,
        duration: 10000,
      });
      return false;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Autorizaciones de venta</h1>
        <p className="text-muted-foreground mt-1">
          {esPrimario
            ? "Órdenes que el descuento máximo o el crédito del cliente bloquearon y esperan tu visto bueno"
            : "Tus solicitudes al administrador para órdenes con descuento o crédito fuera de política"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Pendientes" value={grupos.pendientes.length} icon={ShieldQuestion} />
        <StatCard title="Aprobadas sin usar" value={grupos.aprobadas.length} icon={ShieldCheck} />
        <StatCard title="Resueltas" value={grupos.historial.length} icon={ClipboardList} />
      </div>

      <div className="flex gap-2 border-b border-border" role="tablist">
        {(
          [
            ["pendientes", "Pendientes"],
            ["aprobadas", "Aprobadas"],
            ["historial", "Historial"],
          ] as [Pestana, string][]
        ).map(([clave, titulo]) => (
          <button
            key={clave}
            role="tab"
            aria-selected={pestana === clave}
            onClick={() => setPestana(clave)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pestana === clave ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {titulo} ({grupos[clave].length})
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          No se pudieron cargar las autorizaciones: {error}. ¿Ya se aplicó sql/autorizaciones_venta.sql?
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground text-sm">
            {pestana === "pendientes"
              ? esPrimario
                ? "No hay solicitudes por resolver."
                : "No tienes solicitudes pendientes. Se piden desde el formulario de orden cuando una política la bloquea."
              : pestana === "aprobadas"
              ? "No hay autorizaciones aprobadas sin usar."
              : "Aún no hay solicitudes resueltas."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibles.map((a) => (
            <TarjetaAutorizacion
              key={a.id}
              a={a}
              esPrimario={esPrimario}
              esMia={a.solicitanteId === user?.id}
              onAprobar={() => setResolviendo({ a, aprobar: true })}
              onRechazar={() => setResolviendo({ a, aprobar: false })}
              onCrear={() => setCreando(a)}
              onRetirar={() => void retirar(a)}
            />
          ))}
        </div>
      )}

      {resolviendo && (
        <ResolverDialog
          a={resolviendo.a}
          aprobar={resolviendo.aprobar}
          onClose={() => setResolviendo(null)}
          onHecho={async () => {
            setResolviendo(null);
            await cargar();
          }}
        />
      )}

      <NuevaOrdenMultiProducto
        isOpen={!!creando}
        onClose={() => setCreando(null)}
        onSubmit={guardarOrden}
        inicial={creando?.captura ?? null}
        titulo={creando ? `Orden autorizada — ${creando.clienteNombre}` : undefined}
      />
    </div>
  );
}

function TarjetaAutorizacion({
  a,
  esPrimario,
  esMia,
  onAprobar,
  onRechazar,
  onCrear,
  onRetirar,
}: {
  a: AutorizacionVenta;
  esPrimario: boolean;
  esMia: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
  onCrear: () => void;
  onRetirar: () => void;
}) {
  const ev = estadoVisible(a);
  const info = ESTADO_AUTORIZACION[ev];
  const productos = a.captura?.productos ?? [];
  const piezas = productos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{a.clienteNombre}</h3>
            <p className="text-xs text-muted-foreground">
              {a.solicitante ?? "Vendedor"} · {new Date(a.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${info.clase}`}>{info.texto}</span>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-medium">{a.total != null ? formatMonto(a.total) : "—"}</dd>
          </div>
          {a.descuento != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Descuento</dt>
              <dd className="font-medium">
                {formatMonto(a.descuento)}
                {a.subtotal ? <span className="text-xs text-muted-foreground"> ({Math.round((a.descuento / a.subtotal) * 1000) / 10} %)</span> : null}
              </dd>
            </div>
          )}
          {a.saldo != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Saldo a crédito</dt>
              <dd className="font-medium">{formatMonto(a.saldo)}</dd>
            </div>
          )}
        </dl>

        <p className="text-xs text-muted-foreground">
          {piezas} pieza(s):{" "}
          {productos
            .slice(0, 4)
            .map((p) => `${p.cantidad} × ${p.nombre || "producto"}${p.talla ? ` ${p.talla}` : ""}`)
            .join(", ")}
          {productos.length > 4 && ` y ${productos.length - 4} más`}
        </p>

        {a.motivoBloqueo && (
          <p className="text-xs rounded-lg bg-secondary px-3 py-2">
            <span className="font-medium">Política: </span>
            {a.motivoBloqueo}
          </p>
        )}
        <p className="text-sm">
          <span className="font-medium">Motivo del vendedor: </span>
          {a.justificacion}
        </p>

        {a.estado !== "pendiente" && a.estado !== "cancelada" && (
          <p className="text-xs text-muted-foreground">
            {a.estado === "aprobada" ? "Aprobada" : "Rechazada"} por {a.resueltaPor ?? "el administrador"}
            {a.resueltaAt && ` el ${new Date(a.resueltaAt).toLocaleDateString("es-MX")}`}
            {a.estado === "aprobada" && a.vence && ` · vigente hasta el ${formatFecha(a.vence)}`}
            {a.comentario && ` · «${a.comentario}»`}
          </p>
        )}
        {a.ordenId && (
          <p className="text-sm">
            Orden:{" "}
            <Link to={`/ordenes/${a.ordenId}`} className="text-primary hover:underline">
              {a.ordenFolio ?? "ver orden"}
            </Link>
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {esPrimario && a.estado === "pendiente" && (
            <>
              <button
                onClick={onAprobar}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Aprobar
              </button>
              <button
                onClick={onRechazar}
                className="flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm"
              >
                <XCircle className="w-4 h-4" /> Rechazar
              </button>
            </>
          )}
          {esMia && ev === "aprobada" && (
            <button
              onClick={onCrear}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
            >
              <ClipboardList className="w-4 h-4" /> Crear orden
            </button>
          )}
          {esMia && (a.estado === "pendiente" || ev === "aprobada") && (
            <button
              onClick={onRetirar}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm"
            >
              <Undo2 className="w-4 h-4" /> Retirar
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResolverDialog({
  a,
  aprobar,
  onClose,
  onHecho,
}: {
  a: AutorizacionVenta;
  aprobar: boolean;
  onClose: () => void;
  onHecho: () => void | Promise<void>;
}) {
  const [descuento, setDescuento] = useState(a.descuento ?? 0);
  const [saldo, setSaldo] = useState(a.saldo ?? 0);
  const [dias, setDias] = useState(7);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aprobar && comentario.trim().length < 3) {
      toast.error("Escribe el motivo del rechazo");
      return;
    }
    setEnviando(true);
    try {
      await resolverAutorizacion(a.id, aprobar, {
        comentario,
        descuento: a.descuento != null ? descuento : undefined,
        saldo: a.saldo != null ? saldo : undefined,
        diasVigencia: dias,
      });
      toast.success(aprobar ? "Autorización aprobada" : "Solicitud rechazada", {
        description: `Se le avisó a ${a.solicitante ?? "el vendedor"}.`,
      });
      await onHecho();
    } catch (err) {
      toast.error("No se pudo guardar", { description: (err as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{aprobar ? "Aprobar excepción" : "Rechazar solicitud"}</DialogTitle>
          <DialogDescription>
            {a.clienteNombre} · {a.solicitante ?? "Vendedor"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {aprobar && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {a.descuento != null && (
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="aut-descuento">
                      Descuento hasta
                    </label>
                    <input
                      id="aut-descuento"
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={descuento}
                      onChange={(e) => setDescuento(parseFloat(e.target.value) || 0)}
                      className={claseCampo}
                    />
                  </div>
                )}
                {a.saldo != null && (
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="aut-saldo">
                      Saldo a crédito hasta
                    </label>
                    <input
                      id="aut-saldo"
                      type="number"
                      min={0}
                      step={0.01}
                      value={saldo}
                      onChange={(e) => setSaldo(parseFloat(e.target.value) || 0)}
                      className={claseCampo}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="aut-dias">
                  Vigencia
                </label>
                <select id="aut-dias" value={dias} onChange={(e) => setDias(Number(e.target.value))} className={claseCampo}>
                  {[1, 3, 7, 15, 30].map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? "1 día" : `${d} días`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Sirve para una sola orden de este vendedor con este cliente.
                </p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="aut-comentario">
              {aprobar ? "Nota para el vendedor (opcional)" : "Motivo del rechazo *"}
            </label>
            <textarea
              id="aut-comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              maxLength={500}
              required={!aprobar}
              className={claseCampo}
              placeholder={aprobar ? "Ej: Que deje 30 % de anticipo." : "Ej: Primero que liquide la orden anterior."}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={enviando} className="px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className={`px-4 py-2 rounded-lg text-sm disabled:opacity-50 ${
                aprobar ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {enviando ? "Guardando…" : aprobar ? "Aprobar" : "Rechazar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
