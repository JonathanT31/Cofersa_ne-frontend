import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const EstadoBadge = ({ estado }) => {
  let className = 'badge ';
  let label = estado;
  
  switch (estado) {
    case 'pendiente':
      className += 'badge-pending';
      label = 'Pendiente';
      break;
    case 'en_revision':
      className += 'badge-review';
      label = 'En Revisión';
      break;
    case 'escalada':
      className += 'badge-escalated';
      label = 'Escalada';
      break;
    case 'aprobada':
      className += 'badge-approved';
      label = 'Aprobada';
      break;
    case 'parcialmente_aprobada':
      className += 'badge-warning';
      label = 'Parcialmente Aprobada';
      break;
    case 'rechazada':
      className += 'badge-rejected';
      label = 'Rechazada';
      break;
    case 'cancelada':
      className += 'badge-cancelled';
      label = 'Cancelada';
      break;
    default:
      className += 'badge-pending';
  }

  return <span className={className}>{label}</span>;
};

const stateLabels = {
  pendiente: 'Pendiente',
  en_revision: 'En Revisión',
  escalada: 'Escalada',
  aprobada: 'Aprobada',
  parcialmente_aprobada: 'Parcialmente Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada'
};

const BandejaAprobacion = () => {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMarca, setFilterMarca] = useState('');

  useEffect(() => {
    const fetchSolicitudes = async () => {
      try {
        setLoading(true);
        // Build query
        let query = supabase
          .from('solicitudes')
          .select(`
            *,
            vendedor:profiles!vendedor_id(nombre, apellido),
            skus:solicitud_skus(marca)
          `)
          .order('created_at', { ascending: false });

        // Filter based on role
        if (user?.role === 'supervisor') {
          query = query.eq('aprobador_actual_id', user.id);
        } else if (user?.role === 'vendedor') {
          query = query.eq('vendedor_id', user.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setSolicitudes(data || []);
      } catch (err) {
        console.error('Error fetching solicitudes:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchSolicitudes();
  }, [user]);

  // Extract unique brands and states
  const allBrands = [...new Set(solicitudes.flatMap(s => (s.skus || []).map(sk => sk.marca)).filter(Boolean))].sort();
  const allStates = [...new Set(solicitudes.map(s => s.estado).filter(Boolean))];

  // Reactively filter requests
  const filteredSolicitudes = solicitudes.filter(s => {
    const matchEstado = filterEstado ? s.estado === filterEstado : true;
    const matchMarca = filterMarca ? (s.skus || []).some(sk => sk.marca === filterMarca) : true;
    return matchEstado && matchMarca;
  });

  return (
    <Layout title="Bandeja de Aprobación" active="bandeja">
      <h1>Bandeja de Aprobación</h1>
      
      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', flex: '1' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a5568' }}>Filtrar por Estado</label>
          <select 
            className="form-control" 
            style={{ minHeight: '38px', height: '38px', padding: '6px 12px' }}
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {allStates.map(st => (
              <option key={st} value={st}>{stateLabels[st] || st}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', flex: '1' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a5568' }}>Filtrar por Marca</label>
          <select 
            className="form-control" 
            style={{ minHeight: '38px', height: '38px', padding: '6px 12px' }}
            value={filterMarca}
            onChange={e => setFilterMarca(e.target.value)}
          >
            <option value="">Todas las marcas</option>
            {allBrands.map(br => (
              <option key={br} value={br}>{br}</option>
            ))}
          </select>
        </div>

        {(filterEstado || filterMarca) && (
          <div style={{ display: 'flex', alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            <button 
              className="btn btn-outline" 
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px' }}
              onClick={() => { setFilterEstado(''); setFilterMarca(''); }}
            >
              Limpiar Filtros
            </button>
          </div>
        )}
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
                <th>Marcas</th>
                <th className="text-right">Monto Desc.</th>
                <th>Estado</th>
                <th>Nivel</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="text-center">Cargando...</td></tr>
              ) : filteredSolicitudes.length > 0 ? (
                filteredSolicitudes.map((s) => {
                  const requestBrands = [...new Set((s.skus || []).map(sk => sk.marca))].join(', ');
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                      </td>
                      <td>{s.vendedor ? `${s.vendedor.nombre} ${s.vendedor.apellido}` : 'Unknown'}</td>
                      <td>{s.cliente_nombre}</td>
                      <td>{s.numero_pedido || 'N/A'}</td>
                      <td style={{ fontSize: '12px', fontWeight: 500 }}>{requestBrands || 'N/A'}</td>
                      <td className="text-right">{formatCRC(s.monto_total_descuento)}</td>
                      <td><EstadoBadge estado={s.estado} /></td>
                      <td style={{ fontSize: '12px' }}>{s.aprobador_nivel}</td>
                      <td style={{ fontSize: '12px' }}>{s.created_at?.substring(0, 16)?.replace('T', ' ')}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" className="text-center color-muted" style={{ padding: '20px' }}>
                    No hay solicitudes que coincidan con los criterios de búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default BandejaAprobacion;
