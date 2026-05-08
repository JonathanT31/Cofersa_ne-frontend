import React, { useState } from 'react';
import Layout from '../../components/layout/Layout';

const mockAudit = [
  { id: 1, created_at: '2026-05-07 10:00:00', username: 'admin', action: 'config_actualizada', entity_type: '', entity_id: '', details: 'smtp_host, smtp_port', ip_address: '192.168.1.1' },
  { id: 2, created_at: '2026-05-07 09:30:00', username: 'admin', action: 'password_reset_requested', entity_type: 'user', entity_id: '15', details: 'Solicitud de reseteo para m.gomez', ip_address: '192.168.1.1' },
  { id: 3, created_at: '2026-05-06 14:00:00', username: 'j.perez', action: 'solicitud_creada', entity_type: 'solicitud', entity_id: '101', details: 'Creada folio NE-0101', ip_address: '10.0.0.5' },
];

const Auditoria = () => {
  const [logs] = useState(mockAudit);

  return (
    <Layout title="Auditoría" active="auditoria">
      <h1>Auditoría del Sistema</h1>
      
      <div className="card">
        <p style={{ fontSize: '12px', color: '#888' }}>Total: {logs.length} registros | Página 1 de 1</p>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '11px' }}>{log.created_at}</td>
                  <td>{log.username}</td>
                  <td>{log.action}</td>
                  <td>{log.entity_type} {log.entity_id}</td>
                  <td style={{ fontSize: '11px', maxWidth: '300px', overflow: 'hidden' }}>{log.details}</td>
                  <td style={{ fontSize: '10px' }}>{log.ip_address}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan="6" className="text-center">No hay registros de auditoría</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: '10px' }}>
          <button className="btn btn-primary btn-sm">1</button>
        </div>
      </div>
      
      <div style={{ marginTop: '10px' }}>
        <button className="btn btn-outline btn-sm">Exportar CSV</button>
      </div>
    </Layout>
  );
};

export default Auditoria;
