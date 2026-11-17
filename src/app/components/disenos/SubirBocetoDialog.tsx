/**
 * SubirBocetoDialog.tsx — El diseñador (o el admin primario) sube una versión nueva del
 * boceto de un producto. Se avisa al vendedor para que lo mande al cliente.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { TAMANO_MAX, TIPOS_ARCHIVO, subirPropuesta } from "../../lib/disenos";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface Props {
  /** Producto al que se sube el boceto; null = cerrado. */
  destino: { ordenId: string; detalleId: string; titulo: string; versionNueva: number; cambiosPedidos?: string | null } | null;
  onClose: () => void;
  onSubido: () => void;
}

export default function SubirBocetoDialog({ destino, onClose, onSubido }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (!destino) return;
    setArchivo(null);
    setNotas("");
  }, [destino]);

  useEffect(() => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      setVista(null);
      return;
    }
    const u = URL.createObjectURL(archivo);
    setVista(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);

  const error = archivo && archivo.size > TAMANO_MAX ? "El archivo pasa de 10 MB." : null;

  const subir = async () => {
    if (!destino || !archivo || error) return;
    setSubiendo(true);
    try {
      const r = await subirPropuesta(destino.ordenId, destino.detalleId, archivo, notas);
      toast.success(`Boceto v${r.version} subido`, { description: "Se avisó al vendedor para que lo mande al cliente." });
      onSubido();
    } catch (err: any) {
      toast.error("No se pudo subir el boceto", { description: err?.message });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Dialog open={!!destino} onOpenChange={(o) => !o && !subiendo && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir boceto · versión {destino?.versionNueva}</DialogTitle>
          <DialogDescription>{destino?.titulo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {destino?.cambiosPedidos && (
            <div className="rounded-md bg-status-pending-bg p-3 text-sm text-status-pending-text">
              <p className="font-medium">Cambios que pidió el cliente:</p>
              <p className="mt-1 whitespace-pre-line">{destino.cambiosPedidos}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="boceto-archivo">Imagen o PDF (máx. 10 MB)</Label>
            <input
              id="boceto-archivo"
              type="file"
              accept={TIPOS_ARCHIVO}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {error && <p className="text-sm text-status-pending">{error}</p>}
          </div>
          {vista && (
            <img src={vista} alt="Vista previa del boceto" className="max-h-64 w-full rounded-md border border-border object-contain bg-secondary" />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="boceto-notas">Notas para el vendedor (opcional)</Label>
            <textarea
              id="boceto-notas"
              value={notas}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Colores Pantone, medidas del logo, ubicación…"
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={subiendo}>
            Cancelar
          </Button>
          <Button onClick={subir} disabled={!archivo || !!error || subiendo} className="gap-2">
            <Upload className="w-4 h-4" />
            {subiendo ? "Subiendo…" : "Subir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
