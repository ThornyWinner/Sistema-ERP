/**
 * ContactarClienteDialog.tsx — Enviar al cliente un mensaje sobre su orden.
 *
 * El vendedor elige una plantilla (resumen, avance, lista para entrega o recordatorio
 * de saldo; solo las que aplican al estado de la orden), puede ajustar el texto y lo
 * envía por WhatsApp (wa.me) o correo (mailto:), o lo copia.
 *
 * WhatsApp no permite adjuntar archivos desde un enlace: por eso el diálogo ofrece
 * "Guardar nota en PDF" para adjuntarla después en el chat.
 */
import { useEffect, useMemo, useState } from "react";
import { Copy, FileDown, Mail, MessageCircle, Phone } from "lucide-react";
import type { Orden } from "../data/mockData";
import { copiarTexto, enlaceWhatsApp } from "../lib/contacto";
import { imprimirNotaOrden, plantillasMensaje, type TipoMensaje } from "../lib/notaOrden";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

interface ContactarClienteDialogProps {
  orden: Orden;
  open: boolean;
  onClose: () => void;
}

export default function ContactarClienteDialog({ orden, open, onClose }: ContactarClienteDialogProps) {
  const plantillas = useMemo(() => plantillasMensaje(orden), [orden]);
  const [tipo, setTipo] = useState<TipoMensaje>(plantillas[0].tipo);
  const [texto, setTexto] = useState(plantillas[0].texto);

  // Al abrir, se parte de la plantilla sugerida con los datos actuales de la orden.
  useEffect(() => {
    if (!open) return;
    setTipo(plantillas[0].tipo);
    setTexto(plantillas[0].texto);
  }, [open, plantillas]);

  const elegir = (t: TipoMensaje) => {
    const p = plantillas.find((x) => x.tipo === t);
    if (!p) return;
    setTipo(t);
    setTexto(p.texto);
  };

  const telefono = orden.clienteTelefono?.trim() ?? "";
  const email = orden.clienteEmail?.trim() ?? "";
  const asunto = `Orden ${orden.numero} — ${plantillas.find((p) => p.tipo === tipo)?.titulo ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Contactar cliente</DialogTitle>
          <DialogDescription>
            {orden.cliente}
            {telefono && (
              <span className="inline-flex items-center gap-1 ml-2">
                <Phone className="w-3.5 h-3.5" />
                {telefono}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plantillas que aplican al estado de la orden */}
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
              El cliente no tiene teléfono registrado. Agrégalo en el catálogo de clientes o editando la
              orden para enviarle WhatsApp.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {telefono && (
              <Button asChild>
                <a href={enlaceWhatsApp(telefono, texto)} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp
                </a>
              </Button>
            )}
            {email && (
              <Button asChild variant="outline">
                <a href={`mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`}>
                  <Mail className="w-4 h-4" />
                  Enviar por correo
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => copiarTexto(texto, "Mensaje")}>
              <Copy className="w-4 h-4" />
              Copiar
            </Button>
            <Button variant="ghost" onClick={() => imprimirNotaOrden(orden)}>
              <FileDown className="w-4 h-4" />
              Guardar nota en PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Para mandar la nota por WhatsApp o correo: guárdala en PDF (en el diálogo de impresión elige
            “Guardar como PDF”) y adjúntala en el chat.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
