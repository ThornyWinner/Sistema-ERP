/**
 * SeguimientoPedido.tsx — Página pública de avance de una orden (ruta /pedido/:token).
 *
 * El cliente la abre desde el enlace que le manda el vendedor, sin iniciar sesión. Ve en
 * qué etapa va su pedido (la del producto más atrasado, igual que en el sistema), el
 * avance de cada producto por taller, la fecha estimada de entrega y cuánto lleva
 * pagado. Los datos salen de public.seguimiento_orden (sql/seguimiento_publico.sql),
 * que solo entrega lo necesario.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { CheckCircle2, Circle, Clock, Loader2, PackageCheck, RefreshCw, XCircle } from "lucide-react";
import PaginaPublica, { TarjetaPublica } from "../../components/PaginaPublica";
import { cargarSeguimiento, ordenDeSeguimiento, type Seguimiento } from "../../lib/seguimientoPublico";
import { FLUJO_TALLERES, NOMBRE_TALLER, avanceOrden, avanceProducto, haceCuanto } from "../../lib/avanceProduccion";
import { formatFecha, textoDiasRestantes } from "../../lib/fechas";
import { formatMonto } from "../../lib/pagos";
import type { ProductoOrden } from "../../data/mockData";

const FECHA = { year: "numeric", month: "long", day: "numeric" } as const;

export default function SeguimientoPedido() {
  const { token = "" } = useParams();
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no_existe" | "error">("cargando");

  const cargar = useCallback(async () => {
    setEstado((e) => (e === "listo" ? e : "cargando"));
    try {
      // Un token que no es UUID ni siquiera se consulta.
      if (!/^[0-9a-f-]{36}$/i.test(token)) {
        setEstado("no_existe");
        return;
      }
      const s = await cargarSeguimiento(token);
      setDatos(s);
      setEstado(s ? "listo" : "no_existe");
    } catch {
      setEstado("error");
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    document.title = datos ? `Pedido ${datos.folio}` : "Seguimiento de pedido";
  }, [datos]);

  if (estado === "cargando") {
    return (
      <PaginaPublica>
        <TarjetaPublica className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Consultando tu pedido…
        </TarjetaPublica>
      </PaginaPublica>
    );
  }

  if (estado !== "listo" || !datos) {
    return (
      <PaginaPublica>
        <TarjetaPublica className="text-center py-10 space-y-2">
          <XCircle className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">
            {estado === "error" ? "No pudimos consultar el pedido" : "Enlace no válido"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {estado === "error"
              ? "Revisa tu conexión e inténtalo de nuevo en un momento."
              : "El enlace no existe o ya fue reemplazado. Pide uno nuevo a tu asesor de ventas."}
          </p>
          {estado === "error" && (
            <button onClick={() => void cargar()} className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
              Reintentar
            </button>
          )}
        </TarjetaPublica>
      </PaginaPublica>
    );
  }

  const orden = ordenDeSeguimiento(datos);
  const avance = avanceOrden(orden);
  const cancelada = avance.etapa === "cancelada";
  const entregada = avance.etapa === "entregada";

  // Texto principal para el cliente.
  const titulo =
    avance.etapa === "cancelada"
    ? "Pedido cancelado"
    : avance.etapa === "entregada"
    ? "Pedido entregado"
    : avance.etapa === "lista"
    ? "¡Tu pedido está listo!"
    : avance.etapa === "sin_iniciar"
    ? "Tu pedido está en la fila de producción"
    : avance.trabajando
    ? `Estamos trabajando en ${NOMBRE_TALLER[avance.etapa].toLowerCase()}`
    : `Por pasar a ${NOMBRE_TALLER[avance.etapa].toLowerCase()}`;

  const porcentaje = entregada ? 100 : avance.porcentaje;

  return (
    <PaginaPublica empresa={datos.empresa}>
      <TarjetaPublica className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Pedido {datos.folio}</p>
            {datos.cliente && <p className="text-sm font-medium truncate">{datos.cliente}</p>}
          </div>
          <button
            onClick={() => void cargar()}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
            aria-label="Actualizar"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {cancelada ? (
            <XCircle className="w-9 h-9 text-muted-foreground flex-shrink-0" />
          ) : entregada || avance.etapa === "lista" ? (
            <PackageCheck className="w-9 h-9 text-status-completed flex-shrink-0" />
          ) : (
            <Clock className="w-9 h-9 text-status-in-progress flex-shrink-0" />
          )}
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight">{titulo}</h1>
        </div>

        {!cancelada && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Avance de producción</span>
              <span>{porcentaje} %</span>
            </div>
            <div
              className="h-3 rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-valuenow={porcentaje}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Fecha del pedido</dt>
            <dd>{formatFecha(datos.fechaCreacion, FECHA)}</dd>
          </div>
          {datos.fechaEntrega && !cancelada && (
            <div>
              <dt className="text-xs text-muted-foreground">Entrega estimada</dt>
              <dd>
                {formatFecha(datos.fechaEntrega, FECHA)}
                {!entregada && avance.diasEntrega !== null && avance.diasEntrega >= 0 && (
                  <span className="block text-xs text-muted-foreground">{textoDiasRestantes(avance.diasEntrega, " restantes")}</span>
                )}
                {!entregada && avance.atrasada && (
                  <span className="block text-xs text-muted-foreground">Te confirmaremos la nueva fecha</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </TarjetaPublica>

      {!cancelada && datos.productos.length > 0 && (
        <TarjetaPublica className="space-y-4">
          <h2 className="font-semibold">Productos</h2>
          <ul className="space-y-4">
            {orden.productos.map((p, i) => (
              <ProductoAvance key={i} producto={p} entregada={entregada} />
            ))}
          </ul>
        </TarjetaPublica>
      )}

      {!cancelada && datos.total > 0 && (
        <TarjetaPublica>
          <h2 className="font-semibold mb-3">Pagos</h2>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="font-medium">{formatMonto(datos.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pagado</dt>
              <dd className="font-medium">{formatMonto(datos.pagado)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Saldo</dt>
              <dd className={`font-medium ${datos.saldo > 0 ? "" : "text-status-completed-text"}`}>
                {datos.saldo > 0 ? formatMonto(datos.saldo) : "Liquidado"}
              </dd>
            </div>
          </dl>
        </TarjetaPublica>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Actualizado {haceCuanto(datos.consultado) || "hace un momento"}
        {datos.vendedor && <> · ¿Dudas? Escríbele a {datos.vendedor}, tu asesor de ventas.</>}
      </p>
    </PaginaPublica>
  );
}

function ProductoAvance({ producto, entregada }: { producto: ProductoOrden; entregada: boolean }) {
  const a = avanceProducto(producto);
  const flujo = FLUJO_TALLERES.filter((t) => producto.talleres.includes(t));
  const detalle = [producto.talla && `Talla ${producto.talla}`, producto.color].filter(Boolean).join(" · ");
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {producto.cantidad} × {producto.nombre}
        </p>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {entregada || !a.taller ? "Terminado" : a.estado === "in-progress" ? `En ${NOMBRE_TALLER[a.taller]}` : `Por pasar a ${NOMBRE_TALLER[a.taller]}`}
        </span>
      </div>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      {flujo.length > 0 && (
        <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {flujo.map((t) => {
            const e = entregada ? "completed" : producto.progreso[t];
            return (
              <li key={t} className="flex items-center gap-1 text-xs">
                {e === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-status-completed" aria-hidden />
                ) : e === "in-progress" ? (
                  <Loader2 className="w-4 h-4 text-status-in-progress animate-spin [animation-duration:3s]" aria-hidden />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" aria-hidden />
                )}
                <span className={e === "completed" ? "" : e === "in-progress" ? "font-medium" : "text-muted-foreground"}>
                  {NOMBRE_TALLER[t]}
                  <span className="sr-only">
                    {e === "completed" ? " (terminado)" : e === "in-progress" ? " (en proceso)" : " (pendiente)"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}
