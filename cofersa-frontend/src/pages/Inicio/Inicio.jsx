import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const APP_VERSION = "v5.2.1";

const Inicio = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    pendientes: 0,
    aprobadas: 0,
    rechazadas: 0,
    montoMes: 0,
    usuariosActivos: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const role = user.role;
      const userId = user.id;

      // 1. Obtener conteos de solicitudes
      let query = supabase.from('solicitudes').select('estado, monto_total_aprobado, created_at');
      
      if (role === 'vendedor') {
        query = query.eq('vendedor_id', userId);
      } else if (role === 'supervisor') {
        // Para supervisor, mostrar las solicitudes donde él es aprobador actual
        // o las creadas por él
        query = query.or(`vendedor_id.eq.${userId},aprobador_actual_id.eq.${userId}`);
      }

      const { data: solicitudes, error } = await query;
      if (error) throw error;

      // Calcular estadísticas
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      let pendientes = 0;
      let aprobadas = 0;
      let rechazadas = 0;
      let montoMes = 0;

      solicitudes?.forEach(s => {
        const date = new Date(s.created_at);
        const isCurrentMonth = date >= firstDayOfMonth;

        if (s.estado === 'pendiente' || s.estado === 'en_revision' || s.estado === 'escalada' || s.estado === 'parcialmente_aprobada') {
          pendientes++;
        } else if (s.estado === 'aprobada') {
          aprobadas++;
          if (isCurrentMonth) {
            montoMes += parseFloat(s.monto_total_aprobado) || 0;
          }
        } else if (s.estado === 'rechazada') {
          rechazadas++;
        }
      });

      // 2. Obtener usuarios activos (solo para admin/compras)
      let usuariosActivos = 0;
      if (role === 'admin' || role === 'compras' || role === 'gerente_ventas') {
        const { count, error: userError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'activo');
        if (!userError) usuariosActivos = count || 0;
      }

      setStats({
        pendientes,
        aprobadas,
        rechazadas,
        montoMes,
        usuariosActivos
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const nombreUsuario = user?.nombre ? `${user.nombre} ${user.apellido || ''}` : user?.username || 'Usuario';
  const roleDisplay = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Vendedor';

  return (
    <Layout title="Inicio" active="inicio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ margin: 0 }}>Bienvenido, {nombreUsuario}</h1>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Rol: <strong>{roleDisplay}</strong></span>
        </div>
        <span style={{ background: '#1a5276', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{APP_VERSION}</span>
      </div>
      
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          <div className="spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #1a5276', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }}></div>
          Cargando panel de resumen...
        </div>
      ) : (
        <>
          <div className="grid-4">
            <div className="kpi-card">
              <div className="kpi-value">{stats.pendientes}</div>
              <div className="kpi-label">{user?.role === 'vendedor' ? 'Mis Pendientes' : 'Pendientes Totales'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{stats.aprobadas}</div>
              <div className="kpi-label">{user?.role === 'vendedor' ? 'Mis Aprobadas' : 'Aprobadas Totales'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{formatCRC(stats.montoMes)}</div>
              <div className="kpi-label">Descuento Aprobado (mes)</div>
            </div>
            {(user?.role === 'admin' || user?.role === 'compras' || user?.role === 'gerente_ventas') ? (
              <div className="kpi-card">
                <div className="kpi-value">{stats.usuariosActivos}</div>
                <div className="kpi-label">Usuarios Activos</div>
              </div>
            ) : (
              <div className="kpi-card">
                <div className="kpi-value">{stats.rechazadas}</div>
                <div className="kpi-label">{user?.role === 'vendedor' ? 'Mis Rechazadas' : 'Rechazadas Totales'}</div>
              </div>
            )}
          </div>
          
          <div className="card" style={{ marginTop: '24px' }}>
            <h3>🚀 Acciones Rápidas</h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
              <Link to="/solicitud/nueva" className="btn btn-success">
                + Crear Nueva Solicitud
              </Link>
              
              {user?.role === 'vendedor' ? (
                <Link to="/mis-solicitudes" className="btn btn-primary">
                  📋 Ver Mis Solicitudes
                </Link>
              ) : (
                <>
                  <Link to="/bandeja" className="btn btn-primary">
                    Bandeja de Aprobación
                  </Link>
                  {['admin', 'compras', 'gerente_ventas'].includes(user?.role) && (
                    <>
                      <Link to="/admin/solicitudes" className="btn btn-outline">
                        🔎 Todas las Solicitudes
                      </Link>
                      <Link to="/dashboard" className="btn btn-outline">
                        📊 Ver Dashboard completo
                      </Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
};

export default Inicio;
