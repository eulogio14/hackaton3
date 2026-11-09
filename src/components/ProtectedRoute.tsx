/* Praise Kier */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Permission } from "../lib/types";
import { FullScreenLoading } from "./Loading";
import { ForbiddenPage } from "../pages/Forbidden";

export function ProtectedRoute({
  permission,
  children,
}: {
  permission?: Permission;
  children: React.ReactNode;
}): JSX.Element {
  const { status, hasPermission } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoading />;
  if (status === "anonymous") {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (permission && !hasPermission(permission)) return <ForbiddenPage />;
  return <>{children}</>;
}
