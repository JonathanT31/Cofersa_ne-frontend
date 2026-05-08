import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Datos simulados basados en la estructura de la BD
const mockSolicitudes = [
  {
    id: 101,
    folio: 'NE-0101',
    cliente_nombre: 'Ferreteria X',
    numero_pedido: 'PED-500',
    monto_total_descuento: 150000,
    estado: 'pendiente',
    created_at: '2026-05-01 10:00:00'
  },
  {
    id: 102,
    folio: 'NE-0102',
    cliente_nombre: 'Construcciones Y',
    numero_pedido: '',
    monto_total_descuento: 250000,
    estado: 'aprobada',
    created_at: '2026-05-02 11:30:00'
  },
  {
    id: 103,
    folio: '',
    cliente_nombre: 'Distribuidora Z',
    numero_pedido: 'PED-502',
    monto_total_descuento: 50000,
    estado: 'rechazada',
    created_at: '2026-05-03 14:15:00'
  },
  {
    id: 104,
    folio: 'NE-0104',
    cliente_nombre: 'Maderas ABC',
    numero_pedido: 'PED-505',
    monto_total_descuento: 80000,
    estado: 'en_revision',
    created_at: '2026-05-04 09:45:00'
  }
];

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
  const [solicitudes] = useState(mockSolicitudes);

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
