/**
 * ContactarProveedorDialog.tsx — Opciones de contacto de un proveedor.
 *
 * Muestra el contacto, teléfono y email del proveedor con acciones directas:
 *  - Llamar (enlace tel:), WhatsApp (wa.me) y copiar el teléfono.
 *  - Enviar correo (enlace mailto:) y copiar el email.
 *
 * Si alguno de los materiales que surte el proveedor está por debajo de su stock
 * mínimo, ofrece "Solicitar reabastecimiento": arma un mensaje con la lista de
 * materiales y la cantidad que falta para llegar al mínimo, listo para enviarse por
 * correo o WhatsApp.
 */
import { toast } from "sonner";
import { Phone, Mail, MessageCircle, Copy, User, AlertTriangle } from "lucide-react";
import type { Material, Proveedor } from "../../data/mockData";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface ContactarProveedorDialogProps {
  proveedor: Proveedor | null;
  /** Materiales cuyo proveedor principal es este proveedor. */
  materiales: Material[];
  onClose: () => void;
}

/**
 * Convierte un teléfono a formato internacional para wa.me (solo dígitos).
 * Un número mexicano de 10 dígitos se completa con la lada de país 52.
 */
function telefonoWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length === 10 ? `52${digitos}` : digitos;
}

async function copiar(texto: string, etiqueta: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${etiqueta} copiado`);
  } catch {
    toast.error(`No se pudo copiar el ${etiqueta.toLowerCase()}`);
  }
}

// Cantidad con hasta 2 decimales, sin ceros sobrantes (12.5, no 12.50).
const formatoCantidad = (n: number) => Number(n.toFixed(2)).toString();

export default function ContactarProveedorDialog({
  proveedor,
  materiales,
  onClose,
}: ContactarProveedorDialogProps) {
  const telefono = proveedor?.telefono.trim() ?? "";
  const email = proveedor?.email.trim() ?? "";
  const whatsapp = telefonoWhatsApp(telefono);

  // Materiales de este proveedor que necesitan reabastecerse.
  const bajoMinimo = materiales.filter((m) => m.stock < m.stockMinimo);

  // Mensaje de solicitud con la cantidad que falta para alcanzar el stock mínimo.
  const saludo = proveedor?.contacto ? `Hola ${proveedor.contacto},` : "Hola,";
  const mensajeReabasto = [
    saludo,
    "",
    "Les solicitamos cotización y disponibilidad de los siguientes materiales:",
    ...bajoMinimo.map(
      (m) => `- ${m.nombre}: ${formatoCantidad(m.stockMinimo - m.stock)} ${m.unidad}`
    ),
    "",
    "Quedamos atentos. Gracias.",
  ].join("\n");
  const asuntoReabasto = "Solicitud de reabastecimiento de materiales";

  const sinDatos = !telefono && !email;

  return (
    <Dialog open={!!proveedor} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contactar proveedor</DialogTitle>
          <DialogDescription>{proveedor?.nombre}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Contacto:</span>
            <span className="font-medium">{proveedor?.contacto || "Sin contacto registrado"}</span>
          </div>

          {sinDatos && (
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg p-3">
              Este proveedor no tiene teléfono ni email registrados.
            </p>
          )}

          {telefono && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{telefono}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`tel:${telefono.replace(/[^\d+]/g, "")}`}>
                    <Phone className="w-4 h-4" />
                    Llamar
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copiar(telefono, "Teléfono")}>
                  <Copy className="w-4 h-4" />
                  Copiar
                </Button>
              </div>
            </div>
          )}

          {email && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm break-all">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">{email}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`mailto:${email}`}>
                    <Mail className="w-4 h-4" />
                    Enviar correo
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copiar(email, "Email")}>
                  <Copy className="w-4 h-4" />
                  Copiar
                </Button>
              </div>
            </div>
          )}

          {/* Solicitud de reabastecimiento con los materiales bajo mínimo */}
          {bajoMinimo.length > 0 && !sinDatos && (
            <div className="rounded-lg bg-status-pending-bg p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-status-pending mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-status-pending-text">
                    {bajoMinimo.length === 1
                      ? "1 material de este proveedor está bajo el mínimo"
                      : `${bajoMinimo.length} materiales de este proveedor están bajo el mínimo`}
                  </p>
                  <ul className="mt-1 text-status-pending-text/90 list-disc pl-4">
                    {bajoMinimo.map((m) => (
                      <li key={m.id}>
                        {m.nombre}: faltan {formatoCantidad(m.stockMinimo - m.stock)} {m.unidad}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {email && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`mailto:${email}?subject=${encodeURIComponent(asuntoReabasto)}&body=${encodeURIComponent(mensajeReabasto)}`}
                    >
                      <Mail className="w-4 h-4" />
                      Solicitar por correo
                    </a>
                  </Button>
                )}
                {telefono && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensajeReabasto)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Solicitar por WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
