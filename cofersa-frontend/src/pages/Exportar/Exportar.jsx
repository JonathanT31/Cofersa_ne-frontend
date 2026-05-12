import React from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';

const Exportar = () => {
  const { user } = useAuth();
  const role = user?.role || 'vendedor';

  return (
    <Layout title="Exportar" active="exportar">
      <h1>Exportar Datos</h1>
      <p style={{ color: '#555', fontSize: '13px', marginBottom: '16px' }}>
        Los datos exportados respetan tu nivel de acceso en el sistema.
      </p>
      
      <div className="grid-2">
        <div className="card">
          <div className="card-header">Solicitudes y Aprobaciones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href="/api/export/solicitudes" className="btn btn-primary btn-sm">Todas las Solicitudes (CSV)</a>
            <a href="/api/export/aprobadas" className="btn btn-success btn-sm">Solo Aprobadas (CSV)</a>
            <a href="/api/export/powerbi" className="btn btn-outline btn-sm">Dataset Power BI (CSV)</a>
          </div>
          
          {role === 'vendedor' && (
            <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Solo tus solicitudes</p>
          )}
          {role === 'supervisor' && (
            <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Solicitudes de tus vendedores</p>
          )}
        </div>
        
        {role !== 'vendedor' && (
          <div className="card">
            <div className="card-header">Presupuesto</div>
            <p>
              <a href="/api/export/presupuesto" className="btn btn-primary btn-sm">Exportar Presupuesto (CSV)</a>
            </p>
            {role === 'supervisor' && (
              <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Presupuesto de tus vendedores</p>
            )}
          </div>
        )}
        
        {role === 'admin' && (
          <div className="card">
            <div className="card-header">Admin</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <a href="/api/export/reglas" className="btn btn-primary btn-sm">Exportar Reglas (CSV)</a>
              <a href="/api/export/auditoria" className="btn btn-outline btn-sm">Exportar Auditoría (CSV)</a>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Exportar;
