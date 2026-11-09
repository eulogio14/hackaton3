/* Praise Kier */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest, apiRequestWithMeta, isAbortError, isApiError, messageFor } from "../lib/api";
import { useRealtimeEvent } from "../lib/realtime";
import type { Department, Refiner, RefinerPatch } from "../lib/types";
import { ErrorNotice, Loading } from "../components/Loading";

interface FormState {
  title: string;
  extension: string;
  bio: string;
  departmentId: string;
}

interface Conflict {
  server: Refiner;
  etag: string | null;
  mine: FormState;
}

function formFrom(refiner: Refiner): FormState {
  return {
    title: refiner.title,
    extension: refiner.extension,
    bio: refiner.bio,
    departmentId: String(refiner.department.id),
  };
}

export function RefinerEditPage(): JSX.Element {
  const { id } = useParams();
  const refinerId = Number(id);
  const navigate = useNavigate();
  const [refiner, setRefiner] = useState<Refiner | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUpdate, setRemoteUpdate] = useState<number | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(refinerId) || refinerId <= 0) {
      setError("El expediente no existe.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      apiRequestWithMeta<Refiner>(`/refiners/${refinerId}`, { signal: controller.signal }),
      apiRequest<Department[]>("/departments", { signal: controller.signal }),
    ])
      .then(([result, nextDepartments]) => {
        setRefiner(result.data);
        setEtag(result.etag);
        setForm(formFrom(result.data));
        setDepartments(nextDepartments);
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught)) setError(messageFor(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refinerId, reloadKey]);

  useRealtimeEvent("refiner.updated", (event) => {
    const data = event.data as { id?: number; version?: number } | null;
    if (data?.id !== refinerId) return;
    setRemoteUpdate(data.version ?? -1);
  });

  const dirty = useMemo(() => {
    if (!refiner || !form) return false;
    const original = formFrom(refiner);
    return (
      original.title !== form.title ||
      original.extension !== form.extension ||
      original.bio !== form.bio ||
      original.departmentId !== form.departmentId
    );
  }, [refiner, form]);

  const patchFrom = (state: FormState): RefinerPatch => ({
    title: state.title.trim(),
    extension: state.extension.trim(),
    bio: state.bio,
    departmentId: Number(state.departmentId),
  });

  const saveWith = async (state: FormState, match: string | null): Promise<void> => {
    if (!match) {
      setError("No hay ETag disponible. Vuelve a abrir el expediente.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequestWithMeta<Refiner>(`/refiners/${refinerId}`, {
        method: "PATCH",
        headers: { "If-Match": match },
        body: patchFrom(state),
      });
      setRefiner(result.data);
      setEtag(result.etag);
      setForm(formFrom(result.data));
      setConflict(null);
      navigate(`/refiners/${refinerId}`, { replace: true });
    } catch (caught) {
      if (isApiError(caught) && caught.status === 412) {
        const details = caught.details;
        const current =
          typeof details === "object" && details !== null && "current" in details
            ? ((details as { current?: Refiner }).current ?? null)
            : null;
        if (current) {
          setConflict({ server: current, etag: caught.etag, mine: state });
        } else {
          setError("El expediente cambió. Recarga para ver la versión actual.");
        }
      } else {
        setError(messageFor(caught));
      }
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!form) return;
    void saveWith(form, etag);
  };

  if (loading && !refiner) return <Loading label="Cargando expediente…" />;
  if (error && !refiner) {
    return (
      <section>
        <ErrorNotice message={error} onRetry={() => setReloadKey((value) => value + 1)} />
        <Link to="/refiners" className="mt-4 inline-block text-sm text-lumon-mint underline">
          Volver al directorio
        </Link>
      </section>
    );
  }
  if (!refiner || !form) return <Loading />;

  const conflictFields: Array<{ key: keyof FormState; label: string }> = [
    { key: "title", label: "Cargo" },
    { key: "extension", label: "Extensión" },
    { key: "bio", label: "Biografía" },
    { key: "departmentId", label: "Departamento" },
  ];

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to={`/refiners/${refinerId}`} className="text-xs text-lumon-mint/60 underline">
          ← Expediente
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-lumon-mint">Editar expediente</h1>
        <p className="font-mono text-xs text-lumon-mint/40">Versión {refiner.version} · ETag {etag ?? "—"}</p>
      </div>

      {remoteUpdate !== null ? (
        <p role="alert" className="rounded border border-lumon-amber/50 bg-lumon-amber/10 p-3 text-sm text-lumon-amber">
          Llegó una actualización de este expediente (versión {remoteUpdate}) mientras editabas. Revisa antes de
          guardar para no sobrescribir a nadie.
        </p>
      ) : null}

      {error ? <ErrorNotice message={error} /> : null}

      {conflict ? (
        <div className="rounded border border-lumon-danger/50 bg-lumon-danger/10 p-4">
          <h2 className="text-sm font-semibold text-lumon-danger">Conflicto de versión</h2>
          <p className="mt-1 text-sm text-lumon-danger/90">
            Otra persona cambió este expediente. Elige qué versión conservar.
          </p>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-lumon-mint/50">
              <tr>
                <th className="py-1">Campo</th>
                <th className="py-1">Tu versión</th>
                <th className="py-1">Servidor</th>
              </tr>
            </thead>
            <tbody>
              {conflictFields.map(({ key, label }) => {
                const serverValue =
                  key === "departmentId" ? String(conflict.server.department.id) : conflict.server[key];
                return (
                  <tr key={key} className="border-t border-lumon-line/60">
                    <td className="py-1 text-lumon-mint/70">{label}</td>
                    <td className="max-w-[220px] break-words py-1 text-lumon-amber">{conflict.mine[key]}</td>
                    <td className="max-w-[220px] break-words py-1 text-lumon-mint">{serverValue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setRefiner(conflict.server);
                setEtag(conflict.etag);
                setForm(formFrom(conflict.server));
                setConflict(null);
              }}
              className="rounded border border-lumon-line px-3 py-1.5 text-sm text-lumon-mint"
            >
              Usar la versión del servidor
            </button>
            <button
              type="button"
              onClick={() => void saveWith(conflict.mine, conflict.etag)}
              className="rounded bg-lumon-danger px-3 py-1.5 text-sm font-semibold text-lumon-ink"
            >
              Guardar mi versión sobre la nueva
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="rounded border border-lumon-line px-3 py-1.5 text-sm text-lumon-mint/70"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4 rounded border border-lumon-line bg-lumon-panel p-4">
        <div>
          <label htmlFor="title" className="block text-xs text-lumon-mint/60">
            Cargo
          </label>
          <input
            id="title"
            required
            minLength={1}
            maxLength={200}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="mt-1 w-full rounded border border-lumon-line bg-lumon-ink px-3 py-2 text-sm text-lumon-mint"
          />
        </div>
        <div>
          <label htmlFor="extension" className="block text-xs text-lumon-mint/60">
            Extensión
          </label>
          <input
            id="extension"
            required
            pattern="[0-9]{3,6}"
            value={form.extension}
            onChange={(event) => setForm({ ...form, extension: event.target.value })}
            className="mt-1 w-full rounded border border-lumon-line bg-lumon-ink px-3 py-2 text-sm text-lumon-mint"
          />
        </div>
        <div>
          <label htmlFor="departmentId" className="block text-xs text-lumon-mint/60">
            Departamento
          </label>
          <select
            id="departmentId"
            value={form.departmentId}
            onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
            className="mt-1 w-full rounded border border-lumon-line bg-lumon-ink px-3 py-2 text-sm text-lumon-mint"
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bio" className="block text-xs text-lumon-mint/60">
            Biografía
          </label>
          <textarea
            id="bio"
            rows={5}
            maxLength={2000}
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
            className="mt-1 w-full rounded border border-lumon-line bg-lumon-ink px-3 py-2 text-sm text-lumon-mint"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-lumon-mint/50">{dirty ? "Cambios sin guardar" : "Sin cambios"}</span>
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded bg-lumon-mint px-4 py-2 text-sm font-semibold text-lumon-ink disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar con If-Match"}
          </button>
        </div>
      </form>
    </section>
  );
}
