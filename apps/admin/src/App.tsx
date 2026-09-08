import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PagePlaceholder from './components/PagePlaceholder';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Users from './pages/Users';
import Owners from './pages/Owners';
import OwnerDetail from './pages/OwnerDetail';
import Bookings from './pages/Bookings';
import Payments from './pages/Payments';

/**
 * Sections whose pages are still in progress. Each renders a placeholder until
 * its real page lands, at which point the entry moves out of this list and
 * into an explicit <Route> above.
 */
const PENDING_SECTIONS: { path: string; title: string }[] = [
  { path: '/spaces', title: 'Parking Spaces' },
  { path: '/vehicles', title: 'Vehicles' },
  { path: '/reports', title: 'Reports' },
  { path: '/support', title: 'Support & Disputes' },
  { path: '/notifications', title: 'Notifications' },
  { path: '/settings', title: 'Settings' },
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
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/payments" element={<Payments />} />
          {PENDING_SECTIONS.map(({ path, title }) => (
            <Route key={path} path={path} element={<PagePlaceholder title={title} />} />
          ))}
        </Route>

        {/* An unknown URL is far more likely a typo than a signed-out visit,
            so send it to the dashboard and let ProtectedRoute decide. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
