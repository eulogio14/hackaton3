import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, isAbortError, messageFor } from "../lib/api";
import { formatDate, readInt, safeExternalUrl } from "../lib/format";
import { useRealtimeEvent } from "../lib/realtime";
import type { Department, RefinerPage } from "../lib/types";
import { ErrorNotice, Loading } from "../components/Loading";

const SIZES = [10, 25, 50] as const;

function isSize(value: number): value is (typeof SIZES)[number] {
  return SIZES.includes(value as (typeof SIZES)[number]);
}

export function RefinersPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, readInt(params.get("page"), 0));
  const rawSize = readInt(params.get("size"), 10);
  const size = isSize(rawSize) ? rawSize : 10;
  const departmentId = params.get("departmentId") ?? "";
  const query = params.get("q") ?? "";

  const [search, setSearch] = useState(query);
  const [data, setData] = useState<RefinerPage | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  useEffect(() => setSearch(query), [query]);

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = window.setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (search.trim()) next.set("q", search.trim());
          else next.delete("q");
          next.set("page", "0");
          return next;
        },
        { replace: true },
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search, query, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Department[]>("/departments", { signal: controller.signal })
      .then((result) => setDepartments(result))
      .catch(() => undefined);
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    const request = seq.current + 1;
    seq.current = request;
    setLoading(true);
    setError(null);
    const searchParams = new URLSearchParams();
    searchParams.set("page", String(page));
    searchParams.set("size", String(size));
    if (departmentId) searchParams.set("departmentId", departmentId);
    if (query) searchParams.set("q", query);
    apiRequest<RefinerPage>(`/refiners?${searchParams.toString()}`, { signal: controller.signal })
      .then((result) => {
        if (seq.current !== request) return;
        setData(result);
        if (result.totalPages > 0 && page > result.totalPages - 1) {
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set("page", String(result.totalPages - 1));
              return next;
            },
            { replace: true },
          );
        }
      })
      .catch((caught: unknown) => {
        if (isAbortError(caught) || seq.current !== request) return;
        setError(messageFor(caught));
      })
      .finally(() => {
        if (seq.current === request) setLoading(false);
      });
    return () => controller.abort();
  }, [page, size, departmentId, query, reloadKey, setParams]);

  useRealtimeEvent("refiner.updated", () => setReloadKey((value) => value + 1));

  const update = (key: string, value: string | null): void => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.set("page", "0");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-lumon-mint">Expedientes del personal</h1>
          <p className="text-sm text-lumon-mint/60">Directorio del piso, con fotocheck cuando existe.</p>
        </div>
        <p className="font-mono text-xs text-lumon-mint/50">{data ? `${data.totalElements} expedientes` : "—"}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="refiner-search" className="block text-xs text-lumon-mint/60">
            Buscar
          </label>
          <input
            id="refiner-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o cargo"
            className="mt-1 w-full rounded border border-lumon-line bg-lumon-panel px-3 py-2 text-sm text-lumon-mint outline-none focus:border-lumon-mint"
          />
        </div>
        <div>
          <label htmlFor="department" className="block text-xs text-lumon-mint/60">
            Departamento
          </label>
          <select
            id="department"
            value={departmentId}
            onChange={(event) => update("departmentId", event.target.value || null)}
            className="mt-1 rounded border border-lumon-line bg-lumon-panel px-3 py-2 text-sm text-lumon-mint"
          >
            <option value="">Todos</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="refiner-size" className="block text-xs text-lumon-mint/60">
            Por página
          </label>
          <select
            id="refiner-size"
            value={size}
            onChange={(event) => update("size", event.target.value)}
            className="mt-1 rounded border border-lumon-line bg-lumon-panel px-3 py-2 text-sm text-lumon-mint"
          >
            {SIZES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="mt-5">
          <ErrorNotice message={error} onRetry={() => setReloadKey((value) => value + 1)} />
        </div>
      ) : null}

      {loading && !data ? <Loading label="Cargando expedientes…" /> : null}

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.content.map((refiner) => {
          const badgeUrl = safeExternalUrl(refiner.badge?.url);
          return (
            <li key={refiner.id} className="rounded border border-lumon-line bg-lumon-panel p-4">
              <div className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-lumon-line bg-lumon-ink">
                  {badgeUrl ? (
                    <img
                      src={badgeUrl}
                      alt={`Fotocheck de ${refiner.fullName}`}
                      width={refiner.badge?.width ?? 512}
                      height={refiner.badge?.height ?? 512}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-mono text-[10px] text-lumon-mint/40">
                      SIN FOTO
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-lumon-mint">{refiner.fullName}</p>
                  <p className="truncate text-xs text-lumon-mint/60">{refiner.title}</p>
                  <p className="truncate font-mono text-[11px] text-lumon-mint/40">
                    {refiner.department.name} · ext. {refiner.extension}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-lumon-mint/60">{refiner.bio}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-lumon-mint/40">
                <span>v{refiner.version} · {formatDate(refiner.updatedAt)}</span>
                <Link to={`/refiners/${refiner.id}`} className="text-lumon-mint underline">
                  Abrir
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && data?.content.length === 0 ? (
        <p className="mt-6 text-center text-sm text-lumon-mint/60">No hay expedientes que coincidan.</p>
      ) : null}

      <nav aria-label="Paginación de expedientes" className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => update("page", String(Math.max(0, page - 1)))}
          disabled={page <= 0 || loading}
          className="rounded border border-lumon-line px-3 py-1.5 text-lumon-mint/80 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="font-mono text-xs text-lumon-mint/60">
          Página {data?.totalPages === 0 ? 0 : page + 1} de {data?.totalPages ?? 0}
        </span>
        <button
          type="button"
          onClick={() => update("page", String(page + 1))}
          disabled={loading || page + 1 >= (data?.totalPages ?? 0)}
          className="rounded border border-lumon-line px-3 py-1.5 text-lumon-mint/80 disabled:opacity-40"
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
