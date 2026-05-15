import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const Auditoria = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .table('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Fecha', 'Usuario', 'Accion', 'Entidad', 'ID Entidad', 'Detalles', 'IP'];
    const csvRows = logs.map(l => [
      l.created_at,
      l.username,
      l.action,
      l.entity_type,
      l.entity_id,
      `"${l.details?.replace(/"/g, '""')}"`,
      l.ip_address
    ].join(','));
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_cofersa_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout title="Auditoría" active="auditoria">
      <h1>Auditoría del Sistema</h1>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <p style={{ fontSize: '12px', color: '#888' }}>
            {loading ? 'Cargando registros...' : `Total: ${logs.length} registros (Últimos 100)`}
          </p>
          <button className="btn btn-outline btn-sm" onClick={fetchLogs}>Actualizar</button>
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '11px' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{log.username}</td>
                  <td><span className="badge badge-draft" style={{ textTransform: 'lowercase' }}>{log.action}</span></td>
                  <td style={{ fontSize: '12px', color: '#666' }}>{log.entity_type} {log.entity_id}</td>
                  <td style={{ fontSize: '11px', maxWidth: '400px' }}>{log.details}</td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr><td colSpan="5" className="text-center">No hay registros de auditoría</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ marginTop: '10px' }}>
        <button className="btn btn-primary btn-sm" onClick={exportCSV} disabled={logs.length === 0}>
          Exportar CSV
        </button>
      </div>
    </Layout>
  );
};

export default Auditoria;
