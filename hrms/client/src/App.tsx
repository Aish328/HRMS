import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import { ToastProvider } from './components/Toast';
import { RequireRole } from './components/shared';
import Login from './pages/Login';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import AdminAttendance from './pages/admin/Attendance';
import AdminLeaves from './pages/admin/Leaves';
import Reports from './pages/admin/Reports';
import Activity from './pages/admin/Activity';
import EmployeeLayout from './pages/employee/EmployeeLayout';
import Home from './pages/employee/Home';
import Punch from './pages/employee/Punch';
import EmployeeLeaves from './pages/employee/Leaves';
import Profile from './pages/employee/Profile';
import OrgChart from './pages/OrgChart';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />

            <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
              <Route index element={<Dashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="attendance" element={<AdminAttendance />} />
              <Route path="leaves" element={<AdminLeaves />} />
              <Route path="reports" element={<Reports />} />
              <Route path="activity" element={<Activity />} />
              <Route path="org" element={<OrgChart />} />
            </Route>

            <Route path="/app" element={<RequireRole role="employee"><EmployeeLayout /></RequireRole>}>
              <Route index element={<Home />} />
              <Route path="punch" element={<Punch />} />
              <Route path="leaves" element={<EmployeeLeaves />} />
              <Route path="profile" element={<Profile />} />
              <Route path="org" element={<OrgChart />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
