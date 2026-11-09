/**
 * Ordenes.tsx — Listado de órdenes de producción (ruta /ordenes).
 *
 * Funciones principales:
 *  - Tabla de órdenes en orden FIFO (la más antigua primero) con su turno en la cola,
 *    tipo de venta, vendedor/cliente, productos, total y estado de
 *    pago, fecha de entrega (con días restantes) y estado general + % de avance.
 *    Al hacer clic en una fila se abre el detalle (/ordenes/:id).
 *  - Búsqueda por folio, cliente (nombre, teléfono o correo) o vendedor; filtros por estado y por vendedor.
 *  - Los vendedores solo ven sus propias órdenes; el resto de roles ve todas.
 *  - Botones "Venta Rápida" (VentaRapidaDialog) y "Nueva Orden" (NuevaOrdenMultiProducto);
 *    ambos guardan la orden con crearOrden() de ErpDataContext.
 *  - Panel inferior: próximas entregas.
 */
import { useState } from "react";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import OrdenCerradaBadge, { esOrdenCerrada } from "../components/OrdenCerradaBadge";
import NuevaOrdenMultiProducto from "../components/NuevaOrdenMultiProducto";
import VentaRapidaDialog from "../components/VentaRapidaDialog";
import { Orden } from "../data/mockData";
import { Search, Plus, Calendar, User, Filter, Zap, Phone, Mail } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { hasPermission } from "../utils/permissions";
import { formatMonto, totalPagado } from "../lib/pagos";
import {
  claseDiasRestantes,
  diasRestantes as calcularDiasRestantes,
  formatFecha,
  parseFecha,
  textoDiasRestantes,
} from "../lib/fechas";

