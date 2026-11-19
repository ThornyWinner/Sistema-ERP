/**
 * ContactarClienteDialog.tsx — Enviar al cliente un mensaje sobre una orden o cotización.
 *
 * El vendedor elige una plantilla (solo las que aplican al estado del documento),
 * puede ajustar el texto y lo envía por WhatsApp (wa.me) o correo (mailto:), o lo copia.
 *
 * WhatsApp no permite adjuntar archivos desde un enlace: por eso el diálogo ofrece
 * "Guardar en PDF" para adjuntarlo después en el chat.
 */
import { useEffect, useState } from "react";
import { Copy, FileDown, Mail, MessageCircle, Phone } from "lucide-react";
import { copiarTexto, enlaceWhatsApp } from "../lib/contacto";
import type { PlantillaMensaje } from "../lib/notaOrden";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

interface ContactarClienteDialogProps {
  open: boolean;
  onClose: () => void;
  cliente: string;
  telefono?: string;
  email?: string;
  /** Plantillas disponibles; la primera es la sugerida. */
  plantillas: PlantillaMensaje[];
  /** Folio del documento, para el asunto del correo. */
  folio: string;
  /** Imprime / guarda el documento en PDF (sin esto no se ofrece el PDF). */
  onGuardarPdf?: () => void;
  /** Texto del botón de PDF (p. ej. "Guardar nota en PDF"). */
  textoPdf?: string;
  /** Se llama al abrir WhatsApp o el correo (p. ej. para marcar la cotización como enviada). */
  onEnviado?: (tipo: string, canal: "whatsapp" | "correo") => void;
}

export default function ContactarClienteDialog({
  open,
  onClose,
  cliente,
  telefono: telefonoProp,
  email: emailProp,
  plantillas,
  folio,
  onGuardarPdf,
  textoPdf = "Guardar en PDF",
  onEnviado,
}: ContactarClienteDialogProps) {
  const [tipo, setTipo] = useState(plantillas[0]?.tipo ?? "");
  const [texto, setTexto] = useState(plantillas[0]?.texto ?? "");

  // Al abrir, se parte de la plantilla sugerida con los datos actuales.
  useEffect(() => {
    if (!open) return;
    setTipo(plantillas[0]?.tipo ?? "");
    setTexto(plantillas[0]?.texto ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const elegir = (t: string) => {
    const p = plantillas.find((x) => x.tipo === t);
    if (!p) return;
    setTipo(t);
    setTexto(p.texto);
  };

  const telefono = telefonoProp?.trim() ?? "";
  const email = emailProp?.trim() ?? "";
  const asunto = `${folio} — ${plantillas.find((p) => p.tipo === tipo)?.titulo ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Contactar cliente</DialogTitle>
          <DialogDescription>
            {cliente}
            {telefono && (
              <span className="inline-flex items-center gap-1 ml-2">
                <Phone className="w-3.5 h-3.5" />
                {telefono}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plantillas que aplican al estado del documento */}
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de mensaje">
              {plantillas.map((p) => (
                <Button
                  key={p.tipo}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={tipo === p.tipo}
                  variant={tipo === p.tipo ? "default" : "outline"}
                  onClick={() => elegir(p.tipo)}
                >
                  {p.titulo}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-texto">Texto (puedes ajustarlo antes de enviar)</Label>
            <textarea
              id="cc-texto"
              rows={11}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>

          {!telefono && (
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg p-3">
              No hay teléfono registrado para este cliente. Agrégalo para enviarle WhatsApp.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {telefono && (
              <Button asChild>
                <a
                  href={enlaceWhatsApp(telefono, texto)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onEnviado?.(tipo, "whatsapp")}
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp
                </a>
              </Button>
            )}
            {email && (
              <Button asChild variant="outline">
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`}
                  onClick={() => onEnviado?.(tipo, "correo")}
                >
                  <Mail className="w-4 h-4" />
                  Enviar por correo
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => copiarTexto(texto, "Mensaje")}>
              <Copy className="w-4 h-4" />
              Copiar
            </Button>
            {onGuardarPdf && (
              <Button variant="ghost" onClick={onGuardarPdf}>
                <FileDown className="w-4 h-4" />
                {textoPdf}
              </Button>
            )}
          </div>
          {onGuardarPdf && (
            <p className="text-xs text-muted-foreground">
              Para mandar el PDF por WhatsApp o correo: guárdalo (en el diálogo de impresión elige
              “Guardar como PDF”) y adjúntalo en el chat.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
