import { Link } from "react-router-dom";

export function NotFoundPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-lumon-ink p-6">
      <div className="text-center">
        <p className="font-mono text-6xl font-bold text-lumon-mint/30">404</p>
        <h1 className="mt-3 text-lg font-semibold text-lumon-mint">Esta puerta no existe</h1>
        <p className="mt-2 text-sm text-lumon-mint/60">El piso no tiene una ruta con esa dirección.</p>
        <Link to="/files" className="mt-5 inline-block rounded bg-lumon-mint px-4 py-2 text-sm font-semibold text-lumon-ink">
          Ir a archivos
        </Link>
      </div>
    </main>
  );
}
