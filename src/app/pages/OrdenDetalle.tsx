/**
 * OrdenDetalle.tsx — Detalle de una orden (ruta /ordenes/:id).
 *
 * Secciones:
 *  - Encabezado: folio, estado, tipo de venta y aviso de prioridad alta.
 *  - Productos y flujo de producción: por cada producto, sus datos, el WorkflowStepper
 *    con el avance por taller y la personalización (bordado, hilos, logo, notas);
 *    al final, el progreso total de la orden.
 *  - Información general (vendedor, cliente, productos, fecha de entrega).
 *  - Información de pago (total, método, estado de pago, anticipo y saldo).
 *  - Historial de pagos y notas de la orden.
 *
 * Compatibilidad: varias secciones (marcadas como "órdenes antiguas") soportan el
 * formato del prototipo en el que la orden tenía un solo producto con campos sueltos
 * (talleres, progreso, tipoPrenda, bordadoDetalle...). Por eso se usa `(orden as any)`.
 * Con los datos actuales de Supabase siempre existe `orden.productos`.
 */
import { useParams, useNavigate } from "react-router";
import { useErpData } from "../context/ErpDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import WorkflowStepper from "../components/WorkflowStepper";
import {
  ArrowLeft,
  Calendar,
  User,
  Package,
  Ruler,
  Palette,
  Tag,
  ShoppingBag,
  FileText,
  Image as ImageIcon,
  Shirt,
  DollarSign,
  CreditCard,
  Banknote,
} from "lucide-react";

