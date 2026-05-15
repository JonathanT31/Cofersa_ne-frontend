import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/dashboard/stats?user_id=${user.id}&role=${user.role}`);
        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchStats();
  }, [user]);

  if (loading) return <Layout title="Dashboard"><div className="text-center" style={{padding:'50px'}}>Cargando estadísticas...</div></Layout>;

  return (
    <Layout title="Dashboard" active="dashboard">
      <div className="page-header">
        <h1>Dashboard — Control Presupuestario</h1>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card">
          <div className="kpi-value">{stats?.total_solicitudes || 0}</div>
          <div className="kpi-label">Total Solicitudes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#27ae60' }}>{stats?.aprobadas || 0}</div>
          <div className="kpi-label">Aprobadas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#e74c3c' }}>{stats?.rechazadas || 0}</div>
          <div className="kpi-label">Rechazadas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#f39c12' }}>{stats?.pendientes || 0}</div>
          <div className="kpi-label">Pendientes</div>
        </div>
      </div>

      {/* Placeholder for charts/tables that would use real data from the API */}
      <div className="card">
        <div className="card-header">Resumen por Marca (Próximamente)</div>
        <div className="text-center color-muted" style={{padding:'40px'}}>
          Los gráficos detallados se habilitarán conforme se acumulen datos reales.
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
