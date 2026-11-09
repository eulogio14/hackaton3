/* Praise Kier */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HealthGate } from "./components/HealthGate";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import { FilesPage } from "./pages/Files";
import { ForbiddenPage } from "./pages/Forbidden";
import { LoginPage } from "./pages/Login";
import { NotFoundPage } from "./pages/NotFound";
import { RefinePage } from "./pages/Refine";
import { RefinerDetailPage } from "./pages/RefinerDetail";
import { RefinerEditPage } from "./pages/RefinerEdit";
import { RefinersPage } from "./pages/Refiners";
import { RegisterPage } from "./pages/Register";

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <HealthGate>
        <BrowserRouter>
          <AuthProvider>
            <RealtimeProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/sin-permiso" element={<ForbiddenPage />} />
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/files" replace />} />
                  <Route path="files" element={<ProtectedRoute permission="files:read"><FilesPage /></ProtectedRoute>} />
                  <Route path="files/:id/refine" element={<ProtectedRoute permission="files:refine"><RefinePage /></ProtectedRoute>} />
                  <Route path="refiners" element={<ProtectedRoute permission="refiners:read"><RefinersPage /></ProtectedRoute>} />
                  <Route path="refiners/:id" element={<ProtectedRoute permission="refiners:read"><RefinerDetailPage /></ProtectedRoute>} />
                  <Route path="refiners/:id/edit" element={<ProtectedRoute permission="refiners:write"><RefinerEditPage /></ProtectedRoute>} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </RealtimeProvider>
          </AuthProvider>
        </BrowserRouter>
      </HealthGate>
    </ErrorBoundary>
  );
}
