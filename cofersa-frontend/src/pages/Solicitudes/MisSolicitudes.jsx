import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';

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

const MisSolicitudes = () => {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchSolicitudes = async () => {
      try {
        const result = await httpClient(`${ENDPOINTS.solicitudes.base}?vendedor_id=${user?.id || ''}`, {
          headers: { 'X-User-Id': user?.id || '' }
        });
        if (result.success) {
          setSolicitudes(result.data || []);
        }
      } catch (err) {
        console.error("Error fetching solicitudes:", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchSolicitudes();
  }, [user]);

  if (loading) return <Layout title="Mis Solicitudes" active="mis"><div className="text-center" style={{padding:'40px'}}>Cargando solicitudes...</div></Layout>;

  return (
    <Layout title="Mis Solicitudes" active="mis">
      <h1>Mis Solicitudes</h1>
      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th className="text-right">Monto Desc.</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.length > 0 ? (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                    </td>
                    <td>{s.cliente_nombre}</td>
                    <td>{s.numero_pedido}</td>
                    <td className="text-right">{formatCRC(s.monto_total_descuento)}</td>
                    <td><EstadoBadge estado={s.estado} /></td>
                    <td>{s.created_at.substring(0, 16)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center">No hay solicitudes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default MisSolicitudes;
