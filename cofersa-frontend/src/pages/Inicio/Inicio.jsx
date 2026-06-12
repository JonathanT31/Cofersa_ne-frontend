import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const APP_VERSION = "v5.2.1";

const Inicio = () => {
  return (
    <Layout title="Inicio" active="inicio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <h1 style={{ margin: 0 }}>Bienvenido, Admin Prueba</h1>
        <span style={{ background: '#1a5276', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{APP_VERSION}</span>
      </div>
      
      <div className="grid-4">
        <div className="kpi-card"><div className="kpi-value">12</div><div className="kpi-label">Pendientes Totales</div></div>
        <div className="kpi-card"><div className="kpi-value">45</div><div className="kpi-label">Solicitudes (mes)</div></div>
        <div className="kpi-card"><div className="kpi-value">₡1,250,000.00</div><div className="kpi-label">Gasto Desc. (mes)</div></div>
        <div className="kpi-card"><div className="kpi-value">8</div><div className="kpi-label">Usuarios Activos</div></div>
      </div>
      
      <div className="grid-2" style={{ marginTop: '20px' }}>
        <div className="card">
          <Link to="/admin/solicitudes" className="btn btn-primary">Ver Todas las Solicitudes</Link>
        </div>
        <div className="card">
          <Link to="/dashboard" className="btn btn-primary">Ver Dashboard</Link>
        </div>
      </div>
    </Layout>
  );
};

export default Inicio;
