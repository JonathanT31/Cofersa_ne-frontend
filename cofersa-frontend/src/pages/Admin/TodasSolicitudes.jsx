import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n) || n === null) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const EstadoBadge = ({ estado }) => {
  let className = 'badge ';
  let label = estado;
  
  switch (estado) {
    case 'pendiente': className += 'badge-pending'; label = 'Pendiente'; break;
    case 'en_revision':
    case 'escalada': className += 'badge-warning'; label = estado === 'en_revision' ? 'En Revisión' : 'Escalada'; break;
    case 'aprobada': className += 'badge-approved'; label = 'Aprobada'; break;
    case 'parcialmente_aprobada': className += 'badge-warning'; label = 'Parcialmente Aprob.'; break;
    case 'rechazada':
    case 'cancelada': className += 'badge-rejected'; label = estado.charAt(0).toUpperCase() + estado.slice(1); break;
    default: className += 'badge-pending';
  }

  return <span className={className}>{label}</span>;
};

const TodasSolicitudes = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [filterSearch, setFilterSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('solicitudes')
        .select(`
            *,
            vendedor:profiles!vendedor_id(nombre, apellido)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSolicitudes(data || []);
    } catch (err) {
      console.error('Error fetching all solicitudes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering logic
  const filteredSolicitudes = solicitudes.filter(s => {
    // 1. Text Search Filter (Folio, Cliente, Vendedor, Pedido)
    const searchLower = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchLower ||
      (s.folio || '').toLowerCase().includes(searchLower) ||
      (s.cliente_nombre || '').toLowerCase().includes(searchLower) ||
      (s.cliente_codigo || '').toLowerCase().includes(searchLower) ||
      (s.numero_pedido || '').toLowerCase().includes(searchLower) ||
      (s.vendedor ? `${s.vendedor.nombre} ${s.vendedor.apellido}` : '').toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // 2. Estado Filter
    if (filterEstado && s.estado !== filterEstado) {
      return false;
    }

    // 3. Date Filters (comparing YYYY-MM-DD strings)
    if (s.created_at) {
      const createdDate = s.created_at.substring(0, 10);
      if (filterDesde && createdDate < filterDesde) {
        return false;
      }
      if (filterHasta && createdDate > filterHasta) {
        return false;
      }
    } else {
      if (filterDesde || filterHasta) {
        return false;
      }
    }

    return true;
  });

  // Pagination parameters
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentSolicitudes = filteredSolicitudes.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredSolicitudes.length / itemsPerPage);

  const cleanAllFilters = () => {
    setFilterSearch('');
    setFilterEstado('');
    setFilterDesde('');
    setFilterHasta('');
    setCurrentPage(1);
  };

  return (
    <Layout title="Todas Solicitudes" active="todas">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <h1 style={{ margin: 0 }}>Todas las Solicitudes</h1>
        <button className="btn btn-outline btn-sm" onClick={fetchSolicitudes}>Actualizar</button>
      </div>
      
      {/* Filter Bar */}
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
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Buscar Folio / Cliente / Vendedor</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Buscar..." 
            value={filterSearch} 
            onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, minWidth: '160px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Estado</label>
          <select 
            className="form-control" 
            value={filterEstado} 
            onChange={e => { setFilterEstado(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_revision">En Revisión</option>
            <option value="escalada">Escalada</option>
            <option value="aprobada">Aprobada</option>
            <option value="parcialmente_aprobada">Parcialmente Aprobada</option>
            <option value="rechazada">Rechazada</option>
            <option value="cancelada">Cancelada</option>
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
            onClick={cleanAllFilters}
            style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center' }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px', fontWeight: 500 }}>
        {!loading && `Mostrando ${filteredSolicitudes.length} de ${solicitudes.length} solicitudes.`}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th>Monto Aprobado</th>
                <th className="text-right">Estado</th>
                <th>Fecha Creación</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center" style={{ padding: '20px' }}>Cargando solicitudes...</td></tr>
              ) : currentSolicitudes.map(s => (
                <tr key={s.id}>
                  <td><Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link></td>
                  <td>{s.vendedor ? `${s.vendedor.nombre} ${s.vendedor.apellido}` : '—'}</td>
                  <td>{s.cliente_nombre}</td>
                  <td>{s.numero_pedido || '—'}</td>
                  <td>{formatCRC(s.monto_total_aprobado || s.monto_total_descuento)}</td>
                  <td className="text-right"><EstadoBadge estado={s.estado} /></td>
                  <td>{s.created_at ? s.created_at.substring(0, 16).replace('T', ' ') : '—'}</td>
                </tr>
              ))}
              {!loading && filteredSolicitudes.length === 0 && (
                <tr><td colSpan="7" className="text-center" style={{ padding: '20px' }}>No se encontraron solicitudes con los filtros aplicados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
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
    </Layout>
  );
};

export default TodasSolicitudes;
