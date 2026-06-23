import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Inicio from './pages/Inicio/Inicio'
import Dashboard from './pages/Dashboard/Dashboard'
import NuevaSolicitud from './pages/Solicitudes/NuevaSolicitud'
import MisSolicitudes from './pages/Solicitudes/MisSolicitudes'
import BandejaAprobacion from './pages/BandejaAprobacion/BandejaAprobacion'
import DetalleSolicitud from './pages/Solicitudes/DetalleSolicitud'
import Exportar from './pages/Exportar/Exportar'
import Notificaciones from './pages/Notificaciones/Notificaciones'
import Reglas from './pages/Admin/Reglas'
import Presupuesto from './pages/Admin/Presupuesto'
import Usuarios from './pages/Admin/Usuarios'
import PasswordResets from './pages/Admin/PasswordResets'
import TodasSolicitudes from './pages/Admin/TodasSolicitudes'
import Auditoria from './pages/Admin/Auditoria'
import Configuracion from './pages/Admin/Configuracion'
import CambiarPassword from './pages/CambiarPassword/CambiarPassword'
import Login from './pages/Auth/Login'
import SolicitarReset from './pages/Auth/SolicitarReset'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/solicitar-reset" element={<SolicitarReset />} />
          
          <Route path="/" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'supervisor', 'gerente_ventas', 'compras']}><Dashboard /></ProtectedRoute>} />
          <Route path="/solicitud/nueva" element={<ProtectedRoute><NuevaSolicitud /></ProtectedRoute>} />
          <Route path="/mis-solicitudes" element={<ProtectedRoute><MisSolicitudes /></ProtectedRoute>} />
          <Route path="/bandeja" element={<ProtectedRoute allowedRoles={['admin', 'supervisor', 'gerente_ventas', 'compras']}><BandejaAprobacion /></ProtectedRoute>} />
          <Route path="/solicitud/:id" element={<ProtectedRoute><DetalleSolicitud /></ProtectedRoute>} />
          <Route path="/exportar" element={<ProtectedRoute><Exportar /></ProtectedRoute>} />
          <Route path="/notificaciones" element={<ProtectedRoute><Notificaciones /></ProtectedRoute>} />
          
          <Route path="/admin/reglas" element={<ProtectedRoute allowedRoles={['admin', 'compras']}><Reglas /></ProtectedRoute>} />
          <Route path="/admin/presupuesto" element={<ProtectedRoute allowedRoles={['admin', 'compras']}><Presupuesto /></ProtectedRoute>} />
          <Route path="/admin/usuarios" element={<ProtectedRoute allowedRoles={['admin']}><Usuarios /></ProtectedRoute>} />
          <Route path="/admin/password-resets" element={<ProtectedRoute allowedRoles={['admin']}><PasswordResets /></ProtectedRoute>} />
          <Route path="/admin/solicitudes" element={<ProtectedRoute allowedRoles={['admin', 'compras', 'gerente_ventas']}><TodasSolicitudes /></ProtectedRoute>} />
          <Route path="/admin/auditoria" element={<ProtectedRoute allowedRoles={['admin']}><Auditoria /></ProtectedRoute>} />
          
          
          <Route path="/cambiar-password" element={<ProtectedRoute><CambiarPassword /></ProtectedRoute>} />
          
          <Route path="*" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
