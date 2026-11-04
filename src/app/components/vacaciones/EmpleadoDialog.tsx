/**
 * EmpleadoDialog.tsx — Alta, edición y baja de un empleado del control de vacaciones.
 *
 * Datos: nombre, puesto, fecha de ingreso (de ella depende la antigüedad), salario
 * diario y porcentaje de prima vacacional (mínimo 25 %, Art. 80 LFT), RFC, CURP y NSS
 * (aparecen en el finiquito impreso), usuario del sistema vinculado (opcional), si está
 * activo y notas. La baja se registra desde la pestaña Terminación.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { hoyISO } from "../../lib/fechas";
import type { Empleado } from "../../lib/vacaciones";
import type { User } from "../../types/auth";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface EmpleadoDialogProps {
  /** Empleado a editar, "nuevo" para dar de alta, o null si el diálogo está cerrado. */
  empleado: Empleado | "nuevo" | null;
  /** Usuarios del sistema que se pueden vincular. */
  usuarios: User[];
  /** Usuarios ya vinculados a otro empleado (no se ofrecen). */
  usuariosOcupados: Set<string>;
  onClose: () => void;
  /** Se llama tras guardar o eliminar, para recargar la lista. */
  onSaved: () => void;
}

const VACIO = {
  nombre: "",
  puesto: "",
  fecha_ingreso: "",
  salario_diario: "",
  porcentaje_prima: "25",
  rfc: "",
  curp: "",
  nss: "",
  usuario_id: "",
  activo: true,
  notas: "",
};

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function EmpleadoDialog({ empleado, usuarios, usuariosOcupados, onClose, onSaved }: EmpleadoDialogProps) {
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const editando = empleado && empleado !== "nuevo" ? empleado : null;

  // Al abrir, carga los datos del empleado en edición o deja el formulario vacío.
  useEffect(() => {
    if (!empleado) return;
    setForm(
      editando
        ? {
            nombre: editando.nombre,
            puesto: editando.puesto ?? "",
            fecha_ingreso: editando.fecha_ingreso,
            salario_diario: String(editando.salario_diario),
            porcentaje_prima: String(editando.porcentaje_prima),
            rfc: editando.rfc ?? "",
            curp: editando.curp ?? "",
            nss: editando.nss ?? "",
            usuario_id: editando.usuario_id ?? "",
            activo: editando.activo,
            notas: editando.notas ?? "",
          }
        : VACIO
    );
  }, [empleado]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const fila = {
      nombre: form.nombre.trim(),
      puesto: form.puesto.trim() || null,
      fecha_ingreso: form.fecha_ingreso,
      salario_diario: Number(form.salario_diario) || 0,
      porcentaje_prima: Number(form.porcentaje_prima) || 25,
      rfc: form.rfc.trim().toUpperCase() || null,
      curp: form.curp.trim().toUpperCase() || null,
      nss: form.nss.trim() || null,
      usuario_id: form.usuario_id || null,
      activo: form.activo,
      notas: form.notas.trim() || null,
    };
    const { error } = editando
      ? await supabase.from("empleados").update(fila).eq("id", editando.id)
      : await supabase.from("empleados").insert(fila);
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar el empleado", { description: error.message });
      return;
    }
    toast.success(editando ? "Empleado actualizado" : "Empleado registrado");
    onSaved();
    onClose();
  };

  const eliminar = async () => {
    if (!editando) return;
    if (!confirm(`¿Eliminar a ${editando.nombre} y todo su historial de vacaciones? Si ya no labora, es preferible marcarlo como inactivo.`)) return;
    const { error } = await supabase.from("empleados").delete().eq("id", editando.id);
    if (error) {
      toast.error("No se pudo eliminar el empleado", { description: error.message });
      return;
    }
    toast.success("Empleado eliminado");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!empleado} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
          <DialogDescription>
            La fecha de ingreso determina la antigüedad y los días de vacaciones que le corresponden.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="emp-nombre">Nombre completo *</Label>
              <Input id="emp-nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-puesto">Puesto</Label>
              <Input id="emp-puesto" value={form.puesto} placeholder="Ej: Costurera" onChange={(e) => setForm({ ...form, puesto: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-ingreso">Fecha de ingreso *</Label>
              <Input id="emp-ingreso" type="date" required max={hoyISO()} value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-salario">Salario diario *</Label>
              <Input id="emp-salario" type="number" required min="0" step="0.01" value={form.salario_diario} onChange={(e) => setForm({ ...form, salario_diario: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-prima">Prima vacacional (%) *</Label>
              <Input
                id="emp-prima"
                type="number"
                required
                min="25"
                max="100"
                step="0.01"
                title="La LFT exige al menos 25 % (Art. 80)"
                value={form.porcentaje_prima}
                onChange={(e) => setForm({ ...form, porcentaje_prima: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emp-rfc">RFC</Label>
                <Input id="emp-rfc" maxLength={13} value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-curp">CURP</Label>
                <Input id="emp-curp" maxLength={18} value={form.curp} onChange={(e) => setForm({ ...form, curp: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-nss">NSS (IMSS)</Label>
                <Input id="emp-nss" maxLength={11} inputMode="numeric" value={form.nss} onChange={(e) => setForm({ ...form, nss: e.target.value })} />
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="emp-usuario">Usuario del sistema (opcional)</Label>
              <select
                id="emp-usuario"
                value={form.usuario_id}
                onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
                className={claseCampo}
              >
                <option value="">Sin usuario</option>
                {usuarios
                  .filter((u) => u.id === form.usuario_id || !usuariosOcupados.has(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.username})
                    </option>
                  ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="emp-notas">Notas</Label>
              <textarea id="emp-notas" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={claseCampo} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="w-4 h-4" />
              Labora actualmente (activo)
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editando ? (
              <Button type="button" variant="destructive" onClick={eliminar}>
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
