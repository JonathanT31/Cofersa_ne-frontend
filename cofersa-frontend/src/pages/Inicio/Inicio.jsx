import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';


const Inicio = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/data')
      .then(res => res.json())
      .then(json => {
        if (json.ok) setStats(json);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) return <Layout title="Inicio"><div>Cargando...</div></Layout>;

  return (
    <Layout title="Inicio" active="inicio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <h1 style={{ margin: 0 }}>Bienvenido, {user?.nombre} {user?.apellido}</h1>
        <span style={{ background: '#1a5276', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>v5.2.1</span>
      </div>
      
      <div className="grid-4">
        <div className="kpi-card"><div className="kpi-value">{stats.pendientes}</div><div className="kpi-label">Pendientes Totales</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.total_sol_sel}</div><div className="kpi-label">Solicitudes (período)</div></div>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(stats.gasto_sel)}</div><div className="kpi-label">Gasto Desc.</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.consumo_pct}%</div><div className="kpi-label">Consumo Ppto.</div></div>
      </div>
      
      <div className="grid-2" style={{ marginTop: '20px' }}>
        <div className="card">
          <Link to="/mis-solicitudes" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>📋 Mis Solicitudes</Link>
        </div>
        <div className="card">
          <Link to="/solicitud/nueva" className="btn btn-success" style={{ width: '100%', justifyContent: 'center' }}>+ Nueva Solicitud</Link>
        </div>
      </div>
    </Layout>
  );
};

export default Inicio;
