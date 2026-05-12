import React, { useState, useEffect } from 'react';
import { formatCRC, EstadoBadge } from "../../components/common/UIComponents";
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const TodasSolicitudes = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFilters] = useState({ estado: '', desde: '', hasta: '' });

  useEffect(() => {
    const params = new URLSearchParams(filtros);
    setLoading(true);
    fetch(`/api/admin/solicitudes?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        if (json.ok) setSolicitudes(json.solicitudes);
      })
      .finally(() => setLoading(false));
  }, [filtros]);

  return (
    <Layout title="Todas Solicitudes" active="todas">
      <h1>Todas las Solicitudes</h1>
      
      <div className="filters-bar">
        <div className="form-group">
          <label>Estado</label>
          <select className="form-control" value={filtros.estado} onChange={e => setFilters({...filtros, estado: e.target.value})}>
            <option value="">Todos</option>
            {['pendiente','aprobada','rechazada','escalada','cancelada'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Desde</label>
          <input type="date" className="form-control" value={filtros.desde} onChange={e => setFilters({...filtros, desde: e.target.value})} />
        </div>
        <div className="form-group">
          <label>Hasta</label>
          <input type="date" className="form-control" value={filtros.hasta} onChange={e => setFilters({...filtros, hasta: e.target.value})} />
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th><th>Vendedor</th><th>Cliente</th><th>Pedido</th>
                <th className="text-right">Monto Sol.</th><th className="text-right">Monto Aprob.</th>
                <th>Estado</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8" className="text-center">Cargando...</td></tr> : solicitudes.map(s => (
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
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default TodasSolicitudes;
