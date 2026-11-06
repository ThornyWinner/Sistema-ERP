/**
 * NuevaNotificacionDialog.tsx — Redactar y enviar una notificación a otros usuarios.
 *
 * Destinatarios: usuarios concretos (con buscador) y/o roles completos (p. ej. todas
 * las costureras). Opcionalmente adjunta un enlace a la pantalla actual para que el
 * destinatario llegue directo a ella (p. ej. el detalle de una orden).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Search, Send } from "lucide-react";
import { roleLabels } from "../../utils/permissions";
import type { UserRole } from "../../types/auth";
import {
  cargarDirectorio,
  enviarNotificacion,
  LIMITE_MENSAJE,
  LIMITE_TITULO,
  type UsuarioDirectorio,
} from "../../lib/notificaciones";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface NuevaNotificacionDialogProps {
  abierto: boolean;
  onClose: () => void;
  onEnviada: () => void;
}

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const ROLES = Object.keys(roleLabels) as UserRole[];

export default function NuevaNotificacionDialog({ abierto, onClose, onEnviada }: NuevaNotificacionDialogProps) {
  const location = useLocation();
  const [directorio, setDirectorio] = useState<UsuarioDirectorio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [usuarios, setUsuarios] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Set<UserRole>>(new Set());
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [incluirEnlace, setIncluirEnlace] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Ruta actual (con su ?q= u otros parámetros) para adjuntarla como enlace.
  const rutaActual = location.pathname + location.search;

  // Al abrir: formulario limpio y directorio actualizado.
  useEffect(() => {
    if (!abierto) return;
    setBusqueda("");
    setUsuarios(new Set());
    setRoles(new Set());
    setTitulo("");
    setMensaje("");
    setIncluirEnlace(false);
    setCargando(true);
    cargarDirectorio()
      .then(setDirectorio)
      .catch((e) => toast.error(`No se pudo cargar la lista de usuarios: ${e.message}`))
      .finally(() => setCargando(false));
  }, [abierto]);

  // Solo se ofrecen los roles que tienen al menos un usuario activo.
  const rolesConUsuarios = ROLES.filter((r) => directorio.some((u) => u.rol === r));

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q
      ? directorio.filter(
          (u) => u.nombre.toLowerCase().includes(q) || roleLabels[u.rol]?.toLowerCase().includes(q)
        )
      : directorio;
  }, [busqueda, directorio]);

  // Total de personas que recibirán la notificación (sin contar repetidos).
  const totalDestinatarios = directorio.filter((u) => usuarios.has(u.id) || roles.has(u.rol)).length;

  const alternar = <T,>(set: Set<T>, valor: T) => {
    const nuevo = new Set(set);
    if (nuevo.has(valor)) nuevo.delete(valor);
    else nuevo.add(valor);
    return nuevo;
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("Escribe un título");
      return;
    }
    if (totalDestinatarios === 0) {
      toast.error("Elige al menos un destinatario");
      return;
    }
    setEnviando(true);
    try {
      const total = await enviarNotificacion({
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        destinatarios: [...usuarios],
        roles: [...roles],
        enlace: incluirEnlace ? rutaActual : undefined,
      });
      toast.success(total === 1 ? "Notificación enviada" : `Notificación enviada a ${total} personas`);
      onEnviada();
      onClose();
    } catch (err: any) {
      toast.error(`No se pudo enviar: ${err.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva notificación</DialogTitle>
          <DialogDescription>Envía un aviso a otros usuarios del sistema.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          {/* Roles completos */}
          {rolesConUsuarios.length > 0 && (
            <div className="space-y-2">
              <Label>Enviar a un rol completo</Label>
              <div className="flex flex-wrap gap-2">
                {rolesConUsuarios.map((rol) => {
                  const activo = roles.has(rol);
                  return (
                    <button
                      key={rol}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setRoles(alternar(roles, rol))}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        activo
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-foreground border-transparent hover:border-border"
                      }`}
                    >
                      {roleLabels[rol]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Usuarios concretos */}
          <div className="space-y-2">
            <Label htmlFor="notif-busqueda">O elegir personas</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="notif-busqueda"
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o rol..."
                className={`${claseCampo} pl-9`}
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {cargando ? (
                <p className="p-3 text-sm text-muted-foreground">Cargando usuarios...</p>
              ) : filtrados.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Sin usuarios que coincidan</p>
              ) : (
                filtrados.map((u) => {
                  const porRol = roles.has(u.rol);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/60"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={usuarios.has(u.id) || porRol}
                        disabled={porRol}
                        onChange={() => setUsuarios(alternar(usuarios, u.id))}
                      />
                      <span className="flex-1 font-medium">{u.nombre}</span>
                      <span className="text-xs text-muted-foreground">{roleLabels[u.rol] ?? u.rol}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalDestinatarios === 0
                ? "Sin destinatarios seleccionados"
                : totalDestinatarios === 1
                  ? "1 persona recibirá la notificación"
                  : `${totalDestinatarios} personas recibirán la notificación`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-titulo">Título *</Label>
            <Input
              id="notif-titulo"
              value={titulo}
              maxLength={LIMITE_TITULO}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Orden ORD-2026-014 lista para costura"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-mensaje">Mensaje</Label>
            <textarea
              id="notif-mensaje"
              rows={4}
              value={mensaje}
              maxLength={LIMITE_MENSAJE}
              onChange={(e) => setMensaje(e.target.value)}
              className={claseCampo}
              placeholder="Detalles opcionales..."
            />
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 mt-0.5"
              checked={incluirEnlace}
              onChange={(e) => setIncluirEnlace(e.target.checked)}
            />
            <span>
              Incluir enlace a esta pantalla
              <span className="block text-xs text-muted-foreground break-all">{rutaActual}</span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              <Send className="w-4 h-4" />
              {enviando ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
