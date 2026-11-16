import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera as CameraIcon,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { request } from "../lib/api";
import {
  PageHeader,
  Card,
  TableScroll,
  Th,
  Td,
  LoadingState,
  ErrorState,
  EmptyState,
  SearchInput,
  FilterPills,
} from "../components/tables/DataTable";
import DetailDrawer, {
  DetailRow,
  DetailSection,
} from "../components/tables/DetailDrawer";
import StatusBadge from "../components/tables/StatusBadge";

/**
 * Cameras: which ANPR camera belongs to which owner.
 *
 * The ANPR service knows a camera only by its camera ID (the one in the phone link, e.g. "phone-1"). Here an admin registers that ID
 * and either assigns it to an owner's property or makes a one-time pairing code the owner types into their dashboard. The owner then
 * sees that camera (and only that camera) in the owner web dashboard. Taking it away, or giving it to someone else, starts a new
 * "since" time: the new owner never sees what the camera recorded for the previous one.
 */

interface Person {
  firstName?: string;
  lastName?: string;
  phone?: string;
}
interface OwnerRef {
  id?: string;
  businessName?: string;
  userId?: Person | string | null;
}
interface PropertyRef {
  id?: string;
  propertyName?: string;
  city?: string;
  ownerId?: OwnerRef | string | null;
}
interface CameraItem {
  id: string;
  cameraId: string;
  name?: string;
  anprBaseUrl?: string | null;
  ownerId?: OwnerRef | string | null;
  propertyId?: PropertyRef | string | null;
  status: string;
  linkedVia?: string | null;
  linkedAt?: string | null;
  pairingPending?: boolean;
  pairingExpiresAt?: string | null;
}
interface CamerasResponse {
  cameras: CameraItem[];
  properties: PropertyRef[];
  anprBaseUrls: string[];
}
interface PairingCode {
  cameraId: string;
  code: string;
  expiresAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "unassigned", label: "Unassigned" },
  { value: "disabled", label: "Disabled" },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

const CAMERA_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

const asObject = <T extends object>(v: T | string | null | undefined): T | null =>
  v && typeof v === "object" ? v : null;

const ownerName = (owner: OwnerRef | string | null | undefined): string => {
  const o = asObject(owner);
  if (!o) return "";
  const u = asObject(o.userId);
  const person = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "";
  return person || o.businessName || "";
};
const ownerPhone = (owner: OwnerRef | string | null | undefined): string =>
  asObject(asObject(owner)?.userId)?.phone || "";

