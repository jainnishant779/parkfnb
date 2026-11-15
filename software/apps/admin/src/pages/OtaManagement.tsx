import { useState, useEffect } from "react";
import {
  Radio,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Cpu,
  Loader2,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { request, API_BASE_URL } from "../lib/api";
import {
  PageHeader,
  Card,
  TableScroll,
  Th,
  Td,
} from "../components/tables/DataTable";

interface OtaRelease {
  app: string;
  version: string;
  fileName?: string;
  bundleUrl: string;
  checksum: string;
  size: number;
  mandatory?: boolean;
  releaseNotes?: string;
  releasedAt: string;
}

export default function OtaManagement() {
  const [activeReleases, setActiveReleases] = useState<
    Record<string, OtaRelease | null>
  >({
    consumer: null,
    owner: null,
    firmware: null,
  });
  const [history, setHistory] = useState<OtaRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Publish form state
  const [targetApp, setTargetApp] = useState<"consumer" | "owner" | "firmware">(
    "consumer",
  );
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    loadOtaData();
  }, []);

  const loadOtaData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Load current status
      const statusRes = await request<{
        releases: Record<string, OtaRelease | null>;
      }>("/api/v1/ota/status");
      if (statusRes?.releases) {
        setActiveReleases(statusRes.releases);
      }

      // Load release history
      const historyRes = await request<{ releases: OtaRelease[] }>(
        "/api/v1/ota/releases",
      );
      if (historyRes?.releases) {
        setHistory(historyRes.releases);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load OTA release metadata");
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Please select a release file to upload");
      return;
    }
    if (!version.trim()) {
      setErrorMsg("Please specify a version string (e.g., 1.0.1)");
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("app", targetApp);
      formData.append("version", version.trim());
      formData.append("releaseNotes", notes.trim());
      formData.append("mandatory", String(mandatory));
      formData.append("bundle", selectedFile);

      const token = localStorage.getItem("parkfnb_token");
      const res = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/api/v1/ota/publish`,
        {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "x-ota-secret": "parkbnb-ota-secret-key-2026",
          },
          body: formData,
        },
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || "Publishing failed");
      }

      setUploadSuccess(
        `Successfully deployed ${targetApp} version ${version}!`,
      );
      setVersion("");
      setNotes("");
      setSelectedFile(null);
      await loadOtaData();
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Error uploading bundle");
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const dm = 1;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Over-The-Air (OTA) Updates"
        subtitle="Manage instant updates for Mobile Apps (React Native) and Barrier Firmware (ESP32)."
        action={
          <button
            type="button"
            onClick={loadOtaData}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        }
      />

      {uploadSuccess && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3 Status Cards for Target Systems */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Consumer App */}
        <TargetCard
          title="Consumer App"
          subtitle="Driver mobile app (React Native)"
          icon={Smartphone}
          release={activeReleases.consumer}
          badgeColor="bg-sky-50 text-sky-700 border-sky-200"
          formatBytes={formatBytes}
          onCopy={copyToClipboard}
          copiedUrl={copiedUrl}
        />

        {/* Owner App */}
        <TargetCard
          title="Owner App"
          subtitle="Space owner portal (React Native)"
          icon={Smartphone}
          release={activeReleases.owner}
          badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
          formatBytes={formatBytes}
          onCopy={copyToClipboard}
          copiedUrl={copiedUrl}
        />

        {/* ESP32 Barrier Firmware */}
        <TargetCard
          title="ESP32 Firmware"
          subtitle="Smart barrier locks & controllers"
          icon={Cpu}
          release={activeReleases.firmware}
          badgeColor="bg-purple-50 text-purple-700 border-purple-200"
          formatBytes={formatBytes}
          onCopy={copyToClipboard}
          copiedUrl={copiedUrl}
        />
      </div>

      {/* Publish Form and CLI Reference */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Publish Form */}
        <Card className="p-5 sm:p-6 lg:col-span-2 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Publish New OTA Release
            </h3>
            <p className="text-xs text-slate-500">
              Upload bundle or binary to roll out updates directly without going
              through app stores.
            </p>
          </div>

          <form onSubmit={handlePublish} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Target Application / Device
                </label>
                <select
                  value={targetApp}
                  onChange={(e) => setTargetApp(e.target.value as any)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-teal"
                >
                  <option value="consumer">
                    Consumer App (Android Bundle)
                  </option>
                  <option value="owner">Owner App (Android Bundle)</option>
                  <option value="firmware">
                    ESP32 Barrier Firmware (.bin)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Release Version (SemVer)
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. 1.0.2"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Release Notes & Changelog
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe bug fixes, new features, or barrier motion improvements..."
                className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Package File (
                  {targetApp === "firmware"
                    ? ".bin firmware"
                    : ".bundle JS file"}
                  )
                </label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-1.5 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-teal hover:file:bg-teal/20"
                  required
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mandatory}
                    onChange={(e) => setMandatory(e.target.checked)}
                    className="h-4 w-4 rounded text-teal focus:ring-teal"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Mandatory Update (force reload on launch)
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="flex items-center justify-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-xs font-bold text-white shadow transition hover:bg-teal-dark disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading & Signing Bundle…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Publish Release Now
                </>
              )}
            </button>
          </form>
        </Card>

        {/* CLI Instructions */}
        <Card className="p-5 sm:p-6 space-y-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2 text-teal-300">
            <Radio className="h-4 w-4" />
            <h4 className="text-sm font-bold uppercase tracking-wider">
              CLI Publishing Tools
            </h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            You can also bundle and upload updates directly from your command
            line using Metro and Hermes:
          </p>
          <div className="space-y-2 font-mono text-[11px]">
            <div className="rounded bg-black/40 p-2.5 text-slate-200">
              # Consumer App Update
              <br />
              <span className="text-teal-400">
                npm run ota:consumer -- --version 1.0.1
              </span>
            </div>
            <div className="rounded bg-black/40 p-2.5 text-slate-200">
              # Owner App Update
              <br />
              <span className="text-teal-400">
                npm run ota:owner -- --version 1.0.1
              </span>
            </div>
            <div className="rounded bg-black/40 p-2.5 text-slate-200">
              # ESP32 Remote Trigger
              <br />
              <span className="text-purple-400">
                MQTT: &#123;"cmd":"ota","url":"..."&#125;
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Release History Table */}
      <Card className="p-5 sm:p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">
          Release History & Artifacts
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No past releases published yet.
          </p>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[650px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Target</Th>
                  <Th>Version</Th>
                  <Th>File / Size</Th>
                  <Th>SHA-256 Checksum</Th>
                  <Th>Released</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((rel, idx) => (
                  <tr
                    key={`${rel.app}-${rel.version}-${idx}`}
                    className="hover:bg-slate-50/70 transition"
                  >
                    <Td>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 uppercase">
                        {rel.app}
                      </span>
                    </Td>
                    <Td className="font-mono font-bold text-slate-900">
                      v{rel.version}
                    </Td>
                    <Td>
                      <div className="text-xs">
                        <span className="text-slate-800">
                          {rel.fileName || "bundle"}
                        </span>
                        <span className="ml-2 text-slate-400">
                          ({formatBytes(rel.size)})
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <span
                        className="font-mono text-[11px] text-slate-500 truncate max-w-[140px] block"
                        title={rel.checksum}
                      >
                        {rel.checksum
                          ? `${rel.checksum.substring(0, 12)}…`
                          : "—"}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {rel.releasedAt
                        ? new Date(rel.releasedAt).toLocaleDateString()
                        : "—"}
                    </Td>
                    <Td align="right">
                      <a
                        href={rel.bundleUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}

function TargetCard({
  title,
  subtitle,
  icon: Icon,
  release,
  badgeColor,
  formatBytes,
  onCopy,
  copiedUrl,
}: {
  title: string;
  subtitle: string;
  icon: any;
  release: OtaRelease | null;
  badgeColor: string;
  formatBytes: (bytes?: number) => string;
  onCopy: (url: string) => void;
  copiedUrl: string | null;
}) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-teal">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-400">{subtitle}</p>
            </div>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
          >
            {release ? `v${release.version}` : "Base"}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span className="text-slate-400">Live Status:</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {release ? "OTA Active" : "Store Baseline"}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span className="text-slate-400">Bundle Size:</span>
            <span className="font-mono">
              {release ? formatBytes(release.size) : "Native"}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span className="text-slate-400">Last Released:</span>
            <span>
              {release?.releasedAt
                ? new Date(release.releasedAt).toLocaleDateString()
                : "Initial"}
            </span>
          </div>
        </div>
      </div>

      {release?.bundleUrl && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={() => onCopy(release.bundleUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            {copiedUrl === release.bundleUrl ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                Copy URL
              </>
            )}
          </button>
          <a
            href={release.bundleUrl}
            download
            className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:text-teal"
            title="Download Bundle"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </Card>
  );
}
