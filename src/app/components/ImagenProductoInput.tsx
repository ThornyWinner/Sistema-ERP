/**
 * ImagenProductoInput.tsx — Zona para elegir la imagen de referencia de un producto.
 *
 *  - Clic (o Enter/Espacio con el teclado) abre el selector de archivos.
 *  - También acepta arrastrar y soltar una imagen.
 *  - Valida tipo (PNG, JPG, WEBP) y tamaño (máx. 5 MB) antes de aceptarla.
 *  - Muestra una vista previa con botones para cambiarla o quitarla.
 *
 * No sube nada: entrega el archivo elegido al formulario, que lo sube al guardar.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { TIPOS_IMAGEN, validarImagen } from "../lib/productos";

interface ImagenProductoInputProps {
  /** URL de la imagen guardada (en edición), o null. */
  urlActual: string | null;
  /** Archivo nuevo elegido y aún no guardado, o null. */
  archivo: File | null;
  onElegir: (archivo: File) => void;
  onQuitar: () => void;
  deshabilitado?: boolean;
}

export default function ImagenProductoInput({
  urlActual,
  archivo,
  onElegir,
  onQuitar,
  deshabilitado,
}: ImagenProductoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);

  // URL temporal para previsualizar el archivo elegido (se libera al cambiar).
  useEffect(() => {
    if (!archivo) {
      setVistaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const imagen = vistaPrevia ?? urlActual;

  const recibir = (lista: FileList | null) => {
    const elegido = lista?.[0];
    if (!elegido) return;
    const error = validarImagen(elegido);
    if (error) {
      toast.error(error);
      return;
    }
    onElegir(elegido);
  };

  const abrirSelector = () => {
    if (!deshabilitado) inputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_IMAGEN.join(",")}
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files);
          // Permite volver a elegir el mismo archivo después de quitarlo.
          e.target.value = "";
        }}
      />

      {imagen ? (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border border-border bg-secondary">
            <img src={imagen} alt="Imagen de referencia del producto" className="w-full h-56 object-contain" />
          </div>
          {archivo && (
            <p className="text-xs text-muted-foreground truncate">
              {archivo.name} · {(archivo.size / 1024 / 1024).toFixed(2)} MB · se subirá al guardar
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={abrirSelector}
              disabled={deshabilitado}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Cambiar
            </button>
            <button
              type="button"
              onClick={onQuitar}
              disabled={deshabilitado}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-secondary rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={deshabilitado ? -1 : 0}
          aria-disabled={deshabilitado}
          aria-label="Subir imagen de referencia"
          onClick={abrirSelector}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              abrirSelector();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!deshabilitado) setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (!deshabilitado) recibir(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            deshabilitado
              ? "border-border opacity-50 cursor-not-allowed"
              : arrastrando
                ? "border-primary bg-primary/5 cursor-copy"
                : "border-border hover:border-primary cursor-pointer"
          }`}
        >
          <div className="w-16 h-16 bg-secondary rounded-full mx-auto mb-4 flex items-center justify-center">
            <ImagePlus className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {arrastrando ? "Suelta la imagen aquí" : "Haz clic o arrastra una imagen"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG o WEBP hasta 5MB</p>
        </div>
      )}
    </div>
  );
}
