export function Loading({ label = "Cargando…" }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-sm text-lumon-mint/70" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-lumon-mint/30 border-t-lumon-mint" />
      {label}
    </div>
  );
}

export function FullScreenLoading({ label = "Verificando sesión…" }: { label?: string }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-lumon-ink">
      <Loading label={label} />
    </div>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div role="alert" className="rounded border border-lumon-danger/50 bg-lumon-danger/10 p-3 text-sm text-lumon-danger">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 underline">
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
