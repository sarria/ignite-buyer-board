import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthWall from './components/common/AuthWall';
import Sidebar from './components/common/Sidebar';
import BoardListPage from './pages/BoardListPage';
import BoardPage from './pages/BoardPage';
import BoardSettingsPage from './pages/BoardSettingsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import LoginPage from './pages/LoginPage';
import LoginCallback from './pages/LoginCallback';
import { getLastBoardId } from './utils/lastBoard';

// Land on the last board the user viewed, or the dashboard if there's no history.
function HomeRedirect() {
  const lastBoardId = getLastBoardId();
  return <Navigate to={lastBoardId ? `/boards/${lastBoardId}` : '/dashboard'} replace />;
}

// Admin-only page: a real member, or an admin previewing as one, is bounced home
// rather than shown a page whose every action would 403.
function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
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
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public — signing in can't require being signed in. */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/callback" element={<LoginCallback />} />

            <Route path="/" element={<AuthWall><HomeRedirect /></AuthWall>} />
            <Route element={<AuthWall><SidebarLayout /></AuthWall>}>
              <Route path="/dashboard" element={<BoardListPage />} />
              <Route path="/boards/:id" element={<BoardPage />} />
              <Route path="/boards/:id/settings" element={<BoardSettingsPage />} />
              <Route path="/admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </AppProvider>
  );
}
