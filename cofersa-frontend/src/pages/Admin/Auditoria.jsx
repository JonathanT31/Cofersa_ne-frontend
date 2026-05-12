import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const Auditoria = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ logs: [], total: 0, page: 1, per_page: 100 });
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/auditoria?${searchParams.toString()}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchParams]);

  const changePage = (p) => {
    searchParams.set('page', p);
    setSearchParams(searchParams);
  };

  const totalPages = Math.ceil((data.total || 0) / (data.per_page || 100));

  return (
    <Layout title="Auditoría" active="auditoria">
      <h1>Auditoría del Sistema</h1>
      <div className="card">
        <p style={{ fontSize: '12px', color: '#888' }}>Total: {data.total} registros | Página {data.page} de {totalPages}</p>
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="6" className="text-center">Cargando...</td></tr> : data.logs.map((log, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '11px' }}>{log.created_at}</td>
                  <td>{log.username}</td>
                  <td>{log.action}</td>
                  <td>{log.entity_type} {log.entity_id}</td>
                  <td style={{ fontSize: '11px', maxWidth: '300px', overflow: 'hidden' }}>{log.details}</td>
                  <td style={{ fontSize: '10px' }}>{log.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '10px' }}>
          {Array.from({ length: Math.min(10, totalPages) }, (_, i) => i + 1).map(p => (
            <button key={p} className={`btn btn-sm ${p === data.page ? 'btn-primary' : 'btn-outline'}`} onClick={() => changePage(p)} style={{ marginRight: '4px' }}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: '10px' }}>
        <a href="/api/export/auditoria" className="btn btn-outline btn-sm">Exportar CSV</a>
      </div>
    </Layout>
  );
};

export default Auditoria;
