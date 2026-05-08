import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Datos simulados basados en la estructura de la BD
const mockBandeja = [
  {
    id: 201,
    folio: 'NE-0201',
    vendedor_nombre: 'Juan Perez',
    cliente_nombre: 'Ferreteria X',
    numero_pedido: 'PED-600',
    marcas: 'Marca A, Marca B',
    monto_total_descuento: 250000,
    estado: 'pendiente',
    aprobador_nivel: 'supervisor',
    created_at: '2026-05-06 08:30:00',
    sla_breached: true
  },
  {
    id: 202,
    folio: 'NE-0202',
    vendedor_nombre: 'Maria Lopez',
    cliente_nombre: 'Construcciones Y',
    numero_pedido: '',
    marcas: 'Marca C',
    monto_total_descuento: 850000,
    estado: 'en_revision',
    aprobador_nivel: 'gerente_ventas',
    created_at: '2026-05-07 09:15:00',
    sla_breached: false
  },
  {
    id: 203,
    folio: '',
    vendedor_nombre: 'Carlos Ruiz',
    cliente_nombre: 'Distribuidora Z',
    numero_pedido: 'PED-602',
    marcas: 'Marca A',
    monto_total_descuento: 45000,
    estado: 'aprobada',
    aprobador_nivel: 'compras',
    created_at: '2026-05-05 14:00:00',
    sla_breached: false
  }
];

const all_estados = [
  { val: 'pendiente', lbl: 'Pendiente' },
  { val: 'en_revision', lbl: 'En Revisión' },
  { val: 'escalada', lbl: 'Escalada' },
  { val: 'parcialmente_aprobada', lbl: 'Parcial' },
  { val: 'aprobada', lbl: 'Aprobada' },
  { val: 'rechazada', lbl: 'Rechazada' },
  { val: 'cancelada', lbl: 'Cancelada' },
];

const all_marcas = ['Marca A', 'Marca B', 'Marca C'];

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
  const [solicitudes] = useState(mockBandeja);
  
  const [estadosOpen, setEstadosOpen] = useState(false);
  const [marcasOpen, setMarcasOpen] = useState(false);

  return (
    <Layout title="Bandeja de Aprobación" active="bandeja">
      <h1>Bandeja de Aprobación</h1>
      
      <div className="filters-bar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        
        <div className="form-group" style={{ margin: 0, position: 'relative' }}>
          <label style={{ fontSize: '11px', color: '#888' }}>Estado</label>
          <button type="button" onClick={() => setEstadosOpen(!estadosOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
            <span>Pendientes</span>
            <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
          </button>
          
          {estadosOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '300px', overflowY: 'auto', padding: '4px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                <input type="checkbox" checked readOnly style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                <span>Todos</span>
              </label>
              {all_estados.map(e => (
                <label key={e.val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" readOnly style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                  <span>{e.lbl}</span>
                </label>
              ))}
              <div style={{ padding: '8px 10px', borderTop: '1px solid #eee' }}>
                <button style={{ width: '100%', padding: '7px', background: '#1a5276', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Aplicar</button>
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ margin: 0, position: 'relative' }}>
          <label style={{ fontSize: '11px', color: '#888' }}>Marca</label>
          <button type="button" onClick={() => setMarcasOpen(!marcasOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
            <span>Todas</span>
            <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
          </button>
          
          {marcasOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '300px', overflowY: 'auto', padding: '4px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                <input type="checkbox" checked readOnly style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                <span>Todas</span>
              </label>
              {all_marcas.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" readOnly style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                  <span>{m}</span>
                </label>
              ))}
              <div style={{ padding: '8px 10px', borderTop: '1px solid #eee' }}>
                <button style={{ width: '100%', padding: '7px', background: '#1a5276', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Aplicar</button>
              </div>
            </div>
          )}
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
                <th>Marcas</th>
                <th className="text-right">Monto Desc.</th>
                <th>Estado</th>
                <th>Nivel</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.length > 0 ? (
                solicitudes.map((s) => (
                  <tr key={s.id} style={s.sla_breached ? { background: '#fff3e0' } : {}}>
                    <td>
                      <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                    </td>
                    <td>{s.vendedor_nombre}</td>
                    <td>{s.cliente_nombre}</td>
                    <td>{s.numero_pedido}</td>
                    <td className="wrap" style={{ maxWidth: '160px', fontSize: '12px', color: '#555' }}>{s.marcas}</td>
                    <td className="text-right">{formatCRC(s.monto_total_descuento)}</td>
                    <td><EstadoBadge estado={s.estado} /></td>
                    <td style={{ fontSize: '12px' }}>{s.aprobador_nivel}</td>
                    <td style={{ fontSize: '12px' }}>{s.created_at.substring(0, 16)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center color-muted" style={{ padding: '20px' }}>
                    No hay solicitudes para los filtros seleccionados
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
