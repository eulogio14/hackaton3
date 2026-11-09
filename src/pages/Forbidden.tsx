import { Link } from "react-router-dom";

export function ForbiddenPage(): JSX.Element {
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-lumon-amber/40 bg-lumon-panel p-8">
      <h1 className="text-lg font-semibold text-lumon-amber">Sin permiso</h1>
      <p className="mt-2 text-sm text-lumon-mint/70">
        Tu rol no tiene el permiso necesario para abrir esta sección. Lumon registró el intento.
      </p>
      <Link to="/files" className="mt-5 inline-block rounded bg-lumon-mint px-4 py-2 text-sm font-semibold text-lumon-ink">
        Volver a archivos
      </Link>
    </section>
  );
}
