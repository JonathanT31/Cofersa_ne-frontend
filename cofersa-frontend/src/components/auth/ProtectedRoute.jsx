import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Redirigir al login pero guardar la URL que se intentó acceder
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // El usuario ha iniciado sesión pero no tiene permiso para esta ruta
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