export default function Ordenes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ordenes, productos, crearOrden } = useErpData();
  // Filtros de la tabla.
  const [searchTerm, setSearchTerm] = useBusquedaUrl();
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [filterVendedor, setFilterVendedor] = useState<string>("all");
  // Visibilidad de los dos diálogos de creación.
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [showVentaRapida, setShowVentaRapida] = useState(false);

  // Registrar órdenes (Nueva Orden y Venta Rápida): admin primario, admin secundario y
  // vendedores. La BD exige que la orden quede a nombre de quien la registra.
  const puedeCrear = !!user && hasPermission(user.rol, "/ordenes", "canCreate");

  // Filtrar órdenes según el rol del usuario
  const ordenesVisibles = user?.rol === "vendedor"
    ? ordenes.filter((o) => o.vendedorId === user.id)
    : ordenes;

  // Lista de vendedores (sin repetir y ordenada) para el filtro por vendedor.
  const vendedoresUnicos = Array.from(
    new Set(ordenesVisibles.map((o) => o.vendedor))
  ).sort();

  // Órdenes que cumplen búsqueda + estado + vendedor.
  const filteredOrdenes = ordenesVisibles.filter((orden) => {
    const termino = searchTerm.toLowerCase();
    const matchesSearch =
      orden.numero.toLowerCase().includes(termino) ||
      orden.cliente.toLowerCase().includes(termino) ||
      (orden.clienteTelefono ?? "").toLowerCase().includes(termino) ||
      (orden.clienteEmail ?? "").toLowerCase().includes(termino) ||
      orden.vendedor.toLowerCase().includes(termino);

    const matchesEstado = filterEstado === "all" || orden.estado === filterEstado;
    const matchesVendedor = filterVendedor === "all" || orden.vendedor === filterVendedor;

    return matchesSearch && matchesEstado && matchesVendedor;
  });

  // Turno FIFO de cada orden no completada: 1 = la más antigua, la siguiente en
  // atenderse. Se calcula sobre todas las órdenes (ya vienen de la más antigua a la
  // más reciente) para que el turno no cambie al filtrar la tabla.
  const turnos = new Map(
    ordenes
      .filter((o) => o.estado !== "completed")
      .map((o, i) => [o.id, i + 1] as const)
  );

  // Órdenes visibles sin completar y con fecha de entrega válida, de la más
  // próxima a la más lejana (solo las 3 primeras).
  const proximasEntregas = ordenesVisibles
    .filter((o) => o.estado !== "completed" && parseFecha(o.fechaEntrega))
    .sort(
      (a, b) =>
        parseFecha(a.fechaEntrega)!.getTime() - parseFecha(b.fechaEntrega)!.getTime()
    )
    .slice(0, 3);

  // Órdenes visibles ya entregadas y liquidadas, de la entrega más reciente a la más
  // antigua (solo las 3 primeras). Con la misma fecha (o sin fecha) va primero la que
  // se creó después; para eso se recorre la lista FIFO al revés antes de ordenar.
  const entregasRecientes = [...ordenesVisibles]
    .reverse()
    .filter(esOrdenCerrada)
    .sort(
      (a, b) =>
        (parseFecha(b.fechaEntrega)?.getTime() ?? 0) -
        (parseFecha(a.fechaEntrega)?.getTime() ?? 0)
    )
    .slice(0, 3);

  /**
   * Avance de la orden en %: pasos de taller completados / pasos de taller totales,
   * sumando todos sus productos. Sin productos o sin talleres se considera 100%.
   */
  const getProgresoTotal = (orden: Orden) => {
    if (!orden.productos || orden.productos.length === 0) return 100;

    const todosLosTalleres = orden.productos.flatMap((p) => p.talleres);
    if (todosLosTalleres.length === 0) return 100;

    const talleresCompletados = orden.productos.reduce((acc, producto) => {
      const completados = producto.talleres.filter(
        (t) => producto.progreso[t] === "completed"
      ).length;
      return acc + completados;
    }, 0);

    return Math.round((talleresCompletados / todosLosTalleres.length) * 100);
  };

  // Guarda la orden recibida de cualquiera de los dos diálogos y notifica el resultado
  // (en caso de éxito muestra el folio asignado por la base de datos).
  const handleNuevaOrden = async (nuevaOrden: Orden) => {
    try {
      const folio = await crearOrden(nuevaOrden);
      toast.success("Orden creada exitosamente", {
        description: `${folio} - ${nuevaOrden.cliente}`,
      });
    } catch (err) {
      toast.error("No se pudo crear la orden", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  // Colores de la etiqueta de tipo de venta.
  const getTipoVentaColor = (tipo: string) => {
    switch (tipo) {
      case "directa":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      case "fabricacion":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "comercializacion":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "mixta":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
    }
  };

  // Texto legible del tipo de venta.
  const getTipoVentaLabel = (tipo: string) => {
    switch (tipo) {
      case "directa":
        return "Venta Directa";
      case "fabricacion":
        return "Fabricación";
      case "comercializacion":
        return "Comercialización";
      case "mixta":
        return "Mixta";
      default:
        return tipo;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con los botones de Venta Rápida y Nueva Orden */}
      <div className="flex items-center justify-between">
        {/* Título y subtítulo */}
        <div>
          <h1>Órdenes de Producción</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de órdenes activas y en proceso
          </p>
        </div>
        {/* Botones de acción (solo para quien puede registrar órdenes) */}
        {puedeCrear && (
        <div className="flex gap-3">
          {/* Botón de Venta Rápida (abre el diálogo VentaRapidaDialog) */}
          <button
            onClick={() => setShowVentaRapida(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Zap className="w-5 h-5" />
            Venta Rápida
          </button>
          {/* Botón de Nueva Orden (abre el diálogo NuevaOrdenMultiProducto) */}
          <button
            onClick={() => setShowNuevaOrden(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Orden
          </button>
        </div>
        )}
      </div>

      {/* Filtros + tabla de órdenes */}
      <Card>
        <CardHeader>
          {/* Filtros de búsqueda y selección */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Búsqueda por folio, cliente o vendedor */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente, teléfono, correo o vendedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            {/* Filtros por estado y por vendedor */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Filtro por estado de la orden: pendiente, en proceso o completada */}
              <div className="flex items-center gap-2 flex-1">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="flex-1 px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="in-progress">En Proceso</option>
                  <option value="completed">Completado</option>
                </select>
              </div>
              {/* Filtro por vendedor */}
              <div className="flex items-center gap-2 flex-1">
                <User className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filterVendedor}
                  onChange={(e) => setFilterVendedor(e.target.value)}
                  className="flex-1 px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Todos los vendedores</option>
                  {vendedoresUnicos.map((vendedor) => (
                    <option key={vendedor} value={vendedor}>
                      {vendedor}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        {/* Tabla de órdenes */}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              {/* Encabezado de la tabla */}
              <thead className="bg-secondary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Orden
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tipo Venta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vendedor / Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Total / Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Entrega
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              {/* Cuerpo de la tabla: filas clicables que abren el detalle de la orden */}
              <tbody className="divide-y divide-border">
                {filteredOrdenes.map((orden) => {
                  const progreso = getProgresoTotal(orden);
                  // Días hasta la entrega (0 = hoy, negativo = vencida, null = sin fecha).
                  const diasRestantes = calcularDiasRestantes(orden.fechaEntrega);
                  // Suma de unidades de todos los productos de la orden.
                  const cantidadTotal = orden.productos?.reduce(
                    (acc, p) => acc + p.cantidad,
                    0
                  ) || 0;

                  return (
                    // Toda la fila es clicable y abre el detalle de la orden.
                    <tr
                      key={orden.id}
                      onClick={() => navigate(`/ordenes/${orden.id}`)}
                      className="hover:bg-secondary/50 transition-colors cursor-pointer"
                    >
{/* Número de orden + turno en la cola + fecha de creación */}
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-medium text-foreground">
                            {orden.numero}
                          </span>
                          {turnos.has(orden.id) && (
                            <span
                              className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted-foreground border border-border"
                              title="Posición en la cola de atención (primero en llegar, primero en atenderse)"
                            >
                              Turno #{turnos.get(orden.id)}
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatFecha(orden.fechaCreacion)}
                          </p>
                        </div>
                      </td>
{/* Tipo de venta: directa, fabricación, comercialización o mixta */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getTipoVentaColor(
                            orden.tipoVenta
                          )}`}
                        >
                          {getTipoVentaLabel(orden.tipoVenta)}
                        </span>
                      </td>
{/* Vendedor + cliente + contacto del cliente */}
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {orden.vendedor}
                            </span>
                          </div>
                          <p className="font-medium text-foreground mt-1">
                            {orden.cliente}
                          </p>
                          {/* Contacto del cliente (solo los datos registrados) */}
                          {orden.clienteTelefono && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Phone className="w-3 h-3" />
                              {orden.clienteTelefono}
                            </p>
                          )}
                          {orden.clienteEmail && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <Mail className="w-3 h-3" />
                              {orden.clienteEmail}
                            </p>
                          )}
                        </div>
                      </td>
{/* Cantidad de productos + unidades totales */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-foreground">
                            {orden.productos?.length || 0}{" "}
                            {(orden.productos?.length || 0) === 1 ? "producto" : "productos"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cantidadTotal} unidades
                          </p>
                        </div>
                      </td>
{/* Total de la orden + estado de pago */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-foreground">
                            ${(orden.total || 0).toLocaleString()}
                          </p>
                          {/* Estado de pago: Pagado (verde), Anticipo (ámbar) o Pendiente (rojo) */}
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                orden.estadoPago === "liquidado"
                                  ? "bg-status-completed text-status-completed-text dark:bg-status-completed-bg"
                                  : orden.estadoPago === "anticipo"
                                  ? "bg-status-in-progress text-status-in-progress-text dark:bg-status-in-progress-bg"
                                  : "bg-status-pending-bg text-status-pending-text"
                              }`}
                            >
                              {orden.estadoPago === "liquidado"
                                ? "Pagado"
                                : orden.estadoPago === "anticipo"
                                ? `Abonado: ${formatMonto(totalPagado(orden))}`
                                : "Pendiente"}
                            </span>
                          </div>
                        </div>
                      </td>
{/* Fecha de entrega + días restantes + distintivo de orden cerrada */}
                      <td className="px-6 py-4">
                        {esOrdenCerrada(orden) ? (
                          // Entregada y pagada en su totalidad: solo el distintivo.
                          <OrdenCerradaBadge orden={orden} size="sm" />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-foreground">
                                {formatFecha(orden.fechaEntrega)}
                              </p>
                              {/* En rojo si faltan 5 días o menos, o si ya venció */}
                              <p className={`text-xs ${claseDiasRestantes(diasRestantes)}`}>
                                {textoDiasRestantes(diasRestantes)}
                              </p>
                            </div>
                          </div>
                        )}
                      </td>
{/* Estado general + % de avance (solo si tiene talleres) */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <StatusBadge status={orden.estado} size="sm" />
                          {/* El % de avance no aplica a la venta directa */}
                          {orden.tipoVenta !== "directa" && (
                            <span className="text-xs text-muted-foreground">
                              {progreso}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredOrdenes.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron órdenes con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>
{/* Panel inferior con próximas entregas y entregas recientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Próximas entregas: las 3 órdenes sin completar con la fecha de entrega más
            cercana (las que no tienen fecha registrada se omiten) */}
        <Card>
          <CardHeader>
            <CardTitle>Próximas Entregas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {proximasEntregas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay entregas pendientes con fecha registrada
                </p>
              )}
              {proximasEntregas.map((orden) => {
                  const diasRestantes = calcularDiasRestantes(orden.fechaEntrega);
                  return (
                    <div
                      key={orden.id}
                      className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{orden.numero}</p>
                        <p className="text-sm text-muted-foreground">{orden.cliente}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {formatFecha(orden.fechaEntrega)}
                        </p>
                        <p className={`text-sm ${claseDiasRestantes(diasRestantes)}`}>
                          {textoDiasRestantes(diasRestantes)}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
        {/* Entregas recientes: las 3 últimas órdenes entregadas y liquidadas.
            Al hacer clic se abre el detalle de la orden. */}
        <Card>
          <CardHeader>
            <CardTitle>Entregas Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {entregasRecientes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aún no hay órdenes entregadas y liquidadas
                </p>
              )}
              {entregasRecientes.map((orden) => (
                <div
                  key={orden.id}
                  onClick={() => navigate(`/ordenes/${orden.id}`)}
                  className="flex items-center justify-between gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/70 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{orden.numero}</p>
                    <p className="text-sm text-muted-foreground truncate">{orden.cliente}</p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      ${(orden.total || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <OrdenCerradaBadge orden={orden} size="sm" />
                    <p className="text-sm text-muted-foreground">
                      Entregada el {formatFecha(orden.fechaEntrega)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Diálogos modales (se renderizan solo cuando están abiertos) */}
      <NuevaOrdenMultiProducto
        isOpen={showNuevaOrden}
        onClose={() => setShowNuevaOrden(false)}
        onSubmit={handleNuevaOrden}
      />

      <VentaRapidaDialog
        isOpen={showVentaRapida}
        onClose={() => setShowVentaRapida(false)}
        onSubmit={handleNuevaOrden}
        productos={productos}
      />
    </div>
  );
}
