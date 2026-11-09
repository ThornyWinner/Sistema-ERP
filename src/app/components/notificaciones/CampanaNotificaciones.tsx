/**
 * CampanaNotificaciones.tsx — Campana del Header con las notificaciones entre usuarios.
 *
 *  - El número rojo indica cuántas notificaciones recibidas no se han leído.
 *  - Pestaña "Recibidas": al abrir una se marca como leída y se ve el mensaje completo;
 *    si trae enlace, "Ir" lleva a esa pantalla. Se pueden eliminar o marcar todas
 *    como leídas.
 *  - Pestaña "Enviadas": cada envío con sus destinatarios y cuántos ya lo leyeron.
 *  - "Nueva" abre NuevaNotificacionDialog.
 *  - Tiempo real (Supabase Realtime): las notificaciones nuevas aparecen al instante
 *    y muestran un aviso (toast); también se reflejan las lecturas de lo enviado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Bell, CheckCheck, ExternalLink, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import {
  cargarEnviadas,
  cargarRecibidas,
  eliminarNotificacion,
  mapNotificacion,
  marcarLeidas,
  tiempoRelativo,
  type Notificacion,
} from "../../lib/notificaciones";
import NuevaNotificacionDialog from "./NuevaNotificacionDialog";
import Esqueleto from "../Esqueleto";
import { useTransicionBreve } from "../../hooks/useTransicionBreve";

type Pestana = "recibidas" | "enviadas";

export default function CampanaNotificaciones() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const usuarioId = user?.id;

  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("recibidas");
  // Skeleton breve al cambiar entre Recibidas y Enviadas.
  const cambiandoPestana = useTransicionBreve(pestana, 250);
  const [recibidas, setRecibidas] = useState<Notificacion[]>([]);
  const [enviadas, setEnviadas] = useState<Notificacion[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redactando, setRedactando] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async () => {
    if (!usuarioId) return;
    try {
      const [r, e] = await Promise.all([cargarRecibidas(usuarioId), cargarEnviadas(usuarioId)]);
      setRecibidas(r);
      setEnviadas(e);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [usuarioId]);

  // Carga inicial y suscripción en tiempo real.
  useEffect(() => {
    if (!usuarioId) return;
    recargar();

    const canal = supabase
      .channel(`notificaciones-${usuarioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `destinatario_id=eq.${usuarioId}` },
        (payload) => {
          const n = mapNotificacion(payload.new);
          setRecibidas((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
          toast(n.titulo, {
            description: n.remitenteId ? `De ${n.remitenteNombre}` : n.mensaje ?? n.remitenteNombre,
            icon: <Bell className="w-4 h-4" />,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notificaciones", filter: `remitente_id=eq.${usuarioId}` },
        (payload) => {
          // Un destinatario leyó algo que envié.
          const n = mapNotificacion(payload.new);
          setEnviadas((prev) => prev.map((p) => (p.id === n.id ? n : p)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuarioId, recargar]);

  // Cierra el panel al hacer clic fuera o con Esc.
  useEffect(() => {
    if (!abierto) return;
    const onPointerDown = (e: PointerEvent) => {
      // Los diálogos se montan fuera del contenedor: no cierran el panel.
      if (redactando) return;
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !redactando) setAbierto(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [abierto, redactando]);

  const noLeidas = recibidas.filter((n) => !n.leidaAt);

  // Agrupa lo enviado por envío (una fila por destinatario en la BD).
  const envios = useMemo(() => {
    const mapa = new Map<string, Notificacion[]>();
    for (const n of enviadas) {
      const lista = mapa.get(n.envioId) ?? [];
      lista.push(n);
      mapa.set(n.envioId, lista);
    }
    return [...mapa.values()];
  }, [enviadas]);

  // Cambia el estado local de inmediato y, si falla en la BD, lo revierte.
  const cambiarLeida = async (ids: string[], leida: boolean) => {
    const ahora = new Date().toISOString();
    const previas = recibidas;
    setRecibidas((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, leidaAt: leida ? ahora : null } : n)));
    try {
      await marcarLeidas(ids, leida);
    } catch (err: any) {
      setRecibidas(previas);
      toast.error(`No se pudo actualizar: ${err.message}`);
    }
  };

  const abrir = (n: Notificacion) => {
    setExpandida((actual) => (actual === n.id ? null : n.id));
    if (!n.leidaAt) cambiarLeida([n.id], true);
  };

  const eliminar = async (id: string) => {
    const previas = recibidas;
    setRecibidas((prev) => prev.filter((n) => n.id !== id));
    try {
      await eliminarNotificacion(id);
    } catch (err: any) {
      setRecibidas(previas);
      toast.error(`No se pudo eliminar: ${err.message}`);
    }
  };

  const ir = (enlace: string) => {
    setAbierto(false);
    navigate(enlace);
  };

  if (!user) return null;

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-label={noLeidas.length ? `Notificaciones, ${noLeidas.length} sin leer` : "Notificaciones"}
        aria-expanded={abierto}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {noLeidas.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-status-pending dark:bg-red-600 text-white text-[10px] font-semibold">
            {noLeidas.length > 99 ? "99+" : noLeidas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[min(24rem,calc(100vw-2rem))] bg-card border border-border rounded-lg shadow-lg flex flex-col max-h-[75vh]">
          {/* Encabezado */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold">Notificaciones</span>
            <button
              type="button"
              onClick={() => setRedactando(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva
            </button>
          </div>

          {/* Pestañas */}
          <div className="flex items-center justify-between px-2 border-b border-border">
            <div className="flex">
              {(["recibidas", "enviadas"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPestana(p)}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                    pestana === p
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "recibidas" ? `Recibidas${noLeidas.length ? ` (${noLeidas.length})` : ""}` : "Enviadas"}
                </button>
              ))}
            </div>
            {pestana === "recibidas" && noLeidas.length > 0 && (
              <button
                type="button"
                onClick={() => cambiarLeida(noLeidas.map((n) => n.id), true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Contenido */}
          {/* La lista de la pestaña nueva se muestra unos instantes como su propio esqueleto */}
          <Esqueleto activo={cambiandoPestana} className="overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-sm text-center text-status-pending-text">
                No se pudieron cargar las notificaciones: {error}
              </p>
            ) : pestana === "recibidas" ? (
              recibidas.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center text-muted-foreground">No tienes notificaciones</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recibidas.map((n) => {
                    const abiertaEsta = expandida === n.id;
                    return (
                      <li key={n.id} className={n.leidaAt ? "" : "bg-primary/5"}>
                        <div className="flex gap-3 px-4 py-3">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.leidaAt ? "bg-transparent" : "bg-primary"}`}
                            aria-hidden
                          />
                          <button type="button" onClick={() => abrir(n)} className="flex-1 min-w-0 text-left">
                            <span className={`block text-sm ${n.leidaAt ? "" : "font-semibold"}`}>{n.titulo}</span>
                            {n.mensaje && (
                              <span
                                className={`block text-sm text-muted-foreground whitespace-pre-line mt-0.5 ${
                                  abiertaEsta ? "" : "line-clamp-2"
                                }`}
                              >
                                {n.mensaje}
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground mt-1">
                              {n.remitenteId ? `De ${n.remitenteNombre}` : n.remitenteNombre} ·{" "}
                              {tiempoRelativo(n.createdAt)}
                            </span>
                          </button>
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => eliminar(n.id)}
                              aria-label="Eliminar notificación"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {abiertaEsta && (
                          <div className="flex gap-3 px-4 pb-3 pl-9 text-xs">
                            {n.enlace && (
                              <button
                                type="button"
                                onClick={() => ir(n.enlace!)}
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Ir a la pantalla
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => cambiarLeida([n.id], false)}
                              className="text-muted-foreground hover:text-foreground hover:underline"
                            >
                              Marcar como no leída
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : envios.length === 0 ? (
              <p className="px-4 py-8 text-sm text-center text-muted-foreground">No has enviado notificaciones</p>
            ) : (
              <ul className="divide-y divide-border">
                {envios.map((grupo) => {
                  const n = grupo[0];
                  const leidas = grupo.filter((g) => g.leidaAt).length;
                  const nombres = grupo.map((g) => g.destinatarioNombre);
                  const para =
                    nombres.length <= 3
                      ? nombres.join(", ")
                      : `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
                  return (
                    <li key={n.envioId} className="px-4 py-3">
                      <span className="block text-sm font-medium">{n.titulo}</span>
                      {n.mensaje && (
                        <span className="block text-sm text-muted-foreground line-clamp-2 mt-0.5">{n.mensaje}</span>
                      )}
                      <span className="block text-xs text-muted-foreground mt-1">
                        Para {para} · {tiempoRelativo(n.createdAt)}
                      </span>
                      <span
                        className={`inline-block mt-1 text-xs ${
                          leidas === grupo.length ? "text-status-completed-text" : "text-muted-foreground"
                        }`}
                      >
                        {grupo.length === 1
                          ? leidas
                            ? "Leída"
                            : "Sin leer"
                          : `Leída por ${leidas} de ${grupo.length}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Esqueleto>
        </div>
      )}

      <NuevaNotificacionDialog
        abierto={redactando}
        onClose={() => setRedactando(false)}
        onEnviada={() => {
          setPestana("enviadas");
          recargar();
        }}
      />
    </div>
  );
}
