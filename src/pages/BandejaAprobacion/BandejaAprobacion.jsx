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
    case 'escalada':
      className += 'badge-warning';
      label = estado === 'en_revision' ? 'En Revisión' : 'Escalada';
      break;
    case 'aprobada':
      className += 'badge-approved';
      label = 'Aprobada';
      break;
    case 'parcialmente_aprobada':
      className += 'badge-warning';
      label = 'Parcialmente Aprob.';
      break;
    case 'rechazada':
    case 'cancelada':
      className += 'badge-rejected';
      label = estado.charAt(0).toUpperCase() + estado.slice(1);
      break;
    default:
      className += 'badge-pending';
  }

  return <span className={className}>{label}</span>;
};

const BandejaAprobacion = () => {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [estadosOpen, setEstadosOpen] = useState(false);
  const [marcasOpen, setMarcasOpen] = useState(false);

  useEffect(() => {
    const fetchSolicitudes = async () => {
      try {
        setLoading(true);
        // Build query
        let query = supabase
          .from('solicitudes')
          .select(`
            *,
            vendedor:profiles!vendedor_id(nombre, apellido)
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

  return (
    <Layout title="Bandeja de Aprobación" active="bandeja">
      <h1>Bandeja de Aprobación</h1>
      
      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th className="text-right">Monto Desc.</th>
                <th>Estado</th>
                <th>Nivel</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center">Cargando...</td></tr>
              ) : solicitudes.length > 0 ? (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                    </td>
                    <td>{s.vendedor ? `${s.vendedor.nombre} ${s.vendedor.apellido}` : 'Unknown'}</td>
                    <td>{s.cliente_nombre}</td>
                    <td>{s.numero_pedido}</td>
                    <td className="text-right">{formatCRC(s.monto_total_descuento)}</td>
                    <td><EstadoBadge estado={s.estado} /></td>
                    <td style={{ fontSize: '12px' }}>{s.aprobador_nivel}</td>
                    <td style={{ fontSize: '12px' }}>{s.created_at?.substring(0, 16)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="text-center color-muted" style={{ padding: '20px' }}>
                    No hay solicitudes pendientes
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
