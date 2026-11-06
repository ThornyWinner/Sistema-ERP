/**
 * ProveedorForm.tsx — Formulario de alta de proveedores (ruta /proveedores/nuevo).
 *
 * Sigue el mismo diseño que ProductoForm y MaterialForm: columna izquierda con los
 * datos del proveedor y columna derecha con una vista previa de su tarjeta y los
 * botones de acción.
 *
 * Campos: nombre (empresa), persona de contacto, teléfono, email y calificación (0 a 5).
 * Los "insumos que suministra" no se capturan aquí: salen de los materiales que tienen
 * asignado a este proveedor (se eligen al dar de alta un material).
 *
 * Al guardar inserta la fila en la tabla `proveedores` de Supabase, recarga los datos
 * del contexto y vuelve al directorio. Las políticas RLS solo permiten el alta al
 * administrador primario; la página además bloquea el formulario si el rol no tiene
 * permiso de creación en el módulo de proveedores.
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Save, Lock, Star, Phone, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";
import { supabase } from "../lib/supabase";

const claseCampo =
  "w-full px-4 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function ProveedorForm() {
  const { proveedores, refresh } = useErpData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // El permiso se evalúa sobre el módulo de proveedores.
  const puedeCrear = !!user && hasPermission(user.rol, "/proveedores", "canCreate");

  const [formData, setFormData] = useState({
    nombre: "",
    contacto: "",
    telefono: "",
    email: "",
    calificacion: 0,
  });
  // Estrella bajo el cursor, para previsualizar la calificación antes de hacer clic.
  const [hoverEstrella, setHoverEstrella] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeCrear || guardando) return;

    const nombre = formData.nombre.trim();
    if (!nombre) {
      toast.error("El nombre del proveedor es obligatorio");
      return;
    }
    // Evita duplicados obvios (mismo nombre sin distinguir mayúsculas).
    if (proveedores.some((p) => p.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
      toast.error(`Ya existe un proveedor llamado "${nombre}"`);
      return;
    }

    setGuardando(true);
    const { error } = await supabase.from("proveedores").insert({
      nombre,
      contacto: formData.contacto.trim() || null,
      telefono: formData.telefono.trim() || null,
      email: formData.email.trim() || null,
      calificacion: formData.calificacion || null,
    });
    setGuardando(false);

    if (error) {
      toast.error(`No se pudo guardar el proveedor: ${error.message}`);
      return;
    }

    toast.success(`Proveedor "${nombre}" agregado`);
    await refresh();
    navigate("/proveedores");
  };

  const estrellasVisibles = hoverEstrella || formData.calificacion;

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado con flecha para volver al directorio */}
      <div className="flex items-center gap-4">
        <Link to="/proveedores" className="p-2 hover:bg-secondary rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1>Nuevo Proveedor</h1>
          <p className="text-muted-foreground mt-1">
            Registra un proveedor de materiales e insumos
          </p>
        </div>
      </div>

      {/* Aviso cuando el rol no puede dar de alta proveedores */}
      {!puedeCrear && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">Sin permiso de creación</p>
            <p className="text-sm text-yellow-700">Tu rol no puede agregar proveedores.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset disabled={!puedeCrear || guardando}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda: datos del proveedor */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Nombre del Proveedor *
                    </label>
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className={claseCampo}
                      placeholder="Ej: Textiles del Norte S.A. de C.V."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Persona de Contacto
                    </label>
                    <input
                      type="text"
                      value={formData.contacto}
                      onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                      className={claseCampo}
                      placeholder="Ej: Juan Pérez"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contacto y Calificación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className={claseCampo}
                        placeholder="Ej: 81 1234 5678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={claseCampo}
                        placeholder="ventas@proveedor.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Calificación
                    </label>
                    <div className="flex items-center gap-1" onMouseLeave={() => setHoverEstrella(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} de 5`}
                          onMouseEnter={() => setHoverEstrella(n)}
                          // Volver a pulsar la estrella seleccionada quita la calificación.
                          onClick={() =>
                            setFormData({
                              ...formData,
                              calificacion: formData.calificacion === n ? 0 : n,
                            })
                          }
                          className="p-1 rounded hover:bg-secondary transition-colors"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              n <= estrellasVisibles
                                ? "text-status-completed fill-current"
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {formData.calificacion ? `${formData.calificacion} de 5` : "Sin calificar"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Columna derecha: vista previa de la tarjeta y acciones */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Vista Previa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-lg text-foreground break-words">
                        {formData.nombre || "Nombre del proveedor"}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formData.contacto || "Sin contacto"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-status-completed-bg rounded">
                      <Star className="w-4 h-4 text-status-completed fill-current" />
                      <span className="text-sm font-medium text-status-completed-text">
                        {formData.calificacion}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span>{formData.telefono || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground break-all">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span>{formData.email || "—"}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-3 border-t border-border">
                    Los insumos se asignan al dar de alta cada material en el inventario.
                  </p>
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
                  to="/proveedores"
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
