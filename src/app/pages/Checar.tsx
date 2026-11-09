/**
 * Checar.tsx — Reloj checador desde el celular (ruta /checar?sede=<token>).
 *
 * El empleado escanea el código QR pegado en su sede (Establecimiento, Taller de
 * Costura o Taller de Bordado), inicia sesión con su usuario del ERP si hace falta y:
 *  1. Se toma una selfie con la cámara frontal (evita que alguien cheque por otro).
 *  2. El navegador obtiene su ubicación.
 *  3. Pulsa "Registrar entrada" / "Registrar salida".
 *
 * La función registrar_checada de la BD valida el QR, que la persona esté dentro del
 * radio de la sede y la foto; la primera checada del día es la entrada y las demás la
 * salida. Si la entrada pasa de la tolerancia, la BD registra el retardo.
 *
 * Página pensada para celular: va fuera del layout con menú lateral.
 * Cámara y ubicación solo funcionan en HTTPS (o en localhost).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock, Loader2, MapPin, RefreshCw, ScanLine } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import ThemeToggle from "../components/ThemeToggle";

interface EstadoHoy {
  empleado: { id: string; nombre: string; puesto: string | null } | null;
  sede: { nombre: string; configurada: boolean; radio_m: number } | null;
  hoy: string;
  inhabil: string | null;
  horario: { nombre: string; tolerancia_min: number; entrada: string | null; salida: string | null } | null;
  checadas: { tipo: "entrada" | "salida"; hora: string; sede: string | null }[];
}

interface Resultado {
  tipo: "entrada" | "salida";
  hora: string;
  sede: string;
  retardo_min: number | null;
}

type Ubicacion =
  | { estado: "buscando" }
  | { estado: "lista"; lat: number; lng: number; precision: number }
  | { estado: "error"; mensaje: string };

const MAX_ANCHO_FOTO = 640;

export default function Checar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("sede");

  const [estado, setEstado] = useState<EstadoHoy | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const [ubicacion, setUbicacion] = useState<Ubicacion>({ estado: "buscando" });
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Reloj en pantalla.
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc("mi_asistencia_hoy", { p_token: token });
    if (error) setErrorCarga(error.message);
    else setEstado(data as EstadoHoy);
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // --- Cámara frontal ---
  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const iniciarCamara = useCallback(async () => {
    setErrorCamara(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCamara("Este navegador no permite usar la cámara. Abre la página en Chrome o Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setErrorCamara("No se pudo abrir la cámara. Permite el acceso a la cámara para esta página.");
    }
  }, []);

  const tomarFoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const escala = Math.min(1, MAX_ANCHO_FOTO / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Selfie en espejo, como se ve en pantalla.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setFoto(blob);
        setFotoUrl(URL.createObjectURL(blob));
        detenerCamara();
      },
      "image/jpeg",
      0.75
    );
  };

  const repetirFoto = () => {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    setFoto(null);
    setFotoUrl(null);
    void iniciarCamara();
  };

  // --- Ubicación ---
  const pedirUbicacion = useCallback(() => {
    setUbicacion({ estado: "buscando" });
    if (!navigator.geolocation) {
      setUbicacion({ estado: "error", mensaje: "Este navegador no permite obtener la ubicación." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUbicacion({
          estado: "lista",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        setUbicacion({
          estado: "error",
          mensaje:
            err.code === err.PERMISSION_DENIED
              ? "Permite el acceso a tu ubicación para checar."
              : "No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.",
        }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  // Al tener empleado y sede válidos: abre la cámara y pide la ubicación.
  const listoParaChecar = !!estado?.empleado && !!estado?.sede?.configurada;
  useEffect(() => {
    if (!listoParaChecar || resultado) return;
    void iniciarCamara();
    pedirUbicacion();
    return detenerCamara;
  }, [listoParaChecar, resultado, iniciarCamara, pedirUbicacion]);

  useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl); }, [fotoUrl]);

  const siguiente: "entrada" | "salida" =
    estado?.checadas.some((c) => c.tipo === "entrada") ? "salida" : "entrada";

  const registrar = async () => {
    if (!estado?.empleado || !foto || ubicacion.estado !== "lista" || !token) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const ruta = `${estado.empleado.id}/${estado.hoy}/${Date.now()}.jpg`;
      const { error: errorFoto } = await supabase.storage
        .from("asistencia")
        .upload(ruta, foto, { contentType: "image/jpeg", upsert: false });
      if (errorFoto) throw new Error(`No se pudo subir la foto: ${errorFoto.message}`);
      const { data, error } = await supabase.rpc("registrar_checada", {
        p_token: token,
        p_lat: ubicacion.lat,
        p_lng: ubicacion.lng,
        p_precision: ubicacion.precision,
        p_foto_path: ruta,
      });
      if (error) throw new Error(error.message);
      setResultado(data as Resultado);
      void cargar();
    } catch (e: any) {
      setErrorEnvio(e?.message ?? String(e));
    } finally {
      setEnviando(false);
    }
  };

  const hora = ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fechaTexto = ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 py-5 space-y-5">
        {/* Encabezado */}
        <header className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-2 -ml-2 rounded-lg hover:bg-secondary"
            aria-label="Ir al inicio del sistema"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src="/logo-uis.png" alt="Uniformes Industriales de Saltillo" className="h-10 w-auto dark:hidden" />
          <img src="/logo-uis-dark.png" alt="Uniformes Industriales de Saltillo" className="h-10 w-auto hidden dark:block" />
          <ThemeToggle />
        </header>

        {/* Reloj */}
        <section className="text-center">
          <p className="text-4xl font-semibold tabular-nums">{hora}</p>
          <p className="text-sm text-muted-foreground capitalize">{fechaTexto}</p>
        </section>

        {cargando ? (
          <p className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </p>
        ) : errorCarga ? (
          <Aviso tono="error" titulo="No se pudo cargar la información" texto={errorCarga} />
        ) : !estado?.empleado ? (
          <Aviso
            tono="error"
            titulo="Tu usuario no está vinculado a un empleado"
            texto="Pide al administrador que vincule tu usuario en Permisos Vacacionales."
          />
        ) : (
          <>
            {/* Quién, dónde y horario de hoy */}
            <section className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="font-semibold">{estado.empleado.nombre}</p>
              {estado.empleado.puesto && <p className="text-sm text-muted-foreground">{estado.empleado.puesto}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-primary" />
                  {estado.sede?.nombre ?? "Sin sede"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {estado.inhabil
                    ? `Hoy es día inhábil (${estado.inhabil})`
                    : estado.horario?.entrada
                    ? `Hoy ${estado.horario.entrada} – ${estado.horario.salida}`
                    : estado.horario
                    ? "Hoy no es día laboral"
                    : "Sin horario asignado"}
                </span>
              </div>
              {estado.checadas.length > 0 && (
                <ul className="pt-2 border-t border-border text-sm space-y-1">
                  {estado.checadas.map((c, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="capitalize">{c.tipo}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.hora}
                        {c.sede ? ` · ${c.sede}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!token ? (
              <Aviso
                tono="info"
                icono={<ScanLine className="w-6 h-6" />}
                titulo="Escanea el código QR de tu sede"
                texto="Abre la cámara del celular y apunta al código QR pegado en tu lugar de trabajo para checar tu entrada o salida."
              />
            ) : !estado.sede ? (
              <Aviso
                tono="error"
                titulo="Código QR no válido"
                texto="El código pudo haber sido reemplazado. Escanea el QR vigente de la sede."
              />
            ) : !estado.sede.configurada ? (
              <Aviso
                tono="error"
                titulo="Sede sin ubicación configurada"
                texto={`El administrador aún no registra la ubicación de ${estado.sede.nombre}. Avísale para poder checar.`}
              />
            ) : resultado ? (
              /* Resultado */
              <section className="rounded-xl border border-border bg-card p-6 text-center space-y-3" role="status">
                <CheckCircle2 className="w-14 h-14 mx-auto text-status-completed" />
                <p className="text-lg font-semibold">
                  {resultado.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"} a las {resultado.hora}
                </p>
                <p className="text-sm text-muted-foreground">{resultado.sede}</p>
                {resultado.tipo === "entrada" &&
                  (resultado.retardo_min ? (
                    <p className="inline-flex rounded-full bg-status-in-progress-bg px-3 py-1 text-sm font-medium text-status-in-progress-text">
                      Retardo de {resultado.retardo_min} min
                    </p>
                  ) : (
                    <p className="inline-flex rounded-full bg-status-completed-bg px-3 py-1 text-sm font-medium text-status-completed-text">
                      A tiempo
                    </p>
                  ))}
              </section>
            ) : (
              <>
                {/* Paso 1: selfie */}
                <section className="space-y-3">
                  <p className="text-sm font-medium">1. Tómate una foto</p>
                  <div className="relative overflow-hidden rounded-xl border border-border bg-muted aspect-[3/4]">
                    {/* El video queda montado siempre (solo se oculta) para poder reabrir la cámara. */}
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className={`h-full w-full object-cover -scale-x-100 ${fotoUrl ? "hidden" : ""}`}
                      aria-label="Vista previa de la cámara"
                    />
                    {fotoUrl && <img src={fotoUrl} alt="Tu foto para la checada" className="h-full w-full object-cover" />}
                    {errorCamara && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm bg-card">
                        <AlertTriangle className="w-6 h-6 text-status-pending" />
                        <p>{errorCamara}</p>
                        <Button type="button" variant="outline" onClick={() => void iniciarCamara()}>
                          Reintentar
                        </Button>
                      </div>
                    )}
                  </div>
                  {fotoUrl ? (
                    <Button type="button" variant="outline" className="w-full" onClick={repetirFoto} disabled={enviando}>
                      <RefreshCw className="w-4 h-4" /> Repetir foto
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="w-full" onClick={tomarFoto} disabled={!!errorCamara}>
                      <Camera className="w-4 h-4" /> Tomar foto
                    </Button>
                  )}
                </section>

                {/* Paso 2: ubicación */}
                <section className="space-y-2">
                  <p className="text-sm font-medium">2. Tu ubicación</p>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    {ubicacion.estado === "buscando" && (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Buscando tu ubicación…
                      </span>
                    )}
                    {ubicacion.estado === "lista" && (
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-status-completed" /> Ubicación lista (±{ubicacion.precision} m)
                      </span>
                    )}
                    {ubicacion.estado === "error" && (
                      <span className="inline-flex items-center gap-2 text-status-pending-text">
                        <AlertTriangle className="w-4 h-4" /> {ubicacion.mensaje}
                      </span>
                    )}
                    {ubicacion.estado !== "buscando" && (
                      <button type="button" className="text-primary text-xs font-medium hover:underline shrink-0" onClick={pedirUbicacion}>
                        Actualizar
                      </button>
                    )}
                  </div>
                </section>

                {errorEnvio && <Aviso tono="error" titulo="No se registró la checada" texto={errorEnvio} />}

                {/* Paso 3: registrar */}
                <Button
                  type="button"
                  className="w-full h-12 text-base"
                  onClick={registrar}
                  disabled={!foto || ubicacion.estado !== "lista" || enviando}
                >
                  {enviando ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Registrando…
                    </>
                  ) : siguiente === "entrada" ? (
                    "Registrar entrada"
                  ) : (
                    "Registrar salida"
                  )}
                </Button>
                {(!foto || ubicacion.estado !== "lista") && (
                  <p className="text-center text-xs text-muted-foreground">
                    {!foto ? "Toma tu foto" : "Espera a que tu ubicación esté lista"} para poder registrar.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {!window.isSecureContext && (
          <Aviso
            tono="error"
            titulo="Conexión no segura"
            texto="La cámara y la ubicación solo funcionan si la página se abre con https://."
          />
        )}
      </div>
    </div>
  );
}

function Aviso({ tono, titulo, texto, icono }: { tono: "error" | "info"; titulo: string; texto: string; icono?: React.ReactNode }) {
  const clases =
    tono === "error"
      ? "bg-status-pending-bg text-status-pending-text"
      : "bg-secondary text-foreground";
  return (
    <div role={tono === "error" ? "alert" : "status"} className={`rounded-xl p-4 flex gap-3 ${clases}`}>
      <span className="shrink-0 mt-0.5">{icono ?? <AlertTriangle className="w-5 h-5" />}</span>
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-sm opacity-90">{texto}</p>
      </div>
    </div>
  );
}
