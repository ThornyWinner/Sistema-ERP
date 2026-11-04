/**
 * Dashboard.tsx — Panel principal (ruta "/"), distinto según el rol del usuario:
 *  - admin_primario / admin_secundario → DashboardGeneral (todo el negocio).
 *  - vendedor                          → DashboardVendedor (sus ventas).
 *  - roles de taller                   → DashboardTaller (el trabajo de su taller).
 *
 * También muestra la guía de usuario (UserGuide), que se abre automáticamente la
 * primera vez que cada usuario entra (se recuerda en localStorage) y con el botón
 * "Ver guía de usuario".
 */
import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useErpData } from "../context/ErpDataContext";
import { roleLabels } from "../utils/permissions";
import type { Taller } from "../data/mockData";
import type { UserRole } from "../types/auth";
import UserGuide from "../components/UserGuide";
import { Button } from "../components/ui/button";
import DashboardGeneral from "../components/dashboard/DashboardGeneral";
import DashboardVendedor from "../components/dashboard/DashboardVendedor";
import DashboardTaller, { nombreTaller } from "../components/dashboard/DashboardTaller";

/** Taller que atiende cada rol de taller. */
const tallerDeRol: Partial<Record<UserRole, Taller>> = {
  disenador: "diseno",
  sublimador: "sublimacion",
  cortador: "corte",
  costurera: "costura",
  bordador: "bordado",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { loading } = useErpData();
  // Visibilidad del diálogo de guía de usuario.
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Mostrar guía solo la primera vez que se accede
    // (la marca se guarda por usuario en localStorage, por lo que es por navegador).
    const hasSeenGuide = localStorage.getItem(`guide_seen_${user?.id}`);
    if (!hasSeenGuide && user) {
      setShowGuide(true);
      localStorage.setItem(`guide_seen_${user.id}`, 'true');
    }
  }, [user]);

  if (!user) return null;

  const taller = tallerDeRol[user.rol];
  const esAdmin = user.rol === "admin_primario" || user.rol === "admin_secundario";
  const titulo = esAdmin
    ? "Dashboard"
    : user.rol === "vendedor"
    ? "Mis Ventas"
    : taller
    ? `Taller de ${nombreTaller[taller]}`
    : "Dashboard";

  return (
    <div className="p-6 space-y-6">
      <UserGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {/* Encabezado: saludo con nombre y rol + botón para reabrir la guía */}
      <div className="flex items-center justify-between">
        <div>
          <h1>{titulo}</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido, {user.nombre} - {roleLabels[user.rol]}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-2"
        >
          <Info className="w-4 h-4" />
          Ver guía de usuario
        </Button>
      </div>

      {/* Mientras llegan los datos del usuario no se muestran indicadores en cero */}
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Cargando información…</p>
      ) : (
        <>
          {esAdmin && <DashboardGeneral />}
          {user.rol === "vendedor" && <DashboardVendedor />}
          {taller && <DashboardTaller taller={taller} />}
        </>
      )}
    </div>
  );
}
