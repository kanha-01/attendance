import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// Pages
import LandingPage       from './pages/LandingPage'
import LoginPage         from './pages/LoginPage'
import RegisterPage      from './pages/RegisterPage'
import StudentDashboard  from './pages/StudentDashboard'
import FacultyDashboard  from './pages/FacultyDashboard'
import AttendancePage    from './pages/AttendancePage'
import NotFound          from './pages/NotFound'

function ProtectedRoute({ children, requiredRole }) {
  const { user, ready } = useAuth()

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole)
    return <Navigate to={user.role === 'faculty' ? '/faculty' : '/student'} replace />

  return children
}

function RootRedirect() {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <Navigate to="/" replace />
  return <Navigate to={user.role === 'faculty' ? '/faculty' : '/student'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/"          element={<LandingPage />} />
          <Route path="/login"     element={<LoginPage />} />
          <Route path="/register"  element={<RegisterPage />} />

          {/* Auto-redirect from /dashboard */}
          <Route path="/dashboard" element={<RootRedirect />} />

          {/* Student */}
          <Route
            path="/student"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />

          {/* Faculty */}
          <Route
            path="/faculty"
            element={
              <ProtectedRoute requiredRole="faculty">
                <FacultyDashboard />
              </ProtectedRoute>
            }
          />

          {/* Live Attendance session */}
          <Route
            path="/faculty/attendance/:courseId"
            element={
              <ProtectedRoute requiredRole="faculty">
                <AttendancePage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
