import { useState, useEffect, useCallback } from "react";
import {
  ParkingSquare,
  CheckCircle2,
  XCircle,
  Radio,
  Loader2,
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

interface ParkingSpaceItem {
  id?: string;
  _id?: string;
  space_number?: string;
  spaceNumber?: string;
  bay_code?: string;
  property_id?: any;
  propertyId?: any;
  space_type?: string;
  spaceType?: string;
  price_per_hour?: number;
  pricePerHour?: number;
  hourly_rate?: number;
  hourlyRate?: number;
  status?: string;
  is_active?: boolean;
  isActive?: boolean;
  is_available?: boolean;
  isAvailable?: boolean;
  vehicle_size?: string;
  vehicleSize?: string;
  features?: string[];
  created_at?: string;
  device_id?: string | null;
  deviceId?: string | null;
  has_smart_barrier?: boolean;
  hasSmartBarrier?: boolean;
}

interface BarrierDevice {
  id?: string;
  _id?: string;
  device_id?: string;
  deviceId?: string;
  name?: string;
  status?: string;
  device_type?: string;
  deviceType?: string;
  parking_space_id?: { id?: string; _id?: string; space_number?: string; spaceNumber?: string } | string | null;
  parkingSpaceId?: { id?: string; _id?: string; spaceNumber?: string } | string | null;
}

interface BarrierAssignmentsResponse {
  spaces: ParkingSpaceItem[];
  devices: BarrierDevice[];
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function ParkingSpaces() {
  const [spaces, setSpaces] = useState<ParkingSpaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<ParkingSpaceItem | null>(
    null,
  );
  const [devices, setDevices] = useState<BarrierDevice[]>([]);
  const [selectedBarrierId, setSelectedBarrierId] = useState("");
  const [savingBarrier, setSavingBarrier] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await request<BarrierAssignmentsResponse>(
        "/api/devices/admin/barrier-assignments",
      );
      setSpaces(res.spaces || []);
      setDevices(res.devices || []);
    } catch (err: any) {
      setError(err.message || "Could not load parking spaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    setSelectedBarrierId(selectedSpace?.deviceId || selectedSpace?.device_id || "");
    setAssignmentError(null);
    setAssignmentMessage(null);
  }, [selectedSpace?.id, selectedSpace?._id]);

  const saveBarrierAssignment = async () => {
    const spaceId = selectedSpace?.id || selectedSpace?._id;
    if (!spaceId) return;

    setSavingBarrier(true);
    setAssignmentError(null);
    setAssignmentMessage(null);
    try {
      const result = await request<{ space: ParkingSpaceItem; message: string }>(
        `/api/devices/admin/parking-spaces/${spaceId}/barrier`,
        {
          method: "PUT",
          body: { barrierId: selectedBarrierId || null },
        },
      );
      setAssignmentMessage(result.message);

      // Refresh both sides of the relationship so conflict options stay exact.
      const refreshed = await request<BarrierAssignmentsResponse>(
        "/api/devices/admin/barrier-assignments",
      );
      setSpaces(refreshed.spaces || []);
      setDevices(refreshed.devices || []);
      setSelectedSpace(
        refreshed.spaces.find((space) => (space.id || space._id) === spaceId) || result.space,
      );
    } catch (err: any) {
      setAssignmentError(err.message || "Could not update barrier assignment");
    } finally {
      setSavingBarrier(false);
    }
  };

  const filteredSpaces = spaces.filter((s) => {
    const num = s.space_number || s.spaceNumber || s.bay_code || "";
    const type = s.space_type || s.spaceType || "";
    const barrierId = s.device_id || s.deviceId || "";
    const matchesSearch =
      num.toLowerCase().includes(search.toLowerCase()) ||
      type.toLowerCase().includes(search.toLowerCase()) ||
      barrierId.toLowerCase().includes(search.toLowerCase());

    const active = s.is_active ?? s.isActive ?? true;
    const matchesStatus =
      !statusFilter ||
      (statusFilter === "active" && active) ||
      (statusFilter === "inactive" && !active);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Parking Spaces"
        subtitle="Live inventory of bays, rates, availability, and assigned parking barriers."
      />

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search bay, type, barrier ID..."
          />
          <FilterPills
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
          />
        </div>

        {loading ? (
          <LoadingState label="Loading parking spaces…" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadSpaces} />
        ) : filteredSpaces.length === 0 ? (
          <EmptyState
            message={
              search
                ? "No parking spaces match your search"
                : "No parking spaces found"
            }
            hint="Parking spaces registered by verified property owners will appear here."
          />
        ) : (
          <TableScroll>
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Bay / Space</Th>
                  <Th>Type</Th>
                  <Th>Vehicle Size</Th>
                  <Th>Hourly Rate</Th>
                  <Th>Barrier ID</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSpaces.map((space, idx) => {
                  const id = space.id || space._id || String(idx);
                  const bay =
                    space.space_number ||
                    space.spaceNumber ||
                    space.bay_code ||
                    `Bay ${idx + 1}`;
                  const rate =
                    space.price_per_hour ??
                    space.pricePerHour ??
                    space.hourly_rate ??
                    space.hourlyRate ??
                    40;
                  const type =
                    space.space_type || space.spaceType || "Standard";
                  const size =
                    space.vehicle_size || space.vehicleSize || "Car / SUV";
                  const active = space.is_active ?? space.isActive ?? true;
                  const barrierId = space.device_id || space.deviceId;

                  return (
                    <tr
                      key={id}
                      onClick={() => setSelectedSpace(space)}
                      className="cursor-pointer hover:bg-slate-50/70 transition"
                    >
                      <Td className="font-semibold text-slate-900 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-teal">
                          <ParkingSquare className="h-4 w-4" />
                        </div>
                        {bay}
                      </Td>
                      <Td>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {type}
                        </span>
                      </Td>
                      <Td className="text-xs text-slate-600">{size}</Td>
                      <Td className="font-semibold text-slate-900">
                        ₹{rate}/hr
                      </Td>
                      <Td>
                        {barrierId ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-cyan-800">
                            <Radio className="h-3 w-3" />
                            {barrierId}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not assigned</span>
                        )}
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {active ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-slate-400" />
                          )}
                          {active ? "Active" : "Inactive"}
                        </span>
                      </Td>
                      <Td align="right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSpace(space);
                          }}
                          className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-teal hover:text-white transition"
                        >
                          View Details
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

      {/* Space Detail Drawer */}
      <DetailDrawer
        open={Boolean(selectedSpace)}
        title={`Space: ${selectedSpace?.space_number || selectedSpace?.spaceNumber || selectedSpace?.bay_code || "Details"}`}
        subtitle="Parking Bay Information"
        onClose={() => setSelectedSpace(null)}
      >
        {selectedSpace && (
          <div className="p-5 space-y-5 text-sm">
            <DetailSection title="Overview">
              <DetailRow
                label="Bay Number"
                value={
                  selectedSpace.space_number ||
                  selectedSpace.spaceNumber ||
                  selectedSpace.bay_code ||
                  "—"
                }
              />
              <DetailRow
                label="Space Type"
                value={
                  selectedSpace.space_type ||
                  selectedSpace.spaceType ||
                  "Standard"
                }
              />
              <DetailRow
                label="Vehicle Compatibility"
                value={
                  selectedSpace.vehicle_size ||
                  selectedSpace.vehicleSize ||
                  "Standard Car"
                }
              />
              <DetailRow
                label="Rate"
                value={`₹${selectedSpace.price_per_hour ?? selectedSpace.pricePerHour ?? selectedSpace.hourly_rate ?? 40}/hour`}
              />
              <DetailRow
                label="Status"
                value={
                  (selectedSpace.is_active ?? selectedSpace.isActive ?? true)
                    ? "Active (Accepting Bookings)"
                    : "Inactive"
                }
              />
            </DetailSection>

            <DetailSection title="Parking Barrier Assignment">
              <div className="space-y-3 p-3">
                <div>
                  <label
                    htmlFor="barrier-assignment"
                    className="mb-1.5 block text-xs font-medium text-slate-600"
                  >
                    Barrier ID
                  </label>
                  <select
                    id="barrier-assignment"
                    value={selectedBarrierId}
                    onChange={(event) => {
                      setSelectedBarrierId(event.target.value);
                      setAssignmentError(null);
                      setAssignmentMessage(null);
                    }}
                    disabled={savingBarrier}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:opacity-60"
                  >
                    <option value="">No barrier assigned</option>
                    {devices.map((device) => {
                      const id = device.deviceId || device.device_id || "";
                      const assignment = device.parkingSpaceId ?? device.parking_space_id;
                      const assignedSpaceId =
                        typeof assignment === "string"
                          ? assignment
                          : assignment?.id || assignment?._id;
                      const currentSpaceId = selectedSpace.id || selectedSpace._id;
                      const assignedElsewhere = Boolean(
                        assignedSpaceId && assignedSpaceId !== currentSpaceId,
                      );
                      return (
                        <option
                          key={device.id || device._id || id}
                          value={id}
                          disabled={assignedElsewhere}
                        >
                          {id} — {device.name || "Smart Barrier"} ({device.status || "offline"})
                          {assignedElsewhere ? " — assigned to another space" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Choose a registered barrier, or select “No barrier assigned” to unlink it.
                  </p>
                </div>

                {assignmentError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {assignmentError}
                  </p>
                )}
                {assignmentMessage && (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {assignmentMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={saveBarrierAssignment}
                  disabled={
                    savingBarrier ||
                    selectedBarrierId === (selectedSpace.deviceId || selectedSpace.device_id || "")
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingBarrier && <Loader2 className="h-4 w-4 animate-spin" />}
                  {savingBarrier ? "Saving assignment…" : "Save barrier assignment"}
                </button>
              </div>
            </DetailSection>

            {selectedSpace.features && selectedSpace.features.length > 0 && (
              <DetailSection title="Features & Amenities">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedSpace.features.map((feat, i) => (
                    <span
                      key={i}
                      className="rounded bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </DetailSection>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
