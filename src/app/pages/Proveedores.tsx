import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useErpData } from "../context/ErpDataContext";
import { Search, Plus, Star, Phone, Mail, Package } from "lucide-react";

export default function Proveedores() {
  const { proveedores: mockProveedores } = useErpData();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProveedores = mockProveedores.filter(
    (proveedor) =>
      proveedor.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proveedor.contacto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proveedor.insumos.some((i) => i.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Proveedores</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de proveedores de materiales e insumos
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />
          Agregar Proveedor
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre, contacto o insumos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            {filteredProveedores.map((proveedor) => (
              <Card key={proveedor.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">
                        {proveedor.nombre}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {proveedor.contacto}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-status-completed-bg rounded">
                      <Star className="w-4 h-4 text-status-completed fill-current" />
                      <span className="text-sm font-medium text-status-completed-text">
                        {proveedor.calificacion}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span>{proveedor.telefono}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span>{proveedor.email}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="flex items-start gap-2 mb-2">
                      <Package className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span className="text-sm font-medium text-foreground">
                        Insumos que suministra:
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {proveedor.insumos.map((insumo, index) => (
                        <span
                          key={index}
                          className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full"
                        >
                          {insumo}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm">
                      Contactar
                    </button>
                    <button className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm">
                      Ver Historial
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredProveedores.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron proveedores con los filtros seleccionados
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Proveedores</p>
                <p className="text-3xl font-semibold">{mockProveedores.length}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <Package className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Calificación Promedio</p>
                <p className="text-3xl font-semibold">
                  {(
                    mockProveedores.reduce((acc, p) => acc + p.calificacion, 0) /
                    mockProveedores.length
                  ).toFixed(1)}
                </p>
              </div>
              <div className="p-3 bg-status-completed-bg rounded-lg">
                <Star className="w-6 h-6 text-status-completed" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Órdenes de Compra</p>
                <p className="text-3xl font-semibold">8</p>
                <p className="text-xs text-muted-foreground mt-1">este mes</p>
              </div>
              <div className="p-3 bg-status-in-progress-bg rounded-lg">
                <Package className="w-6 h-6 text-status-in-progress" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
