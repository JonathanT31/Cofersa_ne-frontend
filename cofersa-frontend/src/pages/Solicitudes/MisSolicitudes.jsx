import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const EstadoBadge = ({ estado }) => {
  const clsMap = {
    'borrador': 'badge-draft', 'pendiente': 'badge-pending',
    'en_revision': 'badge-review', 'escalada': 'badge-escalated',
    'aprobada': 'badge-approved', 'parcialmente_aprobada': 'badge-escalated',
    'rechazada': 'badge-rejected', 'cancelada': 'badge-cancelled',
  };
  const labels = {
    'borrador': 'Borrador', 'pendiente': 'Pendiente',
    'en_revision': 'En Revisión', 'escalada': 'Escalada',
    'aprobada': 'Aprobada', 'parcialmente_aprobada': 'Parcial',
    'rechazada': 'Rechazada', 'cancelada': 'Cancelada',
  };
  return <span className={`badge ${clsMap[estado] || 'badge-draft'}`}>{labels[estado] || estado}</span>;
};

const MisSolicitudes = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/solicitudes/mis')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setSolicitudes(data.solicitudes);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Mis Solicitudes" active="mis">
      <h1>Mis Solicitudes</h1>
      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th><th>Cliente</th><th>Pedido</th>
                <th className="text-right">Monto Desc.</th><th>Estado</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Cargando...</td></tr>
              ) : solicitudes.length > 0 ? (
                solicitudes.map(r => (
                  <tr key={r.id}>
                    <td><Link to={`/solicitud/${r.id}`}>{r.folio || `#${r.id}`}</Link></td>
                    <td>{r.cliente_nombre}</td>
                    <td>{r.numero_pedido}</td>
                    <td className="text-right">{formatCRC(r.monto_total_descuento)}</td>
                    <td><EstadoBadge estado={r.estado} /></td>
                    <td>{r.created_at.substring(0, 16)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="text-center">No hay solicitudes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default MisSolicitudes;
