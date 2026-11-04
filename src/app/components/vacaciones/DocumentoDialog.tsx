/**
 * DocumentoDialog.tsx — Agrega un documento al expediente laboral del empleado.
 *
 * El archivo (PDF o imagen, máx. 10 MB) se sube al bucket privado `expedientes` de
 * Supabase Storage; también puede registrarse solo que el documento existe en papel.
 * Puede ligarse a la incidencia, vacaciones o finiquito que respalda.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { formatFecha, hoyISO } from "../../lib/fechas";
import { tipoDocumentoInfo, tipoIncidenciaInfo, type Finiquito, type Incidencia, type TipoDocumento } from "../../lib/laboral";
import type { Empleado, Vacacion } from "../../lib/vacaciones";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface DocumentoDialogProps {
  empleado: Empleado | null;
  /** Tipo sugerido al abrir (p. ej. desde un aviso de riesgo). */
  tipoInicial?: TipoDocumento;
  incidencias: Incidencia[];
  vacaciones: Vacacion[];
  finiquitos: Finiquito[];
  onClose: () => void;
  onSaved: () => void;
}

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const TAMANO_MAXIMO = 10 * 1024 * 1024;

export default function DocumentoDialog({ empleado, tipoInicial, incidencias, vacaciones, finiquitos, onClose, onSaved }: DocumentoDialogProps) {
  const [tipo, setTipo] = useState<TipoDocumento>("contrato");
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState("");
  const [firmado, setFirmado] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Registro respaldado, como "incidencia:<id>", "vacacion:<id>" o "finiquito:<id>".
  const [respalda, setRespalda] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!empleado) return;
    setTipo(tipoInicial ?? "contrato");
    setFecha(hoyISO());
    setDescripcion("");
    setFirmado(true);
    setArchivo(null);
    setRespalda("");
  }, [empleado, tipoInicial]);

  const propias = {
    incidencias: incidencias.filter((i) => i.empleado_id === empleado?.id),
    vacaciones: vacaciones.filter((v) => v.empleado_id === empleado?.id),
    finiquitos: finiquitos.filter((f) => f.empleado_id === empleado?.id),
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleado) return;
    if (archivo && archivo.size > TAMANO_MAXIMO) {
      toast.error("El archivo excede 10 MB");
      return;
    }
    setGuardando(true);
    let archivo_path: string | null = null;
    if (archivo) {
      const extension = archivo.name.split(".").pop()?.toLowerCase() || "pdf";
      archivo_path = `${empleado.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("expedientes").upload(archivo_path, archivo, { contentType: archivo.type });
      if (error) {
        setGuardando(false);
        toast.error("No se pudo subir el archivo", { description: error.message });
        return;
      }
    }
    const [clase, id] = respalda.split(":");
    const { error } = await supabase.from("documentos").insert({
      empleado_id: empleado.id,
      tipo,
      fecha,
      descripcion: descripcion.trim() || null,
      archivo_path,
      firmado,
      incidencia_id: clase === "incidencia" ? id : null,
      vacacion_id: clase === "vacacion" ? id : null,
      finiquito_id: clase === "finiquito" ? id : null,
    });
    setGuardando(false);
    if (error) {
      // No dejar el archivo huérfano si el registro falló.
      if (archivo_path) await supabase.storage.from("expedientes").remove([archivo_path]);
      toast.error("No se pudo guardar el documento", { description: error.message });
      return;
    }
    toast.success("Documento agregado al expediente");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!empleado} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agregar documento al expediente</DialogTitle>
          <DialogDescription>{empleado?.nombre}</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="doc-tipo">Tipo de documento *</Label>
              <select id="doc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className={claseCampo}>
                {Object.entries(tipoDocumentoInfo).map(([clave, info]) => (
                  <option key={clave} value={clave}>
                    {info.texto}
                  </option>
                ))}
              </select>
              {tipoDocumentoInfo[tipo].fundamento && (
                <p className="text-xs text-muted-foreground">Fundamento: {tipoDocumentoInfo[tipo].fundamento}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-fecha">Fecha del documento *</Label>
              <Input id="doc-fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-respalda">Respalda a (opcional)</Label>
              <select id="doc-respalda" value={respalda} onChange={(e) => setRespalda(e.target.value)} className={claseCampo}>
                <option value="">— Ninguno —</option>
                {propias.vacaciones.map((v) => (
                  <option key={v.id} value={`vacacion:${v.id}`}>
                    Vacaciones {formatFecha(v.fecha_inicio)}–{formatFecha(v.fecha_fin)}
                  </option>
                ))}
                {propias.incidencias.map((i) => (
                  <option key={i.id} value={`incidencia:${i.id}`}>
                    {tipoIncidenciaInfo[i.tipo].texto} {formatFecha(i.fecha_inicio)}
                  </option>
                ))}
                {propias.finiquitos.map((f) => (
                  <option key={f.id} value={`finiquito:${f.id}`}>
                    Finiquito {formatFecha(f.fecha_terminacion)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="doc-archivo">Archivo (PDF o imagen, máx. 10 MB)</Label>
              <Input
                id="doc-archivo"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Si solo existe en papel, déjalo vacío y conserva el original.</p>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="doc-descripcion">Descripción</Label>
              <textarea id="doc-descripcion" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={claseCampo} />
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={firmado} onChange={(e) => setFirmado(e.target.checked)} className="w-4 h-4 mt-0.5" />
              <span>
                Firmado por el trabajador
                <span className="block text-xs text-muted-foreground">Sin firma, el documento tiene poco valor como prueba.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
