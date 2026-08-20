import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/RequireAuth';
import Login from './pages/Login';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/tasks"
            element={
              <RequireAuth>
                <Tasks />
              </RequireAuth>
            }
          />
          {/* Task detail was added later and never wrapped in RequireAuth */}
          <Route path="/tasks/:id" element={<TaskDetail />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