export default function OrdenDetalle() {
  const { ordenes: mockOrdenes } = useErpData();
  // Id de la orden tomado de la URL.
  const { id } = useParams();
  const navigate = useNavigate();
  const orden = mockOrdenes.find((o) => o.id === id);

  // Id inexistente (o datos aún cargando): mensaje y botón para volver al listado.
  if (!orden) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2>Orden no encontrada</h2>
          <button
            onClick={() => navigate("/ordenes")}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            Volver a Órdenes
          </button>
        </div>
      </div>
    );
  }

  // Días que faltan para la fecha de entrega (negativo = vencida).
  const diasRestantes = Math.ceil(
    (new Date(orden.fechaEntrega).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  /**
   * Porcentaje de avance de la orden = pasos de taller completados / pasos totales.
   * Si la orden no tiene productos (formato antiguo) usa sus campos talleres/progreso.
   */
  const getProgresoTotal = () => {
    if (!orden.productos || orden.productos.length === 0) {
      const talleresActivos = (orden as any).talleres || [];
      if (talleresActivos.length === 0) return 100;
      const completados = talleresActivos.filter(
        (t: any) => (orden as any).progreso[t] === "completed"
      ).length;
      return Math.round((completados / talleresActivos.length) * 100);
    }

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

  // --- Funciones auxiliares de presentación (texto, color e icono según valores) ---

  const getTipoVentaLabel = () => {
    switch (orden.tipoVenta) {
      case "directa":
        return "Venta Directa";
      case "fabricacion":
        return "Fabricación";
      case "comercializacion":
        return "Comercialización";
      case "mixta":
        return "Mixta";
      default:
        return "No especificado";
    }
  };

  const getTipoVentaColor = () => {
    switch (orden.tipoVenta) {
      case "directa":
        return "bg-orange-100 text-orange-800";
      case "fabricacion":
        return "bg-green-100 text-green-800";
      case "comercializacion":
        return "bg-blue-100 text-blue-800";
      case "mixta":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Icono del método de pago (cheque y crédito no tienen icono).
  const getMetodoPagoIcon = () => {
    switch (orden.metodoPago) {
      case "efectivo":
        return <Banknote className="w-4 h-4" />;
      case "tarjeta":
        return <CreditCard className="w-4 h-4" />;
      case "transferencia":
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getMetodoPagoLabel = () => {
    switch (orden.metodoPago) {
      case "efectivo":
        return "Efectivo";
      case "tarjeta":
        return "Tarjeta";
      case "transferencia":
        return "Transferencia";
      case "cheque":
        return "Cheque";
      case "credito":
        return "Crédito";
      default:
        return "No especificado";
    }
  };

  const getEstadoPagoLabel = () => {
    switch (orden.estadoPago) {
      case "pendiente":
        return "Pendiente";
      case "anticipo":
        return "Anticipo";
      case "liquidado":
        return "Liquidado";
      case "cancelado":
        return "Cancelado";
      case "vencido":
        return "Vencido";
      default:
        return "No especificado";
    }
  };

  const getEstadoPagoColor = () => {
    switch (orden.estadoPago) {
      case "pendiente":
        return "bg-status-pending-bg text-status-pending-text";
      case "anticipo":
        return "bg-status-in-progress-bg text-status-in-progress-text";
      case "liquidado":
        return "bg-status-completed-bg text-status-completed-text";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/ordenes")}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1>{orden.numero}</h1>
            <StatusBadge status={orden.estado} size="md" />
            {orden.tipoVenta && (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getTipoVentaColor()}`}
              >
                {getTipoVentaLabel()}
              </span>
            )}
            {orden.prioridad === "alta" && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-status-pending-bg text-status-pending-text">
                Prioridad Alta
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Detalles de la orden de producción
          </p>
        </div>
      </div>

      {/* Flujo de Trabajo: por producto (formato actual) o único (formato antiguo) */}
      {orden.productos && orden.productos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Productos y Flujo de Producción</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {orden.productos.map((producto, index) => (
              <div key={producto.id} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{producto.nombre}</h3>
                      <p className="text-sm text-muted-foreground">
                        {producto.cantidad} unidades • {producto.talla} • {producto.color}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      Tipo: {producto.tipoProduccion === "directa"
                        ? "Directa"
                        : producto.tipoProduccion === "fabricacion"
                        ? "Fabricación"
                        : "Comercialización"}
                    </p>
                    {producto.precioUnitario && (
                      <p className="font-semibold">
                        ${(producto.cantidad * producto.precioUnitario).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                {/* Avance por taller (solo si el producto pasa por algún taller) */}
                {producto.talleres.length > 0 && (
                  <div className="flex justify-center py-4">
                    <WorkflowStepper
                      talleres={producto.talleres}
                      progreso={producto.progreso}
                      size="md"
                      showLabels={true}
                    />
                  </div>
                )}
                {/* Datos de personalización; cada campo se muestra solo si existe */}
                {producto.personalizacion && (
                  <div className="bg-secondary p-4 rounded-lg">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Shirt className="w-4 h-4 text-primary" />
                      Personalización
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {producto.personalizacion.lugarBordado && (
                        <div>
                          <p className="text-muted-foreground">Lugar de Bordado</p>
                          <p className="font-medium capitalize">
                            {producto.personalizacion.lugarBordado}
                          </p>
                        </div>
                      )}
                      {producto.personalizacion.coloresHilo &&
                        producto.personalizacion.coloresHilo.length > 0 && (
                          <div>
                            <p className="text-muted-foreground">Colores de Hilo</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {producto.personalizacion.coloresHilo.map((color, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-background rounded text-xs"
                                >
                                  {color}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      {producto.personalizacion.logotipo && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Logotipo</p>
                          <p className="font-medium">{producto.personalizacion.logotipo}</p>
                        </div>
                      )}
                      {producto.personalizacion.notas && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Notas</p>
                          <p className="text-sm">{producto.personalizacion.notas}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {/* Barra de progreso total de la orden */}
            <div className="mt-6 flex items-center gap-4 p-4 bg-secondary rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Progreso Total</p>
                <p className="text-2xl font-semibold mt-1">{getProgresoTotal()}%</p>
              </div>
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${getProgresoTotal()}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Formato antiguo: un único flujo a nivel de orden.
        <Card>
          <CardHeader>
            <CardTitle>Flujo de Producción</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center py-4">
              <WorkflowStepper
                talleres={(orden as any).talleres || []}
                progreso={(orden as any).progreso || {}}
                size="lg"
                showLabels={true}
              />
            </div>
            <div className="mt-6 flex items-center gap-4 p-4 bg-secondary rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Progreso Total</p>
                <p className="text-2xl font-semibold mt-1">{getProgresoTotal()}%</p>
              </div>
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${getProgresoTotal()}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información General */}
        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-medium">{orden.vendedor}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShoppingBag className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{orden.cliente}</p>
              </div>
            </div>
            {!orden.productos && (orden as any).producto && (
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Producto</p>
                  <p className="font-medium">{(orden as any).producto}</p>
                </div>
              </div>
            )}
            {orden.productos && orden.productos.length > 0 && (
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Productos</p>
                  <p className="font-medium">
                    {orden.productos.length}{" "}
                    {orden.productos.length === 1 ? "producto" : "productos"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {orden.productos.reduce((acc, p) => acc + p.cantidad, 0)} unidades
                    totales
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Fecha de Entrega</p>
                <p className="font-medium">
                  {/* Fecha larga en español, p. ej. "20 de abril de 2026" */}
                  {new Date(orden.fechaEntrega).toLocaleDateString("es-MX", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    diasRestantes < 3
                      ? "text-status-pending"
                      : "text-muted-foreground"
                  }`}
                >
                  {diasRestantes > 0 ? `${diasRestantes} días restantes` : "Vencida"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Información de Pago */}
        {orden.total !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle>Información de Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-semibold">
                    ${orden.total.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                {getMetodoPagoIcon()}
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Método de Pago</p>
                  <p className="font-medium">{getMetodoPagoLabel()}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Tag className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Estado de Pago</p>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getEstadoPagoColor()}`}
                  >
                    {getEstadoPagoLabel()}
                  </span>
                </div>
              </div>
              {orden.anticipo > 0 && (
                <div className="flex items-start gap-3">
                  <Banknote className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Anticipo</p>
                    <p className="font-semibold text-lg">
                      ${orden.anticipo.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pendiente: ${(orden.total - orden.anticipo).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Especificaciones del Producto - Solo para órdenes antiguas */}
        {!orden.productos && (
          <Card>
            <CardHeader>
              <CardTitle>Especificaciones del Producto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Shirt className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Tipo de Prenda</p>
                  <p className="font-medium capitalize">
                    {(orden as any).tipoPrenda}
                  </p>
                </div>
              </div>
              {(orden as any).marca && (
                <div className="flex items-start gap-3">
                  <Tag className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Marca</p>
                    <p className="font-medium">{(orden as any).marca}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Ruler className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Talla</p>
                  <p className="font-medium">{(orden as any).talla}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Palette className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Color</p>
                  <p className="font-medium">{(orden as any).color}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Cantidad</p>
                  <p className="text-2xl font-semibold">
                    {(orden as any).cantidad} unidades
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Historial de Pagos */}
      {orden.pagos && orden.pagos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de Pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orden.pagos.map((pago, index) => (
                <div
                  key={`${pago.fecha}-${index}`}
                  className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-background rounded">
                      {pago.metodo === "efectivo" ? (
                        <Banknote className="w-4 h-4 text-primary" />
                      ) : pago.metodo === "tarjeta" ? (
                        <CreditCard className="w-4 h-4 text-primary" />
                      ) : (
                        <DollarSign className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {pago.metodo === "efectivo"
                          ? "Efectivo"
                          : pago.metodo === "tarjeta"
                          ? "Tarjeta"
                          : "Transferencia"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(pago.fecha).toLocaleDateString("es-MX", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">
                      ${pago.monto.toLocaleString()}
                    </p>
                    {pago.referencia && (
                      <p className="text-xs text-muted-foreground">
                        Ref: {pago.referencia}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detalles de Bordado - Solo para órdenes antiguas */}
      {!orden.productos && (orden as any).bordadoDetalle && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shirt className="w-5 h-5 text-primary" />
              Detalles de Bordado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Lugar a Bordar</p>
                  <p className="font-medium capitalize">
                    {(orden as any).bordadoDetalle.lugarBordar === "bolsillo"
                      ? "Bolsillo"
                      : (orden as any).bordadoDetalle.lugarBordar === "espalda"
                      ? "Espalda"
                      : "Personalizado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Colores de Hilo
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(orden as any).bordadoDetalle.coloresHilo.map(
                      (color: string, index: number) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-secondary rounded-full text-sm font-medium"
                        >
                          {color}
                        </span>
                      )
                    )}
                  </div>
                </div>
                {(orden as any).bordadoDetalle.notasAdicionales && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Notas Adicionales
                    </p>
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <p className="text-sm">
                        {(orden as any).bordadoDetalle.notasAdicionales}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {(orden as any).bordadoDetalle.logotipo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Logotipo</p>
                  <div className="border-2 border-dashed border-border rounded-lg p-8 bg-secondary flex flex-col items-center justify-center gap-3">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {(orden as any).bordadoDetalle.logotipo}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notas de la Orden */}
      {orden.notas && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Notas de la Orden
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{orden.notas}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
