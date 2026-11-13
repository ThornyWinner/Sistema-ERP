/**
 * OrdenDetalle.tsx — Detalle de una orden (ruta /ordenes/:id).
 *
 * Secciones:
 *  - Encabezado: folio, estado y tipo de venta.
 *  - Productos y flujo de producción: por cada producto, sus datos, el WorkflowStepper
 *    con el avance por taller y la personalización (bordado, hilos, logo, notas);
 *    al final, el progreso total de la orden.
 *  - Información general (vendedor, cliente con teléfono y correo, productos, fecha de entrega).
 *  - Información de pago (total, método, estado de pago, pagado y saldo). Si queda saldo,
 *    el botón "Registrar abono" permite pagar a plazos hasta liquidar la orden.
 *  - Historial de pagos (con el saldo restante tras cada abono) y notas de la orden.
 *
 * Compatibilidad: varias secciones (marcadas como "órdenes antiguas") soportan el
 * formato del prototipo en el que la orden tenía un solo producto con campos sueltos
 * (talleres, progreso, tipoPrenda, bordadoDetalle...). Por eso se usa `(orden as any)`.
 * Con los datos actuales de Supabase siempre existe `orden.productos`.
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import RegistrarAbonoDialog from "../components/RegistrarAbonoDialog";
import DesgloseImportes from "../components/DesgloseImportes";
import EditarOrdenDialog from "../components/EditarOrdenDialog";
import { Button } from "../components/ui/button";
import { METODO_PAGO_LABEL, formatMonto, redondearCentavos, saldoPendiente, totalPagado } from "../lib/pagos";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import OrdenCerradaBadge, { esOrdenCerrada } from "../components/OrdenCerradaBadge";
import WorkflowStepper from "../components/WorkflowStepper";
import {
  claseDiasRestantes,
  diasRestantes as calcularDiasRestantes,
  formatFecha,
  textoDiasRestantes,
} from "../lib/fechas";
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
  Phone,
  Mail,
  Plus,
  Pencil,
  ReceiptText,
} from "lucide-react";

export default function OrdenDetalle() {
  const { ordenes: mockOrdenes } = useErpData();
  // Id de la orden tomado de la URL.
  const { id } = useParams();
  const navigate = useNavigate();
  const orden = mockOrdenes.find((o) => o.id === id);
  const { user } = useAuth();
  // Diálogo para registrar un abono (pago a plazos).
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  // Diálogo para editar la orden cuando el cliente pide cambios.
  const [edicionAbierta, setEdicionAbierta] = useState(false);

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

  // Cobranza: lo pagado sale de la suma de pagos (anticipo + abonos), no del campo anticipo.
  const pagado = totalPagado(orden);
  const saldo = saldoPendiente(orden);
  // Quién puede modificar la orden (editarla o registrarle abonos):
  //  - admin primario: cualquier orden;
  //  - admin secundario y vendedores: solo las que registraron ellos mismos.
  // La BD aplica la misma regla (private.puede_editar_orden) y vuelve a validar todo.
  const esPropia = !!user && orden.vendedorId === user.id;
  const puedeModificar =
    user?.rol === "admin_primario" ||
    ((user?.rol === "admin_secundario" || user?.rol === "vendedor") && esPropia);

  const puedeAbonar = saldo > 0 && orden.estadoPago !== "cancelado" && puedeModificar;

  // La edición, además, solo mientras la orden no esté entregada ni cancelada.
  const ordenAbierta = orden.estadoNombre !== "Entregada" && orden.estadoNombre !== "Cancelada";
  const puedeEditar = ordenAbierta && puedeModificar;

  // Días que faltan para la fecha de entrega (0 = hoy, negativo = vencida, null = sin fecha).
  const diasRestantes = calcularDiasRestantes(orden.fechaEntrega);

  /**
   * Porcentaje de avance de la orden = pasos de taller completados / pasos totales.
   * Si la orden no tiene productos (formato antiguo) usa sus campos talleres/progreso.
   */
  const getProgresoTotal = () => {
    // Formato antiguo: la orden no tiene productos, solo talleres y progreso a nivel de orden.
    if (!orden.productos || orden.productos.length === 0) {
      const talleresActivos = (orden as any).talleres || [];
      if (talleresActivos.length === 0) return 100;
      const completados = talleresActivos.filter(
        (t: any) => (orden as any).progreso[t] === "completed"
      ).length;
      return Math.round((completados / talleresActivos.length) * 100);
    }

    // Formato actual: la orden tiene productos, cada uno con sus talleres y progreso.
    const todosLosTalleres = orden.productos.flatMap((p) => p.talleres);
    // Evita división por cero si no hay talleres en ningún producto.
    if (todosLosTalleres.length === 0) return 100;
    // Contar cuántos talleres están completados en todos los productos.
    const talleresCompletados = orden.productos.reduce((acc, producto) => {
      // Contar cuántos talleres de este producto están completados.
      const completados = producto.talleres.filter(
        (t) => producto.progreso[t] === "completed"
      ).length;
      return acc + completados;
    }, 0);
    return Math.round((talleresCompletados / todosLosTalleres.length) * 100);
  };

  // --- Funciones auxiliares de presentación (texto, color e icono según valores) ---
  // Etiqueta del tipo de venta (directa, fabricación, comercialización o mixta).
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

  // --- Color de fondo y texto según el tipo de venta.
  const getTipoVentaColor = () => {
    switch (orden.tipoVenta) {
      case "directa":
        return "bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300";
      case "fabricacion":
        return "bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300";
      case "comercializacion":
        return "bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300";
      case "mixta":
        return "bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300";
      default:
        return "bg-gray-100 dark:bg-gray-500/15 text-gray-800 dark:text-gray-300";
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

  // --- Etiqueta del método de pago (efectivo, tarjeta, transferencia, cheque o crédito).
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

  // --- Etiqueta del estado de pago (pendiente, anticipo, liquidado, cancelado o vencido).
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

  // --- Color de fondo y texto según el estado de pago.
  const getEstadoPagoColor = () => {
    switch (orden.estadoPago) {
      case "pendiente":
        return "bg-status-pending-bg text-status-pending-text";
      case "anticipo":
        return "bg-status-in-progress-bg text-status-in-progress-text";
      case "liquidado":
        return "bg-status-completed-bg text-status-completed-text";
      default:
        return "bg-gray-100 dark:bg-gray-500/15 text-gray-800 dark:text-gray-300";
    }
  };

  // --- Renderizado del componente ---
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
            {/* Entregada y pagada en su totalidad */}
            <OrdenCerradaBadge orden={orden} />
            {orden.tipoVenta && (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getTipoVentaColor()}`}
              >
                {getTipoVentaLabel()}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Detalles de la orden de producción
          </p>
        </div>
        {puedeEditar && (
          <Button variant="outline" onClick={() => setEdicionAbierta(true)}>
            <Pencil className="w-4 h-4" />
            Editar orden
          </Button>
        )}
        {/* Factura de la orden (borrador prellenado con cliente y partidas) */}
        {user?.rol === "admin_primario" && orden.estadoNombre !== "Cancelada" && (
          <Button variant="outline" onClick={() => navigate(`/facturacion/facturas/nueva?orden=${orden.id}`)}>
            <ReceiptText className="w-4 h-4" />
            Facturar
          </Button>
        )}
      </div>

      {/* Flujo de Trabajo: por producto (formato actual) o único (formato antiguo) */}
      {orden.productos && orden.productos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Productos y Flujo de Producción</CardTitle>
          </CardHeader>
          {/* Contenido de la tarjeta: por cada producto, sus datos, el WorkflowStepper con el avance por taller 
          y la personalización (bordado, hilos, logo, notas); al final, el progreso total de la orden. */}
          <CardContent className="space-y-6">
            {orden.productos.map((producto, index) => (
              // Cada producto se muestra en un contenedor con espacio entre ellos. 
              <div key={producto.id} className="space-y-4">
                {/* Datos del producto: nombre, cantidad, talla, color, notas, tipo de producción y precio total.*/}
                <div className="flex items-center justify-between pb-3 border-b">
                  {/* Número de producto (1, 2, 3...) y datos del producto (nombre, cantidad, talla, color, notas). */}
                  <div className="flex items-center gap-3">
                    {/* Número de producto en un círculo con fondo primario tenue y texto primario. */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">                   
                      <span className="text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                    </div>
                    {/* Datos del producto: nombre, cantidad, talla, color y notas. */}
                    <div>
                      <h3 className="font-semibold">{producto.nombre}</h3>
                      {/* Cantidad, talla y color del producto. Se filtran los valores nulos o vacíos y se unen con " • ". */}
                      <p className="text-sm text-muted-foreground">
                        {/* Talla y color solo si el producto está ligado a una variante */}
                        {[`${producto.cantidad} unidades`, producto.talla, producto.color]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                      {/* Notas del producto, si existen. Se muestran en un párrafo con texto pequeño y color de texto atenuado. */}
                      {producto.notas && (
                        <p className="text-xs text-muted-foreground mt-0.5">{producto.notas}</p>
                      )}
                    </div>
                  </div>
                  {/* Tipo de producción y precio total del producto (cantidad * precio unitario) */}
                  <div className="text-right">
                    {/* Tipo de producción: directa, fabricación o comercialización. Se muestra en un párrafo con texto pequeño y color de texto atenuado. */}
                    <p className="text-sm text-muted-foreground">
                      Tipo: {producto.tipoProduccion === "directa"
                        ? "Directa"
                        : producto.tipoProduccion === "fabricacion"
                        ? "Fabricación"
                        : "Comercialización"}
                    </p>
                    {/* Precio total del producto: cantidad * precio unitario. Se muestra en un párrafo con texto grande y negrita. */}
                    {producto.precioUnitario && (
                      <p className="font-semibold">
                        ${(producto.cantidad * producto.precioUnitario).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                {/* Avance por taller (solo si el producto pasa por algún taller) */}
                {producto.talleres.length > 0 && (
                  // WorkflowStepper muestra el progreso del producto en cada taller. Se centra horizontalmente y tiene un padding vertical de 4. 
                  // Se pasa la lista de talleres, el progreso del producto, el tamaño "md" y se muestran las etiquetas de los pasos. */}
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
          {/* Contenido de la tarjeta: vendedor, cliente, teléfono, correo, productos y fecha de entrega. */}
          <CardContent className="space-y-4">
            {/* Información del vendedor: icono y nombre del vendedor. */}
            <div className="flex items-start gap-3">
              {/* Icono de vendedor, nombre del vendedor. */}
              <User className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-medium">{orden.vendedor}</p>
              </div>
            </div>
            {/* Información del cliente: nombre, teléfono y correo electrónico. */}
            <div className="flex items-start gap-3">
              <ShoppingBag className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{orden.cliente}</p>
              </div>
            </div>
            {/* Información de contacto del cliente: teléfono y correo electrónico. */}
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Teléfono de Contacto</p>
                {/* Si el teléfono está registrado, muestra un enlace "tel:"; si no, muestra "No registrado". */}
                {orden.clienteTelefono ? (
                  <a
                    href={`tel:${orden.clienteTelefono.replace(/[^\d+]/g, "")}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {orden.clienteTelefono}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No registrado</p>
                )}
              </div>
            </div>
            {/* Información de contacto del cliente: correo electrónico. */}
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Correo Electrónico</p>
                {/* Si el correo electrónico está registrado, muestra un enlace "mailto:"; si no, muestra "No registrado". */}
                {orden.clienteEmail ? (
                  <a
                    href={`mailto:${orden.clienteEmail}`}
                    className="font-medium text-primary hover:underline break-all"
                  >
                    {orden.clienteEmail}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No registrado</p>
                )}
              </div>
            </div>
            {/* Información de productos: si la orden tiene productos, muestra la cantidad
            total y el número de productos; si no, muestra el nombre del producto antiguo. */}
            {!orden.productos && (orden as any).producto && (
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Producto</p>
                  <p className="font-medium">{(orden as any).producto}</p>
                </div>
              </div>
            )}
            {/* Información de productos: si la orden tiene productos, muestra la cantidad. */}
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
            {/* Información de fecha de entrega: si la orden está cerrada, muestra el distintivo; si no, muestra la fecha y los días restantes. */}
            {esOrdenCerrada(orden) ? (
              // Entregada y pagada en su totalidad: solo el distintivo, sin calendario.
              // pl-8 lo alinea con el texto de los renglones que sí llevan icono.
              <div className="pl-8">
                <p className="text-sm text-muted-foreground">Entrega</p>
                <div className="mt-1">
                  <OrdenCerradaBadge orden={orden} />
                </div>
              </div>
            ) : (
              // Fecha de entrega: icono de calendario, fecha y días restantes.
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Fecha de Entrega</p>
                  <p className="font-medium">
                    {/* Fecha larga en español, p. ej. "20 de abril de 2026" */}
                    {formatFecha(orden.fechaEntrega, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }, "Sin fecha registrada")}
                  </p>
                  {/* Días restantes: solo si hay fecha de entrega. */}
                  {diasRestantes !== null && (
                    <p className={`text-sm mt-1 ${claseDiasRestantes(diasRestantes)}`}>
                      {textoDiasRestantes(diasRestantes, " restantes")}
                    </p>
                  )}
                </div>
              </div>
            )}
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
                  <p className="text-2xl font-semibold">{formatMonto(orden.total)}</p>
                  <DesgloseImportes
                    className="mt-2"
                    importes={{
                      subtotal: orden.subtotal ?? orden.total,
                      descuento: orden.descuento ?? 0,
                      iva: orden.iva ?? 0,
                      total: orden.total,
                    }}
                  />
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
              {orden.anticipo > orden.total ? (
                // Órdenes antiguas con anticipo mayor al total: se muestra el
                // excedente como saldo a favor en lugar de un pendiente negativo.
                <div className="flex items-start gap-3">
                  <Banknote className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Anticipo</p>
                    <p className="font-semibold text-lg">{formatMonto(orden.anticipo)}</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Pendiente: $0 · Saldo a favor del cliente: {formatMonto(orden.anticipo - orden.total)}
                    </p>
                  </div>
                </div>
              ) : (
                (pagado > 0 || saldo > 0) && (
                  <div className="flex items-start gap-3">
                    <Banknote className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Pagado</p>
                          <p className="font-semibold text-lg">{formatMonto(pagado)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Pendiente</p>
                          <p className={`font-semibold text-lg ${saldo > 0 ? "text-status-pending-text" : "text-status-completed-text"}`}>
                            {formatMonto(saldo)}
                          </p>
                        </div>
                      </div>
                      {/* Barra de avance de cobranza */}
                      {orden.total > 0 && (
                        <div
                          className="h-2 w-full rounded-full bg-secondary overflow-hidden"
                          role="progressbar"
                          aria-label="Avance de pago"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round((pagado / orden.total) * 100)}
                        >
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min((pagado / orden.total) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                      {orden.anticipo > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Anticipo inicial: {formatMonto(orden.anticipo)}
                          {orden.pagos.length > 1 && ` · ${orden.pagos.length - 1} abono(s)`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
              {puedeAbonar && (
                <Button className="w-full" onClick={() => setAbonoAbierto(true)}>
                  <Plus className="w-4 h-4" />
                  Registrar abono
                </Button>
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
              {orden.pagos.map((pago, index) => {
                // Saldo que quedó después de este pago (los pagos vienen ordenados por fecha).
                const acumulado = redondearCentavos(
                  orden.pagos.slice(0, index + 1).reduce((acc, p) => acc + p.monto, 0)
                );
                const restante = Math.max(redondearCentavos(orden.total - acumulado), 0);
                const concepto =
                  restante === 0 ? "Liquidación" : index === 0 ? "Anticipo" : `Abono ${index}`;
                return (
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
                        {concepto} · {METODO_PAGO_LABEL[pago.metodo] ?? "Otro"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatFecha(pago.fecha, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">
                      {formatMonto(pago.monto)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Saldo: {formatMonto(restante)}
                    </p>
                    {pago.referencia && (
                      <p className="text-xs text-muted-foreground">
                        Ref: {pago.referencia}
                      </p>
                    )}
                  </div>
                </div>
                );
              })}
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

      <RegistrarAbonoDialog orden={orden} open={abonoAbierto} onClose={() => setAbonoAbierto(false)} />
      {puedeEditar && (
        <EditarOrdenDialog orden={orden} open={edicionAbierta} onClose={() => setEdicionAbierta(false)} />
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
