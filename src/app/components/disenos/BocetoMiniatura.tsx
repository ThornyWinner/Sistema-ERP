/**
 * BocetoMiniatura.tsx — Vista previa de un boceto del bucket privado `disenos`
 * (enlace firmado de 1 hora). Al hacer clic se abre en una pestaña nueva.
 */
import { useEffect, useState } from "react";
import { FileText, ImageOff } from "lucide-react";
import { enlaceArchivo, esPdf, type PropuestaDiseno } from "../../lib/disenos";

export default function BocetoMiniatura({
  propuesta,
  className = "h-20 w-20",
}: {
  propuesta: PropuestaDiseno;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setUrl(null);
    setFallo(false);
    enlaceArchivo(propuesta.archivoPath, 3600)
      .then((u) => vigente && setUrl(u))
      .catch(() => vigente && setFallo(true));
    return () => {
      vigente = false;
    };
  }, [propuesta.archivoPath]);

  const base = `${className} shrink-0 rounded-md border border-border bg-secondary overflow-hidden flex items-center justify-center`;

  if (fallo) {
    return (
      <div className={base} title="No se pudo cargar el boceto">
        <ImageOff className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }
  if (!url) return <div className={`${base} animate-pulse`} />;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${base} hover:ring-2 hover:ring-primary/40 transition`}
      title={`Ver boceto v${propuesta.version}`}
    >
      {esPdf(propuesta) ? (
        <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <FileText className="w-6 h-6" /> PDF
        </span>
      ) : (
        <img src={url} alt={`Boceto versión ${propuesta.version}`} className="h-full w-full object-cover" />
      )}
    </a>
  );
}
