/**
 * TallerDiseno.tsx — Tablero Kanban del taller de Diseño (ruta /talleres/diseno).
 *
 * Muestra todos los productos de todas las órdenes cuyo flujo incluye "diseno",
 * repartidos por su estado en este taller. Los botones Iniciar/Completar actualizan
 * el avance en Supabase.
 *
 * Cada tarjeta muestra el boceto vigente y si el cliente ya lo aprobó
 * (sql/aprobacion_disenos.sql). El diseñador sube versiones nuevas desde aquí; el
 * vendedor se las manda al cliente y registra su respuesta desde la orden. La BD no
 * deja completar Diseño sin un boceto aprobado (el admin primario puede saltarlo).
 * El administrador secundario solo consulta.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Upload } from "lucide-react";
import TallerKanban from "../../components/TallerKanban";
import BocetoMiniatura from "../../components/disenos/BocetoMiniatura";
import SubirBocetoDialog from "../../components/disenos/SubirBocetoDialog";
import { useErpData } from "../../context/ErpDataContext";
import { useAuth } from "../../context/AuthContext";
import { ESTADO_PROPUESTA, textoRespuesta, usePropuestasDiseno, type PropuestaDiseno } from "../../lib/disenos";

interface Destino {
  ordenId: string;
  detalleId: string;
  titulo: string;
  ultima?: PropuestaDiseno;
}

export default function TallerDiseno() {
  const { user } = useAuth();
  const { ordenes, actualizarProgresoTaller } = useErpData();
  const { porDetalle, disponible, recargar } = usePropuestasDiseno();
  const [destino, setDestino] = useState<Destino | null>(null);

  // El administrador secundario solo puede consultar.
  const isReadOnly = user?.rol === "admin_secundario";
  const puedeSubir = user?.rol === "admin_primario" || user?.rol === "disenador";

  // Convierte órdenes → tarjetas: una tarjeta por cada producto que pasa por Diseño.
  const ordenesTaller = ordenes.flatMap((orden) =>
    orden.productos
      .filter((producto) => producto.talleres.includes("diseno"))
      .map((producto) => {
        const ultima = porDetalle.get(producto.id)?.[0];
        const estado = producto.progreso.diseno || "pending";
        const aprobado = ultima?.estado === "aprobada";
        return {
          // Id compuesto "ordenId::productoId" para identificar la tarjeta de forma única.
          id: `${orden.id}::${producto.id}`,
          numero: `${orden.numero} - ${producto.nombre}`,
          cliente: orden.cliente,
          producto: producto.nombre,
          cantidad: producto.cantidad,
          fechaEntrega: orden.fechaEntrega,
          // Estado del producto en este taller (pendiente si aún no tiene registro).
          estado,
          // Contenido extra de la tarjeta: boceto vigente y aprobación del cliente.
          detalles: !disponible ? undefined : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Diseño y aprobación del cliente:</p>
              <div className="flex items-start gap-3">
                {ultima && <BocetoMiniatura propuesta={ultima} className="h-14 w-14" />}
                <div className="min-w-0 space-y-1">
                  {ultima ? (
                    <>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PROPUESTA[ultima.estado].clase}`}>
                        v{ultima.version} · {ESTADO_PROPUESTA[ultima.estado].texto}
                      </span>
                      {textoRespuesta(ultima) && <p className="text-xs text-muted-foreground">{textoRespuesta(ultima)}</p>}
                      {ultima.estado === "rechazada" && ultima.respuestaComentarios && (
                        <p className="text-xs text-status-pending-text whitespace-pre-line">“{ultima.respuestaComentarios}”</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin boceto todavía</p>
                  )}
                </div>
              </div>
              {isReadOnly ? (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100 dark:bg-muted rounded text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  <span>Solo lectura</span>
                </div>
              ) : (
                <>
                  {puedeSubir && estado !== "completed" && (
                    <button
                      type="button"
                      onClick={() =>
                        setDestino({
                          ordenId: orden.id,
                          detalleId: producto.id,
                          titulo: `${orden.numero} · ${producto.cantidad} × ${producto.nombre} · ${orden.cliente}`,
                          ultima,
                        })
                      }
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-secondary rounded text-xs font-medium hover:bg-secondary/70 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      {ultima ? "Subir nueva versión" : "Subir boceto"}
                    </button>
                  )}
                  {estado === "in-progress" && !aprobado && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="w-3 h-3" /> Para completar, el cliente debe aprobar el boceto.
                    </p>
                  )}
                </>
              )}
            </div>
          ),
          ordenId: orden.id,
          productoId: producto.id,
        };
      })
  );

  // Al pulsar Iniciar/Completar: extrae el id del producto (orden_detalle) del id
  // compuesto y guarda el nuevo estado de Diseño. La BD rechaza completar sin aprobación.
  const handleChangeEstado = async (itemId: string, nuevoEstado: any) => {
    const [, productoId] = itemId.split("::");
    try {
      await actualizarProgresoTaller(productoId, "diseno", nuevoEstado);
    } catch (err: any) {
      toast.error("No se pudo actualizar", { description: err?.message });
    }
  };

  return (
    <>
      <TallerKanban
        titulo="Taller de Diseño"
        descripcion="Bocetos y aprobación del cliente antes de producción"
        ordenes={ordenesTaller}
        onChangeEstado={isReadOnly ? undefined : handleChangeEstado}
      />
      <SubirBocetoDialog
        destino={
          destino
            ? {
                ordenId: destino.ordenId,
                detalleId: destino.detalleId,
                titulo: destino.titulo,
                versionNueva: (destino.ultima?.version ?? 0) + 1,
                cambiosPedidos: destino.ultima?.estado === "rechazada" ? destino.ultima.respuestaComentarios : null,
              }
            : null
        }
        onClose={() => setDestino(null)}
        onSubido={() => {
          setDestino(null);
          recargar();
        }}
      />
    </>
  );
}
