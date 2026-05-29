import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const APP_VERSION = "v5.2.1";

const Layout = ({ children, title, active }) => {
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const toggleNav = () => setNavOpen(!navOpen);

  // Priorizamos el rol del objeto user, si no existe, probamos metadatos, si no, fallback
  const rawRole = user?.role || user?.user_metadata?.role || 'vendedor';
  const role = rawRole.toLowerCase();

  const roleLabels = {
    vendedor: 'Vendedor',
    supervisor: 'Supervisor',
    gerente_ventas: 'Gte. Ventas',
    compras: 'Compras',
    admin: 'Admin'
  };

  const navItems = [];
  navItems.push({ href: '/', label: 'Inicio', key: 'inicio' });
  navItems.push({ href: '/solicitud/nueva', label: 'Nueva Solicitud', key: 'nueva' });
  navItems.push({ href: '/mis-solicitudes', label: 'Mis Solicitudes', key: 'mis' });

  // Los administradores, supervisores y gerentes ven la bandeja y el dashboard
  if (role !== 'vendedor' || role === 'admin') {
    navItems.push({ href: '/bandeja', label: 'Bandeja Aprobación', key: 'bandeja' });
    navItems.push({ href: '/dashboard', label: 'Dashboard', key: 'dashboard' });
  }
  
  navItems.push({ href: '/exportar', label: 'Exportar', key: 'exportar' });

  // Reglas y Presupuesto para Admin y Compras
  if (role === 'admin' || role === 'compras') {
    navItems.push({ href: '/admin/reglas', label: 'Reglas', key: 'reglas' });
    navItems.push({ href: '/admin/presupuesto', label: 'Presupuesto', key: 'presupuesto' });
  }

  // Secciones exclusivas de Administrador
  if (role === 'admin') {
    navItems.push({ href: '/admin/usuarios', label: 'Usuarios', key: 'usuarios' });
    navItems.push({ href: '/admin/password-resets', label: 'Reseteos PW', key: 'pwresets' });
    navItems.push({ href: '/admin/solicitudes', label: 'Todas Solicitudes', key: 'todas' });
    navItems.push({ href: '/admin/auditoria', label: 'Auditoría', key: 'auditoria' });
    navItems.push({ href: '/admin/config', label: 'Configuración', key: 'config' });
  }

  navItems.push({ href: '/cambiar-password', label: 'Mi Contraseña', key: 'cambiar_pw' });

  return (
    <>
      {title && (
        <title>{title} - COFERSA NE {APP_VERSION}</title>
      )}
      <nav className="topnav" id="topnav">
        <div className="nav-top-row">
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            COFERSA NE <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.7, marginLeft: '4px' }}>{APP_VERSION}</span>
          </div>
          <div className="nav-user">
            <span className="role-badge">{roleLabels[role] || role}</span>
            <span className="nav-username">{user?.nombre || user?.email || 'Usuario'} {user?.apellido || ''}</span>
            <button className="btn-logout" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { logout(); navigate('/login'); }}>Salir</button>
          </div>
          <button className="nav-hamburger" onClick={toggleNav} aria-label="Menu">
            &#9776;
          </button>
        </div>
        <div className={`nav-links ${navOpen ? 'open' : ''}`} id="navLinks">
          {navItems.map(item => (
            <Link
              key={item.key}
              to={item.href}
              className={item.key === active ? 'active' : ''}
              onClick={() => setNavOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="container">
        {children}
        <div style={{ marginTop: '32px', padding: '10px 0', borderTop: '1px solid #e0e4ea', textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: '#aaa' }}>COFERSA NE · {APP_VERSION}</span>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: '12px', right: '14px', zIndex: 999, pointerEvents: 'none' }}>
        <span style={{
          background: 'rgba(26,82,118,0.85)', color: 'white', padding: '3px 10px', borderRadius: '10px',
          fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px', backdropFilter: 'blur(4px)'
        }}>
          COFERSA NE {APP_VERSION}
        </span>
      </div>
    </>
  );
};

export default Layout;
