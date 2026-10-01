import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LocalProtectedRoute from './components/LocalProtectedRoute'
import UploadIndicator from './components/UploadIndicator'
import { LocalDriveProvider } from './context/LocalDriveContext'
import { LocalAccountProvider } from './context/LocalAccountContext'
import LocalDashboard from './pages/LocalDashboard'
import LocalDrives from './pages/LocalDrives'
import LocalCallback from './pages/LocalCallback'
import LocalLogin from './pages/LocalLogin'
import LocalRegister from './pages/LocalRegister'
import SyncPage from './pages/SyncPage'
import Uploads from './pages/Uploads'
import { UploadProvider } from './context/UploadContext'

const App = () => (
  <LocalAccountProvider>
    <LocalDriveProvider>
      <UploadProvider>
        <BrowserRouter>
          <Routes>
            {/* Entry points */}
            <Route path="/login" element={<LocalLogin />} />
            <Route path="/register" element={<LocalRegister />} />

            {/* Google OAuth callback for local drive connect */}
            <Route path="/callback" element={<LocalCallback />} />

            {/* Main app — local account required */}
            <Route
              path="/dashboard"
              element={
                <LocalProtectedRoute>
                  <LocalDashboard />
                </LocalProtectedRoute>
              }
            />
            <Route
              path="/drives"
              element={
                <LocalProtectedRoute>
                  <LocalDrives />
                </LocalProtectedRoute>
              }
            />
            <Route
              path="/uploads"
              element={
                <LocalProtectedRoute>
                  <Uploads />
                </LocalProtectedRoute>
              }
            />

            {/* Sync to server — optional, accessible from navbar */}
            <Route
              path="/sync"
              element={
                <LocalProtectedRoute>
                  <SyncPage />
                </LocalProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <UploadIndicator />
        </BrowserRouter>
      </UploadProvider>
    </LocalDriveProvider>
  </LocalAccountProvider>
)

export default App
