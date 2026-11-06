/**
 * MaterialForm.tsx — Formulario de alta de materia prima (ruta /materiales/nuevo).
 *
 * Sigue el mismo diseño que ProductoForm: columna izquierda con los datos del material
 * y columna derecha con un resumen en vivo y los botones de acción.
 *
 * Campos: nombre, tipo (tela / hilo / accesorio), unidad de medida, stock inicial,
 * stock mínimo, precio unitario y proveedor (opcional).
 *
 * Al guardar inserta la fila en la tabla `materiales` de Supabase, recarga los datos
 * del contexto y vuelve al inventario de materiales. Las políticas RLS solo permiten
 * el alta al administrador primario; la página además bloquea el formulario si el rol
 * no tiene permiso de creación en el inventario de materiales.
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Save, AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";
import { supabase } from "../lib/supabase";
import type { Material } from "../data/mockData";

// Unidad sugerida para cada tipo de material (se puede cambiar manualmente).
const UNIDAD_POR_TIPO: Record<Material["tipo"], Material["unidad"]> = {
  tela: "metros",
  hilo: "piezas",
  accesorio: "piezas",
};

const claseCampo =
  "w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function MaterialForm() {
  const { proveedores, refresh } = useErpData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // El permiso se evalúa sobre el módulo de inventario de materiales.
  const puedeCrear = !!user && hasPermission(user.rol, "/inventario/materiales", "canCreate");

  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "tela" as Material["tipo"],
    unidad: "metros" as Material["unidad"],
    stock: "",
    stockMinimo: "",
    precio: "",
    proveedorId: "",
  });
  const [guardando, setGuardando] = useState(false);

  // Convierte los campos numéricos (texto en el input) a número; vacío cuenta como 0.
  const stock = Number(formData.stock) || 0;
  const stockMinimo = Number(formData.stockMinimo) || 0;
  const precio = Number(formData.precio) || 0;
  const stockBajo = stock < stockMinimo;
  const proveedorNombre =
    proveedores.find((p) => p.id === formData.proveedorId)?.nombre ?? "Sin proveedor";

  // Al cambiar el tipo se sugiere su unidad habitual.
  const cambiarTipo = (tipo: Material["tipo"]) => {
    setFormData({ ...formData, tipo, unidad: UNIDAD_POR_TIPO[tipo] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeCrear || guardando) return;

    const nombre = formData.nombre.trim();
    if (!nombre) {
      toast.error("El nombre del material es obligatorio");
      return;
    }
    if (stock < 0 || stockMinimo < 0 || precio < 0) {
      toast.error("Las cantidades y el precio no pueden ser negativos");
      return;
    }

    setGuardando(true);
    const { error } = await supabase.from("materiales").insert({
      nombre,
      tipo: formData.tipo,
      unidad: formData.unidad,
      stock_actual: stock,
      stock_minimo: stockMinimo,
      precio_unitario: precio,
      proveedor_id: formData.proveedorId || null,
    });
    setGuardando(false);

    if (error) {
      toast.error(`No se pudo guardar el material: ${error.message}`);
      return;
    }

    toast.success(`Material "${nombre}" agregado al inventario`);
    await refresh();
    navigate("/inventario/materiales");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con flecha para volver al inventario */}
      <div className="flex items-center gap-4">
        <Link
          to="/inventario/materiales"
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1>Nuevo Material</h1>
          <p className="text-muted-foreground mt-1">
            Agrega una tela, hilo o accesorio al inventario
          </p>
        </div>
      </div>

      {/* Aviso cuando el rol no puede dar de alta materiales */}
      {!puedeCrear && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">Sin permiso de creación</p>
            <p className="text-sm text-yellow-700">
              Tu rol no puede agregar materiales al inventario.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset disabled={!puedeCrear || guardando}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda: datos del material */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Nombre del Material *
                    </label>
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className={claseCampo}
                      placeholder="Ej: Tela Gabardina Azul Marino"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Tipo de Material *
                      </label>
                      <select
                        value={formData.tipo}
                        onChange={(e) => cambiarTipo(e.target.value as Material["tipo"])}
                        className={claseCampo}
                        required
                      >
                        <option value="tela">Tela</option>
                        <option value="hilo">Hilo</option>
                        <option value="accesorio">Accesorio</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Unidad de Medida *
                      </label>
                      <select
                        value={formData.unidad}
                        onChange={(e) =>
                          setFormData({ ...formData, unidad: e.target.value as Material["unidad"] })
                        }
                        className={claseCampo}
                        required
                      >
                        <option value="metros">Metros</option>
                        <option value="piezas">Piezas</option>
                        <option value="kg">Kilogramos</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Proveedor
                    </label>
                    <select
                      value={formData.proveedorId}
                      onChange={(e) => setFormData({ ...formData, proveedorId: e.target.value })}
                      className={claseCampo}
                    >
                      <option value="">Sin proveedor</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Existencias y Precio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Stock Inicial ({formData.unidad})
                      </label>
                      <input
                        type="number"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        className={claseCampo}
                        placeholder="0"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Stock Mínimo ({formData.unidad})
                      </label>
                      <input
                        type="number"
                        value={formData.stockMinimo}
                        onChange={(e) => setFormData({ ...formData, stockMinimo: e.target.value })}
                        className={claseCampo}
                        placeholder="0"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Precio Unitario (MXN) *
                      </label>
                      <input
                        type="number"
                        value={formData.precio}
                        onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                        className={claseCampo}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Cuando el stock sea menor al mínimo, el material se marcará como "Stock Bajo".
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Columna derecha: resumen y acciones */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium capitalize">{formData.tipo}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Proveedor:</span>
                    <span className="font-medium text-right">{proveedorNombre}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock:</span>
                    <span className="font-medium">
                      {stock} {formData.unidad}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precio:</span>
                    <span className="font-medium">${precio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor en inventario:</span>
                    <span className="font-medium">${(stock * precio).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-muted-foreground">Estado:</span>
                    {stockBajo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-status-pending-bg text-status-pending-text">
                        <AlertTriangle className="w-3 h-3" />
                        Stock Bajo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-status-completed-bg text-status-completed-text">
                        Normal
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Save className="w-5 h-5" />
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <Link
                  to="/inventario/materiales"
                  className="px-4 py-3 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Cancelar
                </Link>
              </div>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
