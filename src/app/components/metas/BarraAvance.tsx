/**
 * BarraAvance.tsx — Barra de avance hacia una meta, con marca opcional del ritmo
 * esperado a la fecha. Verde al cumplirse, ámbar si va por debajo del ritmo.
 */
interface Props {
  valor: number;
  meta: number;
  /** Lo que debería llevar a hoy (se marca con una línea vertical). */
  esperado?: number | null;
  /** Barra delgada para tablas. */
  compacta?: boolean;
}

export default function BarraAvance({ valor, meta, esperado, compacta }: Props) {
  const pct = meta > 0 ? Math.min((valor / meta) * 100, 100) : 0;
  const marca = esperado != null && meta > 0 ? Math.min((esperado / meta) * 100, 100) : null;
  const cumplida = meta > 0 && valor >= meta;
  const atrasada = !cumplida && esperado != null && valor < esperado;
  const color = cumplida ? "bg-status-completed" : atrasada ? "bg-status-in-progress" : "bg-primary";

  return (
    <div
      className={`relative w-full rounded-full bg-secondary overflow-hidden ${compacta ? "h-2" : "h-3"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      {marca != null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/60"
          style={{ left: `${marca}%` }}
          title="Ritmo esperado a hoy"
        />
      )}
    </div>
  );
}
