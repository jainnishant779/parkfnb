import { useState, useEffect } from "react";
import {
  Save,
  MessageSquare,
  Sliders,
  Send,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Cpu,
  Eye,
  EyeOff,
} from "lucide-react";
import { request } from "../lib/api";
import { PageHeader, Card } from "../components/tables/DataTable";

type SettingsMap = Record<
  string,
  { value: any; description: string; updatedAt?: string }
>;

export default function Settings() {
  const [activeTab, setActiveTab] = useState<"otp" | "platform" | "hardware">(
    "otp",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Record<string, any>>({
    "sms.provider": "mock",
    "sms.api_key": "",
    "sms.sender_id": "PRKFNB",
    "sms.template":
      "Your ParkFNB verification code is {code}. Valid for 5 minutes.",
    "otp.ttl_seconds": 300,
    "otp.resend_cooldown": 30,
    "otp.test_code": "123456",
    "otp.test_enabled": true,
    "otp.allow_dev_otp": true,
    "platform.commission_rate": 0.15,
    "platform.name": "ParkingBNB",
    "payment.min_amount": 5,
    "payment.max_amount": 10000,
    "booking.min_hours": 1,
    "booking.max_days": 30,
    "booking.cancellation_hours": 24,
    "feature.instant_booking": true,
    "maintenance.mode": false,
  });

  const [showApiKey, setShowApiKey] = useState(false);

  // Test OTP state
  const [testPhone, setTestPhone] = useState("");
  const [sendingTestOtp, setSendingTestOtp] = useState(false);
  const [testOtpResult, setTestOtpResult] = useState<{
    success: boolean;
    message: string;
    code?: string;
    details?: any;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await request<{ settings: SettingsMap }>("/api/settings");
      if (res && res.settings) {
        const flat: Record<string, any> = {};
        for (const [k, v] of Object.entries(res.settings)) {
          flat[k] = v.value;
        }
        setSettings((prev) => ({ ...prev, ...flat }));
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not load platform settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      await request("/api/settings/bulk", {
        method: "PUT",
        body: { settings },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !/^[6-9]\d{9}$/.test(testPhone.trim())) {
      setTestOtpResult({
        success: false,
        message: "Please enter a valid 10-digit Indian mobile number",
      });
      return;
    }

    setSendingTestOtp(true);
    setTestOtpResult(null);

    try {
      const res = await request<{
        message: string;
        recipient: string;
        code: string;
        provider_result: any;
      }>("/api/auth/otp/test-send", {
        method: "POST",
        body: {
          phone: testPhone.trim(),
          provider: settings["sms.provider"],
          apiKey: settings["sms.api_key"],
          senderId: settings["sms.sender_id"],
          template: settings["sms.template"],
        },
      });

      setTestOtpResult({
        success: true,
        message: res.message || "Test code dispatched successfully!",
        code: res.code,
        details: res.provider_result,
      });
    } catch (err: any) {
      setTestOtpResult({
        success: false,
        message: err.message || "Error sending test OTP",
      });
    } finally {
      setSendingTestOtp(false);
    }
  };

  const updateVal = (key: string, val: any) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-7 w-7 animate-spin text-teal" />
        <p className="mt-3 text-sm">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="System Settings"
        subtitle="Manage OTP delivery, SMS gateways, platform fee rates, and barrier configurations."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSettings}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-teal-dark disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save All Settings
            </button>
          </div>
        }
      />

      {/* Notifications */}
      {saveSuccess && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>
            Settings saved and applied successfully across all services.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-6 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("otp")}
          className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "otp"
              ? "border-teal text-teal"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          OTP & SMS Messages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("platform")}
          className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "platform"
              ? "border-teal text-teal"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Platform & Pricing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("hardware")}
          className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "hardware"
              ? "border-teal text-teal"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Cpu className="h-4 w-4" />
          Hardware & Gates
        </button>
      </div>

      {/* TAB 1: OTP & SMS */}
      {activeTab === "otp" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Form (2 cols) */}
          <div className="space-y-6 lg:col-span-2">
            <Card className="p-5 sm:p-6 space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  SMS Gateway Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Select which SMS delivery service delivers one-time passwords
                  to drivers and parking owners.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    SMS Gateway Provider
                  </label>
                  <select
                    value={settings["sms.provider"] || "mock"}
                    onChange={(e) => updateVal("sms.provider", e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-teal"
                  >
                    <option value="mock">Console / Mock (Development)</option>
                    <option value="fast2sms">Fast2SMS (India)</option>
                    <option value="twilio">Twilio SMS</option>
                    <option value="msg91">MSG91</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Sender ID / Number
                  </label>
                  <input
                    type="text"
                    value={settings["sms.sender_id"] || ""}
                    onChange={(e) => updateVal("sms.sender_id", e.target.value)}
                    placeholder="PRKFNB or Twilio Phone"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  API Key / Auth Token
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings["sms.api_key"] || ""}
                    onChange={(e) => updateVal("sms.api_key", e.target.value)}
                    placeholder={
                      settings["sms.provider"] === "twilio"
                        ? "ACCOUNT_SID:AUTH_TOKEN"
                        : "Enter gateway authorization API key"
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm font-mono outline-none focus:border-teal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  For Twilio, supply <code>ACCOUNT_SID:AUTH_TOKEN</code>. For
                  Fast2SMS or MSG91, paste your API auth key.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  SMS Message Template
                </label>
                <textarea
                  rows={2}
                  value={settings["sms.template"] || ""}
                  onChange={(e) => updateVal("sms.template", e.target.value)}
                  placeholder="Your ParkFNB verification code is {code}. Valid for 5 minutes."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-teal"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Must include <code>{"{code}"}</code> placeholder for the
                  6-digit number.
                </p>
              </div>
            </Card>

            <Card className="p-5 sm:p-6 space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  OTP Lifecycle & Testing Policies
                </h3>
                <p className="text-xs text-slate-500">
                  Adjust OTP token expiry, flood prevention, and pre-production
                  bypass flags.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    OTP Validity (Seconds)
                  </label>
                  <input
                    type="number"
                    value={settings["otp.ttl_seconds"] || 300}
                    onChange={(e) =>
                      updateVal("otp.ttl_seconds", Number(e.target.value))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
                  />
                  <span className="text-[11px] text-slate-400">
                    Default: 300s (5 minutes)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Resend Cooldown (Seconds)
                  </label>
                  <input
                    type="number"
                    value={settings["otp.resend_cooldown"] || 30}
                    onChange={(e) =>
                      updateVal("otp.resend_cooldown", Number(e.target.value))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
                  />
                  <span className="text-[11px] text-slate-400">
                    Default: 30 seconds
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Universal Test OTP Code
                  </label>
                  <input
                    type="text"
                    value={settings["otp.test_code"] || "123456"}
                    onChange={(e) => updateVal("otp.test_code", e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal"
                  />
                  <span className="text-[11px] text-slate-400">
                    Accepted for all demo accounts
                  </span>
                </div>

                <div className="flex flex-col justify-center space-y-3 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settings["otp.test_enabled"])}
                      onChange={(e) =>
                        updateVal("otp.test_enabled", e.target.checked)
                      }
                      className="h-4 w-4 rounded text-teal focus:ring-teal"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      Allow Test OTP Bypass
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settings["otp.allow_dev_otp"])}
                      onChange={(e) =>
                        updateVal("otp.allow_dev_otp", e.target.checked)
                      }
                      className="h-4 w-4 rounded text-teal focus:ring-teal"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      Return dev_code in API Response
                    </span>
                  </label>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Live OTP Tester */}
          <div className="space-y-6">
            <Card className="p-5 sm:p-6 border-2 border-teal/20 bg-gradient-to-b from-teal/5 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-white">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Live OTP Dispatch Tester
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verify phone messaging delivery
                  </p>
                </div>
              </div>

              <form onSubmit={handleTestSendOtp} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Indian Mobile Number (10 Digits)
                  </label>
                  <div className="mt-1 flex rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-teal">
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-semibold text-slate-500 border-r border-slate-200">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="9826012345"
                      maxLength={10}
                      className="flex-1 px-3 py-2 text-sm outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingTestOtp}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal py-2.5 text-xs font-bold text-white shadow transition hover:bg-teal-dark disabled:opacity-50"
                >
                  {sendingTestOtp ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending Code…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Send Live Test OTP
                    </>
                  )}
                </button>
              </form>

              {testOtpResult && (
                <div
                  className={`mt-4 rounded-lg p-3 text-xs ${
                    testOtpResult.success
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {testOtpResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                    {testOtpResult.message}
                  </div>
                  {testOtpResult.code && (
                    <p className="mt-2 text-slate-700">
                      Dispatched Code:{" "}
                      <span className="rounded bg-white px-2 py-0.5 font-mono font-bold text-teal border border-slate-200">
                        {testOtpResult.code}
                      </span>
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400">
                Active Provider:{" "}
                <span className="font-semibold text-slate-600 uppercase">
                  {settings["sms.provider"]}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: PLATFORM & PRICING */}
      {activeTab === "platform" && (
        <Card className="p-5 sm:p-6 space-y-6 max-w-3xl">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Platform Economics & Limits
            </h3>
            <p className="text-xs text-slate-500">
              Configure marketplace commission take-rate, booking constraints,
              and maintenance status.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Platform Commission Take Rate
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-slate-200 px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={settings["platform.commission_rate"] ?? 0.15}
                  onChange={(e) =>
                    updateVal(
                      "platform.commission_rate",
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full text-sm outline-none"
                />
                <span className="text-xs font-bold text-slate-400">
                  {(
                    (settings["platform.commission_rate"] ?? 0.15) * 100
                  ).toFixed(0)}
                  %
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Default: 0.15 (15% platform cut)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Free Cancellation Window (Hours)
              </label>
              <input
                type="number"
                value={settings["booking.cancellation_hours"] ?? 24}
                onChange={(e) =>
                  updateVal(
                    "booking.cancellation_hours",
                    Number(e.target.value),
                  )
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Drivers can cancel without penalty before this window
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Minimum Payment (₹ INR)
              </label>
              <input
                type="number"
                value={settings["payment.min_amount"] ?? 5}
                onChange={(e) =>
                  updateVal("payment.min_amount", Number(e.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Maximum Payment (₹ INR)
              </label>
              <input
                type="number"
                value={settings["payment.max_amount"] ?? 10000}
                onChange={(e) =>
                  updateVal("payment.max_amount", Number(e.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-6">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings["feature.instant_booking"])}
                  onChange={(e) =>
                    updateVal("feature.instant_booking", e.target.checked)
                  }
                  className="h-4 w-4 rounded text-teal focus:ring-teal"
                />
                <span className="text-xs font-medium text-slate-700">
                  Enable Instant Booking by Default
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-amber-700">
                <input
                  type="checkbox"
                  checked={Boolean(settings["maintenance.mode"])}
                  onChange={(e) =>
                    updateVal("maintenance.mode", e.target.checked)
                  }
                  className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-medium">
                  Global Maintenance Mode (Pause Bookings)
                </span>
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: HARDWARE & GATES */}
      {activeTab === "hardware" && (
        <Card className="p-5 sm:p-6 space-y-6 max-w-3xl">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Barrier Firmware & IoT Links
            </h3>
            <p className="text-xs text-slate-500">
              Connection parameters for ESP32 barrier locks and ANPR cameras.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  MQTT Broker Host
                </label>
                <input
                  type="text"
                  readOnly
                  value="broker.hivemq.com"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Configured via MQTT_HOST env variable
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  MQTT TLS Port
                </label>
                <input
                  type="text"
                  readOnly
                  value="8883 (WSS: 8884)"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                ANPR Service Token (x-anpr-token)
              </label>
              <input
                type="text"
                readOnly
                value="parkfnb-anpr-demo-token"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Gate cameras present this token to POST{" "}
                <code>/api/access/anpr-event</code>
              </p>
            </div>

            <div className="rounded-lg bg-teal/10 p-4 border border-teal/20 text-xs text-teal-dark space-y-1">
              <p className="font-bold">Over-The-Air Firmware Status:</p>
              <p>
                ESP32 barrier controllers listen on port 3232 (ArduinoOTA) and
                subscribe to MQTT <code>parkbnb/pb-001/cmd</code> with{" "}
                <code>ota</code> commands.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
