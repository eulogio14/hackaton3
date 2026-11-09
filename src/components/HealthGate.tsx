import { useEffect, useState } from "react";
import { apiRequest, isApiError } from "../lib/api";

type Health = "checking" | "ok" | "down";

export function HealthGate({ children }: { children: React.ReactNode }): JSX.Element {
  const [health, setHealth] = useState<Health>("checking");
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let failures = 0;

    const check = async (): Promise<void> => {
      try {
        await apiRequest<{ status: string }>("/meta/health", { anonymous: true, retries: 0, skipAuthRefresh: true });
        if (!cancelled) setHealth("ok");
      } catch (error) {
        if (cancelled) return;
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          setHealth("ok");
          return;
        }
        failures += 1;
        setHealth("down");
        const wait = Math.min(15000, 1000 * 2 ** failures);
        timer = window.setTimeout(() => void check(), wait);
      }
    };

    setHealth("checking");
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt, manual]);

  if (health === "ok") return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-lumon-ink p-6">
      <div className="w-full max-w-md rounded-lg border border-lumon-line bg-lumon-panel p-8 text-center">
        <h1 className="text-lg font-semibold text-lumon-mint">Conectando con Lumon…</h1>
        <p className="mt-3 text-sm text-lumon-mint/70">
          {health === "down"
            ? "La API no responde todavía. Reintentaremos automáticamente."
            : "Verificando el estado del servicio."}
        </p>
        {health === "down" ? (
          <button
            type="button"
            onClick={() => {
              setAttempt((value) => value + 1);
              setManual((value) => value + 1);
            }}
            className="mt-5 rounded bg-lumon-mint px-4 py-2 text-sm font-semibold text-lumon-ink"
          >
            Reintentar ahora
          </button>
        ) : null}
      </div>
    </main>
  );
}
