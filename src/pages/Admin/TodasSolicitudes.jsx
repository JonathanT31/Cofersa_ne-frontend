import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
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

  return (
    <Layout title="Todas Solicitudes" active="todas">
      <h1>Todas las Solicitudes</h1>
      
      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th className="text-right">Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Cargando...</td></tr>
              ) : solicitudes.map(s => (
                <tr key={s.id}>
                  <td><Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link></td>
                  <td>{s.vendedor ? `${s.vendedor.nombre} ${s.vendedor.apellido}` : '—'}</td>
                  <td>{s.cliente_nombre}</td>
                  <td>{s.numero_pedido || '—'}</td>
                  <td className="text-right"><EstadoBadge estado={s.estado} /></td>
                  <td>{s.created_at?.substring(0, 16)}</td>
                </tr>
              ))}
              {!loading && solicitudes.length === 0 && (
                <tr><td colSpan="6" className="text-center">No hay solicitudes registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default TodasSolicitudes;
