import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPct = (n) => {
  if (isNaN(n)) return "0.00%";
  return Number(n).toFixed(2) + "%";
};

import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { httpClient } from '../../api/httpClient';

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

const DetalleSolicitud = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [solicitud, setSolicitud] = useState(null);
  const [skus, setSkus] = useState([]);
  const [audit, setAudit] = useState([]);

  React.useEffect(() => {
    const loadDetail = async () => {
      try {
        const res = await httpClient(`${ENDPOINTS.solicitudes.base}/${id}`);
        if (res.success) {
          setSolicitud(res.data.solicitud);
          setSkus(res.data.skus || []);
          // Audit can be added later
        }
      } catch (err) {
        console.error("Error loading detail:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [id]);

  // Agrupar SKUs por marca
  const skusByMarca = skus.reduce((acc, sku) => {
    if (!acc[sku.marca]) acc[sku.marca] = [];
    acc[sku.marca].push(sku);
    return acc;
  }, {});

  const [skuActions, setSkuActions] = useState({});
  const [skuAdjustments, setSkuAdjustments] = useState({});
  const [comentario, setComentario] = useState("");

  const handleActChange = (skuId, val) => {
    setSkuActions(prev => ({ ...prev, [skuId]: val }));
  };

  const setAllActs = (val) => {
    const newActs = {};
    mockSkus.filter(s => s.sku_estado === 'pendiente').forEach(s => {
      newActs[s.id] = val;
    });
    setSkuActions(newActs);
  };

  const pendingSkus = skus.filter(s => s.sku_estado === 'pendiente');

  if (loading) return <Layout title="Cargando..." active="mis"><div className="text-center" style={{padding:'40px'}}>Cargando detalle...</div></Layout>;
  if (!solicitud) return <Layout title="No encontrada" active="mis"><div className="alert alert-danger">Solicitud no encontrada</div></Layout>;

  return (
    <Layout title={`Solicitud ${solicitud.folio || solicitud.id}`} active="mis">
      <div className="page-header">
        <h1>Solicitud {solicitud.folio || `#${solicitud.id}`}</h1>
        <div><EstadoBadge estado={solicitud.estado} /></div>
      </div>

      <div className="card">
        <div className="grid-3">
          <div><strong>Cliente:</strong> {solicitud.cliente_codigo} — {solicitud.cliente_nombre}</div>
          <div><strong>Pedido:</strong> {solicitud.numero_pedido}</div>
          <div><strong>Vendedor:</strong> {solicitud.profiles?.nombre} {solicitud.profiles?.apellido}</div>
        </div>
        <div className="grid-3" style={{ marginTop: '10px' }}>
          <div><strong>Creada:</strong> {solicitud.created_at}</div>
          <div><strong>Nivel Aprobación:</strong> {solicitud.aprobador_nivel}</div>
          <div><strong>Aprobador Asignado:</strong> {solicitud.aprobador_actual_id || 'Sin asignar'}</div>
        </div>
        <div style={{ marginTop: '10px' }}><strong>Justificación:</strong> {solicitud.justificacion}</div>
        {solicitud.folio && <div style={{ marginTop: '8px' }}><strong>Folio:</strong> {solicitud.folio}</div>}
        {solicitud.comentario_aprobador && <div style={{ marginTop: '6px' }}><strong>Comentario:</strong> {solicitud.comentario_aprobador}</div>}
        <div className="grid-2" style={{ marginTop: '10px' }}>
          <div><strong>Total Solicitado:</strong> {formatCRC(solicitud.monto_total_descuento)}</div>
          <div><strong>Total Aprobado:</strong> {formatCRC(solicitud.monto_total_aprobado)}</div>
        </div>
      </div>

      <h2 style={{ marginBottom: '8px' }}>Detalle por Marca</h2>
      
      {Object.entries(skusByMarca).map(([marca, mskus]) => {
        const apr = mskus.filter(s => s.sku_estado === 'aprobado').length;
        const rej = mskus.filter(s => s.sku_estado === 'rechazado').length;
        const pen = mskus.filter(s => s.sku_estado === 'pendiente').length;
        
        let mb = <span className="badge badge-escalated">Parcial</span>;
        if (apr === mskus.length) mb = <span className="badge badge-approved">✓ Aprobada</span>;
        else if (rej === mskus.length) mb = <span className="badge badge-rejected">✕ Rechazada</span>;
        else if (pen === mskus.length) mb = <span className="badge badge-pending">Pendiente</span>;

        return (
          <div key={marca} className="card" style={{ marginBottom: '12px', borderLeft: '4px solid #1a5276' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
              <strong>🏷 {marca}</strong>
              <span>{mb} <span className="font-sm color-muted" style={{ marginLeft: '8px' }}>{mskus.length} SKU · {apr}✓ {rej}✕ {pen}⏳</span></span>
            </div>
            

            <div className="table-responsive" style={{ marginTop: '10px' }}>
              <table style={{ minWidth: '680px' }}>
                <thead>
                  <tr>
                    <th>SKU</th><th>Descripción</th><th className="text-right">Cant</th>
                    <th className="text-right">P.Base</th><th className="text-right">%Sol</th>
                    <th className="text-right">P.Sol</th><th className="text-right">Mto.Desc</th>
                    <th className="text-right">%Aprob</th><th className="text-right">P.Aprob</th><th className="text-right">Mto.Aprob</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {mskus.map(s => {
                    const ecls = { 'aprobado': 'badge-approved', 'rechazado': 'badge-rejected', 'pendiente': 'badge-pending' }[s.sku_estado] || 'badge-draft';
                    const elbl = { 'aprobado': '✓ Aprobado', 'rechazado': '✕ Rechazado', 'pendiente': '⏳ Pendiente' }[s.sku_estado] || s.sku_estado;
                    
                    return (
                      <tr key={s.id}>
                        <td>{s.codigo_sku}</td>
                        <td className="wrap">
                          {s.descripcion}
                          {s.bdf && <><br /><span style={{ fontSize: '11px', color: '#1a5276' }}>BDF: {s.bdf}</span></>}
                        </td>
                        <td className="text-right">{s.cantidad}</td>
                        <td className="text-right">{formatCRC(s.precio_base)}</td>
                        <td className="text-right">{formatPct(s.porcentaje_descuento_sol)}</td>
                        <td className="text-right">{formatCRC(s.precio_solicitado)}</td>
                        <td className="text-right">{formatCRC(s.monto_descuento)}</td>
                        
                        {s.sku_estado === 'aprobado' ? (
                          <>
                            <td className="text-right">{formatPct(s.porcentaje_aprobado)}</td>
                            <td className="text-right">{formatCRC(s.precio_aprobado)}</td>
                            <td className="text-right">{formatCRC(s.monto_aprobado)}</td>
                          </>
                        ) : (
                          <>
                            <td className="text-right color-muted font-sm">—</td>
                            <td className="text-right color-muted font-sm">—</td>
                            <td className="text-right color-muted font-sm">—</td>
                          </>
                        )}
                        
                        <td>
                          <span className={`badge ${ecls}`}>{elbl}</span>
                          {s.aprobado_por_nombre && <span className="font-sm color-muted"> · {s.aprobado_por_nombre}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {pendingSkus.length > 0 ? (
        <div className="card" style={{ border: '2px solid var(--warning)' }}>
          <div className="card-header">Panel de Aprobación — {pendingSkus.length} SKU(s) pendientes</div>
          <p className="font-sm color-muted" style={{ marginBottom: '12px' }}>
            Seleccione la acción para cada SKU. Use los botones rápidos para actuar sobre todos a la vez.
          </p>
          
          {pendingSkus.map(s => {
            const act = skuActions[s.id] || 'aprobar';
            return (
              <div key={s.id} className="sku-row" style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <strong className="font-sm">
                    {s.marca} — {s.codigo_sku} — {s.descripcion}
                    {s.bdf && <span style={{ fontSize: '11px', color: '#1a5276' }}> [BDF: {s.bdf}]</span>}
                  </strong>
                  <select 
                    className="form-control" 
                    style={{ width: '160px' }} 
                    value={act}
                    onChange={(e) => handleActChange(s.id, e.target.value)}
                  >
                    <option value="aprobar">✓ Aprobar</option>
                    <option value="rechazar">✕ Rechazar</option>
                    <option value="pendiente">⏸ Dejar pendiente</option>
                  </select>
                </div>
                {act === 'aprobar' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="font-sm" style={{ margin: 0 }}>% desc. aprobado (máx {s.porcentaje_descuento_sol.toFixed(2)}%):</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={skuAdjustments[s.id] ?? s.porcentaje_descuento_sol} 
                      onChange={(e) => setSkuAdjustments(prev => ({ ...prev, [s.id]: e.target.value }))}
                      step="0.01" min="0" max={s.porcentaje_descuento_sol}
                      style={{ width: '100px', fontSize: '13px' }} 
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="form-group" style={{ marginTop: '10px' }}>
            <label>Comentario</label>
            <textarea className="form-control" rows="2" value={comentario} onChange={e => setComentario(e.target.value)}></textarea>
          </div>
          <div className="actions-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <button className="btn btn-success" onClick={async () => {
              // Simplified: assume full approval if they click this for now
              try {
                const result = await httpClient(`${ENDPOINTS.solicitudes.base}/${id}/aprobar`, {
                  method: 'POST',
                  headers: { 'X-User-Id': user?.id || '' },
                  body: JSON.stringify({ comentario })
                });
                if (result.success) {
                  alert("Solicitud procesada");
                  window.location.reload();
                }
              } catch(e) { console.error(e); }
            }}>✓ Procesar Selección</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAllActs('aprobar')}>Aprobar todos</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAllActs('rechazar')}>Rechazar todos</button>
          </div>
        </div>
      ) : (
        <div className="alert alert-info" style={{ marginTop: '16px' }}>
          Todos los SKUs de esta solicitud ya han sido procesados.
        </div>
      )}

      <button className="btn btn-outline btn-sm" style={{ marginTop: '10px' }}>📧 Ver Correo Enviado</button>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">Historial / Auditoría</div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.created_at}</td>
                  <td>{a.username}</td>
                  <td>{a.action}</td>
                  <td style={{ fontSize: '11px' }}>{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </Layout>
  );
};

export default DetalleSolicitud;
