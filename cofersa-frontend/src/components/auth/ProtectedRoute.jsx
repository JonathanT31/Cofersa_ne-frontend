import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null; // O un spinner si prefieres
  }

  if (!user) {
    // Redirigir al login pero guardar la URL que se intentó acceder
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles) {
    const userRole = (user.role || '').toLowerCase();
    // Los admins siempre tienen acceso, si no, verificar si el rol está permitido
    if (userRole !== 'admin' && !allowedRoles.map(r => r.toLowerCase()).includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
