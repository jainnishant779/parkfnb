import { useState, useEffect, useCallback } from "react";
import { Car, CheckCircle2, XCircle } from "lucide-react";
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

interface VehicleItem {
  id?: string;
  _id?: string;
  user_id?: any;
  userId?: any;
  license_plate?: string;
  licensePlate?: string;
  plate_number?: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  color?: string;
  vehicle_type?: string;
  vehicleType?: string;
  is_verified?: boolean;
  isVerified?: boolean;
  is_default?: boolean;
  isDefault?: boolean;
  created_at?: string;
}

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "car", label: "Car" },
  { value: "suv", label: "SUV" },
  { value: "motorcycle", label: "2-Wheeler" },
];

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(
    null,
  );

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await request<any>("/api/vehicles");
      const items = Array.isArray(res) ? res : res?.data || res?.vehicles || [];
      setVehicles(items);
    } catch (err: any) {
      setError(err.message || "Could not load registered vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const filteredVehicles = vehicles.filter((v) => {
    const plate =
      v.license_plate ||
      v.licensePlate ||
      v.plate_number ||
      v.plateNumber ||
      "";
    const make = v.make || "";
    const model = v.model || "";
    const query = search.toLowerCase();

    const matchesSearch =
      plate.toLowerCase().includes(query) ||
      make.toLowerCase().includes(query) ||
      model.toLowerCase().includes(query);

    const type = (v.vehicle_type || v.vehicleType || "").toLowerCase();
    const matchesType = !typeFilter || type === typeFilter.toLowerCase();

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Registered Vehicles"
        subtitle="Driver vehicles, license plate numbers recognized by ANPR gate cameras."
      />

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search license plate, make, model..."
          />
          <FilterPills
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
          />
        </div>

        {loading ? (
          <LoadingState label="Loading vehicles…" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadVehicles} />
        ) : filteredVehicles.length === 0 ? (
          <EmptyState
            message={
              search
                ? "No vehicles match your search"
                : "No registered vehicles found"
            }
            hint="Vehicles added by drivers during booking or profile setup will appear here."
          />
        ) : (
          <TableScroll>
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>License Plate</Th>
                  <Th>Make / Model</Th>
                  <Th>Color</Th>
                  <Th>Vehicle Type</Th>
                  <Th>ANPR Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVehicles.map((vehicle, idx) => {
                  const id = vehicle.id || vehicle._id || String(idx);
                  const plate =
                    vehicle.license_plate ||
                    vehicle.licensePlate ||
                    vehicle.plate_number ||
                    vehicle.plateNumber ||
                    "UNKNOWN";
                  const make = vehicle.make || "Standard";
                  const model = vehicle.model || "";
                  const color = vehicle.color || "White";
                  const type =
                    vehicle.vehicle_type || vehicle.vehicleType || "Car";
                  const verified =
                    vehicle.is_verified ?? vehicle.isVerified ?? true;

                  return (
                    <tr
                      key={id}
                      onClick={() => setSelectedVehicle(vehicle)}
                      className="cursor-pointer hover:bg-slate-50/70 transition"
                    >
                      <Td className="font-mono font-bold text-slate-900 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
                          <Car className="h-4 w-4" />
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {plate}
                        </span>
                      </Td>
                      <Td className="font-medium text-slate-800">
                        {make} {model}
                      </Td>
                      <Td className="text-xs text-slate-600 capitalize">
                        {color}
                      </Td>
                      <Td>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize">
                          {type}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            verified
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {verified ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-amber-600" />
                          )}
                          {verified ? "Recognized" : "Unverified"}
                        </span>
                      </Td>
                      <Td align="right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVehicle(vehicle);
                          }}
                          className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-teal hover:text-white transition"
                        >
                          Details
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

      {/* Vehicle Detail Drawer */}
      <DetailDrawer
        open={Boolean(selectedVehicle)}
        title={`Vehicle: ${selectedVehicle?.license_plate || selectedVehicle?.licensePlate || selectedVehicle?.plate_number || "Details"}`}
        subtitle="Vehicle Specifications"
        onClose={() => setSelectedVehicle(null)}
      >
        {selectedVehicle && (
          <div className="p-5 space-y-5 text-sm">
            <DetailSection title="Vehicle Details">
              <DetailRow
                label="Plate Number"
                value={
                  selectedVehicle.license_plate ||
                  selectedVehicle.licensePlate ||
                  selectedVehicle.plate_number ||
                  "—"
                }
              />
              <DetailRow label="Make" value={selectedVehicle.make || "—"} />
              <DetailRow label="Model" value={selectedVehicle.model || "—"} />
              <DetailRow label="Color" value={selectedVehicle.color || "—"} />
              <DetailRow
                label="Vehicle Type"
                value={
                  selectedVehicle.vehicle_type ||
                  selectedVehicle.vehicleType ||
                  "Car"
                }
              />
              <DetailRow
                label="Primary Vehicle"
                value={
                  (selectedVehicle.is_default ?? selectedVehicle.isDefault)
                    ? "Yes (Default)"
                    : "No"
                }
              />
            </DetailSection>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
