import React from 'react';
import Layout from '../../components/layout/Layout';

const Exportar = ({ user }) => {
  // Rol simulado solo para demostrar la UI, será dinámico desde AuthContext después
  const currentUser = user || { role: 'admin' };
  const role = currentUser.role;

  return (
    <Layout title="Exportar" active="exportar">
      <h1>Exportar Datos</h1>
      <p style={{ color: '#555', fontSize: '13px', marginBottom: '16px' }}>
        Los datos exportados respetan tu nivel de acceso en el sistema.
      </p>
      
      <div className="grid-2">
        <div className="card">
          <div className="card-header">Solicitudes y Aprobaciones</div>
          <p>
            <button className="btn btn-primary btn-sm">Todas las Solicitudes (CSV)</button>
          </p>
          <p style={{ marginTop: '10px' }}>
            <button className="btn btn-success btn-sm">Solo Aprobadas (CSV)</button>
          </p>
          <p style={{ marginTop: '10px' }}>
            <button className="btn btn-outline btn-sm">Dataset Power BI (CSV)</button>
          </p>
          
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
              <button className="btn btn-primary btn-sm">Exportar Presupuesto (CSV)</button>
            </p>
            {role === 'supervisor' && (
              <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Solicitudes de tus vendedores</p>
            )}
          </div>
        )}
        
        {role === 'admin' && (
          <div className="card">
            <div className="card-header">Admin</div>
            <p>
              <button className="btn btn-primary btn-sm">Exportar Reglas (CSV)</button>
            </p>
            <p style={{ marginTop: '10px' }}>
              <button className="btn btn-outline btn-sm">Exportar Auditoría (CSV)</button>
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Exportar;
