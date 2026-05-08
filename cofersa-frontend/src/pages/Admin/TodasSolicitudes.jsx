import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const mockSolicitudes = [
  { id: 101, folio: 'NE-0101', vendedor_nombre: 'Juan Perez', cliente_nombre: 'Ferreteria X', numero_pedido: 'PED-500', monto_total_descuento: 150000, monto_total_aprobado: 150000, estado: 'aprobada', created_at: '2026-05-01 10:00:00' },
  { id: 102, folio: 'NE-0102', vendedor_nombre: 'Sofia Lopez', cliente_nombre: 'Construcciones Y', numero_pedido: 'PED-505', monto_total_descuento: 85000, monto_total_aprobado: 0, estado: 'pendiente', created_at: '2026-05-02 11:30:00' },
  { id: 103, folio: 'NE-0103', vendedor_nombre: 'Carlos Ruiz', cliente_nombre: 'Distribuidora Z', numero_pedido: '', monto_total_descuento: 200000, monto_total_aprobado: 0, estado: 'rechazada', created_at: '2026-05-03 14:15:00' }
];

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
  const [solicitudes] = useState(mockSolicitudes);

  return (
    <Layout title="Todas Solicitudes" active="todas">
      <h1>Todas las Solicitudes</h1>
      
      <div className="filters-bar">
        <div className="form-group">
          <label>Estado</label>
          <select className="form-control">
            <option value="">Todos</option>
            <option value="pendiente">pendiente</option>
            <option value="aprobada">aprobada</option>
            <option value="rechazada">rechazada</option>
            <option value="escalada">escalada</option>
            <option value="cancelada">cancelada</option>
          </select>
        </div>
        <div className="form-group">
          <label>Desde</label>
          <input type="date" className="form-control" />
        </div>
        <div className="form-group">
          <label>Hasta</label>
          <input type="date" className="form-control" />
        </div>
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
                <th className="text-right">Monto Sol.</th>
                <th className="text-right">Monto Aprob.</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id}>
                  <td><Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link></td>
                  <td>{s.vendedor_nombre}</td>
                  <td>{s.cliente_nombre}</td>
                  <td>{s.numero_pedido}</td>
                  <td className="text-right">{formatCRC(s.monto_total_descuento)}</td>
                  <td className="text-right">{formatCRC(s.monto_total_aprobado)}</td>
                  <td><EstadoBadge estado={s.estado} /></td>
                  <td>{s.created_at.substring(0, 16)}</td>
                </tr>
              ))}
              {solicitudes.length === 0 && (
                <tr><td colSpan="8" className="text-center">No hay solicitudes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default TodasSolicitudes;
