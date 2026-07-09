import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const Auditoria = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Pagination States
  const [filterSearch, setFilterSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500); // Aumentado a 500 para permitir búsquedas más amplias
      
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering logic
  const filteredLogs = logs.filter(l => {
    const searchLower = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchLower ||
      (l.username || '').toLowerCase().includes(searchLower) ||
      (l.entity_type || '').toLowerCase().includes(searchLower) ||
      (String(l.entity_id || '')).includes(searchLower) ||
      (l.details || '').toLowerCase().includes(searchLower);

    const matchesAction = !filterAction || l.action === filterAction;

    if (l.created_at) {
      const createdDate = l.created_at.substring(0, 10);
      if (filterDesde && createdDate < filterDesde) return false;
      if (filterHasta && createdDate > filterHasta) return false;
    } else {
      if (filterDesde || filterHasta) return false;
    }

    return matchesSearch && matchesAction;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const uniqueActions = [...new Set(logs.map(l => l.action).filter(Boolean))].sort();

  const exportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Fecha', 'Usuario', 'Accion', 'Entidad', 'ID Entidad', 'Detalles', 'IP'];
    const csvRows = filteredLogs.map(l => [
      l.created_at,
      l.username,
      l.action,
      l.entity_type,
      l.entity_id,
      `"${l.details?.replace(/"/g, '""')}"`,
      l.ip_address
    ].join(','));
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += [headers.join(','), ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_filtrada_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout title="Auditoría" active="auditoria">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <h1 style={{ margin: 0 }}>Auditoría del Sistema</h1>
        <button className="btn btn-outline btn-sm" onClick={fetchLogs}>Actualizar</button>
      </div>
      
      {/* Barra de Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginBottom: '20px', 
        flexWrap: 'wrap', 
        alignItems: 'center', 
        background: '#f8fafc', 
        padding: '15px', 
        borderRadius: '8px', 
        border: '1px solid #e2e8f0' 
      }}>
        <div className="form-group" style={{ margin: 0, minWidth: '180px', flex: '1 1 auto' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Buscar Usuario / Detalle</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Buscar..." 
            value={filterSearch} 
            onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Acción</label>
          <select 
            className="form-control" 
            value={filterAction} 
            onChange={e => { setFilterAction(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          >
            <option value="">Todas</option>
            {uniqueActions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group" style={{ margin: 0, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Desde (Fecha)</label>
          <input 
            type="date" 
            className="form-control" 
            value={filterDesde} 
            onChange={e => { setFilterDesde(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Hasta (Fecha)</label>
          <input 
            type="date" 
            className="form-control" 
            value={filterHasta} 
            onChange={e => { setFilterHasta(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          />
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button 
            className="btn btn-outline btn-sm" 
            onClick={() => { setFilterSearch(''); setFilterAction(''); setFilterDesde(''); setFilterHasta(''); setCurrentPage(1); }}
            style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center' }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px', fontWeight: 500 }}>
        {!loading && `Mostrando ${filteredLogs.length} de ${logs.length} registros cargados.`}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}>Cargando registros...</td></tr>
              ) : currentLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '11px' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{log.username}</td>
                  <td><span className="badge badge-draft" style={{ textTransform: 'lowercase' }}>{log.action}</span></td>
                  <td style={{ fontSize: '12px', color: '#666' }}>{log.entity_type} {log.entity_id}</td>
                  <td style={{ fontSize: '11px', maxWidth: '400px' }}>{log.details}</td>
                </tr>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}>No hay registros de auditoría que coincidan con los filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <button className="btn btn-primary btn-sm" onClick={exportCSV} disabled={filteredLogs.length === 0}>
            Exportar CSV ({filteredLogs.length})
          </button>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </button>
            <span style={{ fontSize: '13px' }}>Página {currentPage} de {totalPages}</span>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Auditoria;
