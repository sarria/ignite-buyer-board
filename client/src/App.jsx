import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import { AppProvider } from './context/AppContext';
import AccessGate from './components/common/AccessGate';
import Sidebar from './components/common/Sidebar';
import BoardListPage from './pages/BoardListPage';
import BoardPage from './pages/BoardPage';
import BoardSettingsPage from './pages/BoardSettingsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminLuminaFieldsPage from './pages/AdminLuminaFieldsPage';
import { getLastBoardId } from './utils/lastBoard';

// Land on the last board the user viewed, or the dashboard if there's no history.
function HomeRedirect() {
  const lastBoardId = getLastBoardId();
  return <Navigate to={lastBoardId ? `/boards/${lastBoardId}` : '/dashboard'} replace />;
}

function SidebarLayout() {
  return (
    <Box sx={{ position: 'fixed', inset: 0, display: 'flex', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <AppProvider>
      {/* TEMPORARY access gate — remove when MSAL SSO lands (see AccessGate). */}
      <AccessGate>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route element={<SidebarLayout />}>
            <Route path="/dashboard" element={<BoardListPage />} />
            <Route path="/boards/:id" element={<BoardPage />} />
            <Route path="/boards/:id/settings" element={<BoardSettingsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/lumina-fields" element={<AdminLuminaFieldsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AccessGate>
    </AppProvider>
  );
}
