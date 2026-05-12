import React, { useState, useEffect } from 'react';
import { formatCRC, EstadoBadge } from "../../components/common/UIComponents";
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const BandejaAprobacion = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [solicitudes, setSolicitudes] = useState([]);
  const [allMarcas, setAllMarcas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [estadosOpen, setEstadosOpen] = useState(false);
  const [marcasOpen, setMarcasOpen] = useState(false);

  const f_estados = searchParams.get('estados')?.split(',').filter(Boolean) || [];
  const f_marcas = searchParams.get('marcas')?.split(',').filter(Boolean) || [];

  useEffect(() => {
    setLoading(true);
    fetch(`/api/solicitudes/bandeja?${searchParams.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) setSolicitudes(data.solicitudes);
      })
      .finally(() => setLoading(false));

    fetch('/api/marcas')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setAllMarcas(data.marcas);
      });
  }, [searchParams]);

  const toggleVal = (key, val) => {
    const current = searchParams.get(key)?.split(',').filter(Boolean) || [];
    let next;
    if (current.includes(val)) next = current.filter(x => x !== val);
    else next = [...current, val];

    if (next.length) searchParams.set(key, next.join(','));
    else searchParams.delete(key);
    setSearchParams(searchParams);
  };

  const clearKey = (key) => {
    searchParams.delete(key);
    setSearchParams(searchParams);
  };

  const all_estados = [
    { val: 'pendiente', lbl: 'Pendiente' },
    { val: 'en_revision', lbl: 'En Revisión' },
    { val: 'escalada', lbl: 'Escalada' },
    { val: 'parcialmente_aprobada', lbl: 'Parcial' },
    { val: 'aprobada', lbl: 'Aprobada' },
    { val: 'rechazada', lbl: 'Rechazada' },
    { val: 'cancelada', lbl: 'Cancelada' },
  ];

  return (
    <Layout title="Bandeja de Aprobación" active="bandeja">
      <h1>Bandeja de Aprobación</h1>
      
      <div className="filters-bar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        
        <div className="form-group" style={{ margin: 0, position: 'relative' }}>
          <label style={{ fontSize: '11px', color: '#888' }}>Estado</label>
          <button type="button" onClick={() => setEstadosOpen(!estadosOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
            <span>{f_estados.length ? `${f_estados.length} estados` : 'Pendientes'}</span>
            <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
          </button>
          
          {estadosOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '300px', overflowY: 'auto', padding: '4px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                <input type="checkbox" checked={f_estados.length === 0} onChange={() => clearKey('estados')} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                <span>Todos (pendientes)</span>
              </label>
              {all_estados.map(e => (
                <label key={e.val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={f_estados.includes(e.val)} onChange={() => toggleVal('estados', e.val)} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                  <span>{e.lbl}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-group" style={{ margin: 0, position: 'relative' }}>
          <label style={{ fontSize: '11px', color: '#888' }}>Marca</label>
          <button type="button" onClick={() => setMarcasOpen(!marcasOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
            <span>{f_marcas.length ? `${f_marcas.length} marcas` : 'Todas'}</span>
            <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
          </button>
          
          {marcasOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '300px', overflowY: 'auto', padding: '4px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                <input type="checkbox" checked={f_marcas.length === 0} onChange={() => clearKey('marcas')} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                <span>Todas</span>
              </label>
              {allMarcas.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={f_marcas.includes(m)} onChange={() => toggleVal('marcas', m)} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th><th>Vendedor</th><th>Cliente</th><th>Pedido</th>
                <th>Marcas</th><th className="text-right">Monto Desc.</th>
                <th>Estado</th><th>Nivel</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="text-center">Cargando...</td></tr>
              ) : solicitudes.length > 0 ? (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link></td>
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
                <tr><td colSpan="9" className="text-center color-muted" style={{ padding: '20px' }}>No hay solicitudes para los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default BandejaAprobacion;
