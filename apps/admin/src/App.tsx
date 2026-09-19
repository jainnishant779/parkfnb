import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import PagePlaceholder from "./components/PagePlaceholder";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Owners from "./pages/Owners";
import OwnerDetail from "./pages/OwnerDetail";
import Bookings from "./pages/Bookings";
import Payments from "./pages/Payments";
import ParkingSpaces from "./pages/ParkingSpaces";
import Vehicles from "./pages/Vehicles";
import OtaManagement from "./pages/OtaManagement";
import Settings from "./pages/Settings";

/**
 * Sections whose pages are still in progress.
 */
const PENDING_SECTIONS: { path: string; title: string }[] = [
  { path: "/reports", title: "Reports & Analytics" },
  { path: "/support", title: "Support & Disputes" },
  { path: "/notifications", title: "Notifications" },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/owners" element={<Owners />} />
          <Route path="/owners/:id" element={<OwnerDetail />} />
          <Route path="/spaces" element={<ParkingSpaces />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/ota" element={<OtaManagement />} />
          <Route path="/settings" element={<Settings />} />

          {PENDING_SECTIONS.map(({ path, title }) => (
            <Route
              key={path}
              path={path}
              element={<PagePlaceholder title={title} />}
            />
          ))}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