const when = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export default function Cameras() {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [properties, setProperties] = useState<PropertyRef[]>([]);
  const [baseUrls, setBaseUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [propertyChoice, setPropertyChoice] = useState("");
  const [code, setCode] = useState<PairingCode | null>(null);
  const [copied, setCopied] = useState(false);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newBase, setNewBase] = useState("");

  const selected = useMemo(
    () => cameras.find((c) => c.id === selectedId) || null,
    [cameras, selectedId],
  );

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    setError(null);
    try {
      const res = await request<CamerasResponse>("/api/cameras/admin");
      setCameras(res.cameras || []);
      setProperties(res.properties || []);
      setBaseUrls(res.anprBaseUrls || []);
    } catch (err: any) {
      setError(err.message || "Could not load cameras");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Opening another camera starts from its own state: no leftover error, no code from the last one.
  useEffect(() => {
    const p = asObject(selected?.propertyId);
    setPropertyChoice(p?.id || (typeof selected?.propertyId === "string" ? selected.propertyId : "") || "");
    setActionError(null);
    setCode((prev) => (prev && prev.cameraId === selected?.cameraId ? prev : null));
    setCopied(false);
  }, [selected?.id, selected?.propertyId]);

  /** One action at a time: show its error in the drawer, then refresh the list so every column is exact. */
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load(false);
    } catch (err: any) {
      setActionError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const createCamera = () =>
    act(async () => {
      const cameraId = newId.trim();
      if (!CAMERA_ID_RE.test(cameraId)) {
        throw new Error("Camera ID may only use letters, numbers, - and _ (up to 32 characters)");
      }
      const created = await request<CameraItem>("/api/cameras/admin", {
        method: "POST",
        body: { cameraId, name: newName.trim(), anprBaseUrl: newBase || undefined },
      });
      setNewId("");
      setNewName("");
      setNewBase("");
      setCreating(false);
      setSelectedId(created.id);
    });

  const saveAssignment = () =>
    act(async () => {
      if (!selected) return;
      await request(`/api/cameras/admin/${encodeURIComponent(selected.cameraId)}/assignment`, {
        method: "PUT",
        body: { propertyId: propertyChoice || null },
      });
    });

  const makeCode = () =>
    act(async () => {
      if (!selected) return;
      const res = await request<PairingCode>(
        `/api/cameras/admin/${encodeURIComponent(selected.cameraId)}/pairing-code`,
        { method: "POST" },
      );
      setCode(res);
      setCopied(false);
    });

  const setStatus = (status: "active" | "disabled") =>
    act(async () => {
      if (!selected) return;
      await request(`/api/cameras/admin/${encodeURIComponent(selected.cameraId)}`, {
        method: "PATCH",
        body: { status },
      });
    });

  const remove = () =>
    act(async () => {
      if (!selected) return;
      if (!window.confirm(`Delete camera ${selected.cameraId}? Its ANPR history stays on the ANPR server.`)) return;
      await request(`/api/cameras/admin/${encodeURIComponent(selected.cameraId)}`, { method: "DELETE" });
      setSelectedId(null);
    });

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setCopied(false); // the code is on screen to read out
    }
  };

  const filtered = cameras.filter((c) => {
    const text = `${c.cameraId} ${c.name || ""} ${ownerName(c.ownerId)} ${asObject(c.propertyId)?.propertyName || ""}`.toLowerCase();
    return (
      text.includes(search.toLowerCase()) && (!statusFilter || c.status === statusFilter)
    );
  });

  const propertyOptions = useMemo(
    () =>
      [...properties].sort((a, b) =>
        (a.propertyName || "").localeCompare(b.propertyName || ""),
      ),
    [properties],
  );

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Cameras"
        subtitle="Link each ANPR camera to an owner's property. Owners see only the cameras linked to them."
        action={
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setActionError(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add camera
          </button>
        }
      />

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search camera, owner, property…"
          />
          <FilterPills
            options={[...STATUS_OPTIONS]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>

        {loading ? (
          <LoadingState label="Loading cameras…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={search || statusFilter ? "No cameras match" : "No cameras yet"}
            hint="Add the camera ID that appears in the camera's phone link (for example phone-1), then link it to an owner."
          />
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Camera</Th>
                  <Th>Owner</Th>
                  <Th>Property</Th>
                  <Th>Status</Th>
                  <Th>Linked</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const prop = asObject(c.propertyId);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className="cursor-pointer hover:bg-slate-50/70 transition"
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-teal">
                            <CameraIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-mono text-sm font-semibold text-slate-900">
                              {c.cameraId}
                            </div>
                            {c.name && <div className="text-xs text-slate-500">{c.name}</div>}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {ownerName(c.ownerId) ? (
                          <div>
                            <div className="text-sm text-slate-900">{ownerName(c.ownerId)}</div>
                            <div className="text-xs text-slate-500">{ownerPhone(c.ownerId)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Nobody</span>
                        )}
                      </Td>
                      <Td className="text-sm text-slate-700">
                        {prop?.propertyName || <span className="text-xs text-slate-400">—</span>}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={c.status} />
                          {c.pairingPending && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <KeyRound className="h-3 w-3" />
                              Code waiting
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-xs text-slate-600">
                        {c.linkedVia ? (
                          <>
                            {c.linkedVia === "pairing" ? "Owner paired" : "Admin assigned"}
                            <div className="text-slate-400">{when(c.linkedAt)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td align="right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(c.id);
                          }}
                          className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-teal hover:text-white transition"
                        >
                          Manage
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {/* Add a camera */}
      <DetailDrawer
        open={creating}
        title="Add camera"
        subtitle="Register the camera ID the ANPR service uses"
        onClose={() => setCreating(false)}
      >
        <div className="p-5 space-y-4 text-sm">
          <div>
            <label htmlFor="new-camera-id" className="mb-1.5 block text-xs font-medium text-slate-600">
              Camera ID
            </label>
            <input
              id="new-camera-id"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="phone-1"
              maxLength={32}
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Exactly as in the camera&apos;s phone link (<code>camera_id=…</code>). Letters, numbers, - and _.
            </p>
          </div>
          <div>
            <label htmlFor="new-camera-name" className="mb-1.5 block text-xs font-medium text-slate-600">
              Name (optional)
            </label>
            <input
              id="new-camera-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Main gate"
              maxLength={80}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </div>
          {baseUrls.length > 1 && (
            <div>
              <label htmlFor="new-camera-base" className="mb-1.5 block text-xs font-medium text-slate-600">
                ANPR server
              </label>
              <select
                id="new-camera-base"
                value={newBase}
                onChange={(e) => setNewBase(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              >
                <option value="">Default server</option>
                {baseUrls.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          )}
          {actionError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {actionError}
            </p>
          )}
          <button
            type="button"
            onClick={createCamera}
            disabled={busy || !newId.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Adding…" : "Add camera"}
          </button>
        </div>
      </DetailDrawer>

      {/* One camera */}
      <DetailDrawer
        open={Boolean(selected)}
        title={`Camera: ${selected?.cameraId || ""}`}
        subtitle={selected?.name || "ANPR camera"}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <div className="p-5 space-y-5 text-sm">
            <DetailSection title="Overview">
              <DetailRow label="Camera ID" value={<span className="font-mono">{selected.cameraId}</span>} />
              <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              <DetailRow label="Owner" value={ownerName(selected.ownerId) || "Nobody"} />
              <DetailRow label="Phone" value={ownerPhone(selected.ownerId) || "—"} />
              <DetailRow
                label="Linked"
                value={
                  selected.linkedVia
                    ? `${selected.linkedVia === "pairing" ? "Owner paired" : "Admin assigned"} · ${when(selected.linkedAt)}`
                    : "—"
                }
              />
              <DetailRow label="ANPR server" value={selected.anprBaseUrl || "Default server"} />
            </DetailSection>

            <DetailSection title="Assign to a property">
              <div className="space-y-3 p-3">
                <div>
                  <label htmlFor="camera-property" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Property
                  </label>
                  <select
                    id="camera-property"
                    value={propertyChoice}
                    onChange={(e) => {
                      setPropertyChoice(e.target.value);
                      setActionError(null);
                    }}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:opacity-60"
                  >
                    <option value="">Not assigned</option>
                    {propertyOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.propertyName}
                        {p.city ? `, ${p.city}` : ""} — {ownerName(p.ownerId) || "unknown owner"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400">
                    The owner is the property&apos;s owner. Giving the camera to a different owner starts afresh for them: they never see
                    what it recorded before. “Not assigned” takes it away.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={
                    busy ||
                    propertyChoice === (asObject(selected.propertyId)?.id || "")
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save assignment
                </button>
              </div>
            </DetailSection>

            {!selected.ownerId && (
              <DetailSection title="Let the owner pair it themselves">
                <div className="space-y-3 p-3">
                  <p className="text-xs text-slate-500">
                    Make a one-time code, give it to the owner, and they enter it with this camera ID in their dashboard. It works once,
                    lasts 7 days and is shown only now.
                    {selected.pairingPending && (
                      <>
                        {" "}
                        A code is already waiting (until {when(selected.pairingExpiresAt)}); making a new one replaces it.
                      </>
                    )}
                  </p>
                  {code && code.cameraId === selected.cameraId && (
                    <div className="rounded-lg border border-teal/30 bg-mint p-3">
                      <div className="text-xs text-slate-500">Pairing code (valid until {when(code.expiresAt)})</div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="select-all font-mono text-xl font-bold tracking-widest text-slate-900">
                          {code.code}
                        </span>
                        <button
                          type="button"
                          onClick={copyCode}
                          className="inline-flex items-center gap-1.5 rounded bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={makeCode}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal px-4 py-2 text-sm font-semibold text-teal transition hover:bg-teal hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />
                    {selected.pairingPending ? "Make a new pairing code" : "Make a pairing code"}
                  </button>
                </div>
              </DetailSection>
            )}

            {actionError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {actionError}
              </p>
            )}

            <DetailSection title="Switch off or remove">
              <div className="space-y-2 p-3">
                {selected.ownerId && (
                  <button
                    type="button"
                    onClick={() => setStatus(selected.status === "disabled" ? "active" : "disabled")}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {selected.status === "disabled"
                      ? "Turn the owner's access back on"
                      : "Turn the owner's access off (keeps the link)"}
                  </button>
                )}
                {!selected.ownerId && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete this camera
                  </button>
                )}
                <p className="text-xs text-slate-400">
                  An owner&apos;s access ends within 15 minutes of unassigning, switching off or reassigning (their pass runs out).
                </p>
              </div>
            </DetailSection>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
