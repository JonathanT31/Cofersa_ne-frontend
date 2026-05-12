import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';

const DetalleSolicitud = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [skuActions, setSkuActions] = useState({});
  const [skuAdjustments, setSkuAdjustments] = useState({});
  const [comentario, setComentario] = useState('');
  const [actionError, setActionErrors] = useState('');

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/solicitud/detalle?id=${id}`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
        const initialActs = {};
        const initialAdjs = {};
        json.skus.forEach(s => {
          if (s.sku_estado === 'pendiente') {
            initialActs[s.id] = 'aprobar';
            initialAdjs[s.id] = s.porcentaje_descuento_sol;
          }
        });
        setSkuActions(initialActs);
        setSkuAdjustments(initialAdjs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  if (loading) return <Layout title="Cargando..."><div>Cargando detalle...</div></Layout>;
  if (!data) return <Layout title="Error"><div>Solicitud no encontrada o sin acceso.</div></Layout>;

  const { solicitud, skus, vendedor, aprobador, audit, info_por_marca } = data;
  const role = user?.role || 'vendedor';

  const skusByMarca = skus.reduce((acc, sku) => {
    if (!acc[sku.marca]) acc[sku.marca] = [];
    acc[sku.marca].push(sku);
    return acc;
  }, {});

  const handleActChange = (skuId, val) => {
    setSkuActions(prev => ({ ...prev, [skuId]: val }));
  };

  const setAllActs = (val) => {
    const newActs = {};
    skus.filter(s => s.sku_estado === 'pendiente').forEach(s => {
      newActs[s.id] = val;
    });
    setSkuActions(newActs);
  };

  const procesarSolicitud = async () => {
    const hasPend = Object.values(skuActions).some(a => a === 'pendiente');
    const msg = hasPend ? '¿Procesar solo los seleccionados?' : '¿Confirma el procesamiento?';
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch('/api/solicitud/aprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: parseInt(id),
          sku_adjustments: skuAdjustments,
          sku_actions: skuActions,
          comentario: comentario
        })
      });
      const result = await res.json();
      if (result.ok) {
        if (result.mailto) window.location.href = result.mailto;
        if (result.parcial) {
          alert(result.message || 'Procesado parcialmente.');
          fetchDetail();
        } else {
          setTimeout(() => navigate(`/solicitud/${id}?msg=${result.rechazada ? 'rechazada' : 'aprobada'}`), 500);
        }
      } else {
        setActionErrors(result.error || 'Error al procesar');
      }
    } catch (e) {
      setActionErrors(e.message);
    }
  };

  const cancelarSolicitud = async () => {
    const motivo = prompt('Motivo de cancelación:');
    if (!motivo) return;
    try {
      const res = await fetch('/api/solicitud/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id), comentario: motivo })
      });
      const result = await res.json();
      if (result.ok) {
        if (result.mailto) window.location.href = result.mailto;
        setTimeout(() => fetchDetail(), 500);
      }
    } catch (e) { alert(e.message); }
  };

  const isApprover = (
    solicitud.aprobador_actual_id === user?.id ||
    role === 'admin' ||
    (role === 'compras' && solicitud.aprobador_nivel === 'compras')
  ) && ['pendiente', 'en_revision', 'escalada', 'parcialmente_aprobada'].includes(solicitud.estado);

  const pendingSkus = skus.filter(s => s.sku_estado === 'pendiente');
  const msg = searchParams.get('msg');

  return (
    <Layout title={`Solicitud ${solicitud.folio || solicitud.id}`} active="mis">
      {msg === 'creada' && <div className="alert alert-success">Solicitud creada exitosamente y enviada para aprobación.</div>}
      {msg === 'aprobada' && <div className="alert alert-success">Solicitud aprobada exitosamente.</div>}
      {msg === 'rechazada' && <div className="alert alert-warning">Solicitud rechazada.</div>}

      <div className="page-header">
        <h1>Solicitud {solicitud.folio || `#${solicitud.id}`}</h1>
        <div><EstadoBadge estado={solicitud.estado} /></div>
      </div>

      <div className="card">
        <div className="grid-3">
          <div><strong>Cliente:</strong> {solicitud.cliente_codigo} — {solicitud.cliente_nombre}</div>
          <div><strong>Pedido:</strong> {solicitud.numero_pedido}</div>
          <div><strong>Vendedor:</strong> {vendedor?.nombre} {vendedor?.apellido}</div>
        </div>
        <div className="grid-3" style={{ marginTop: '10px' }}>
          <div><strong>Creada:</strong> {solicitud.created_at.substring(0, 19)}</div>
          <div><strong>Nivel Aprobación:</strong> {solicitud.aprobador_nivel}</div>
          <div><strong>Aprobador Asignado:</strong> {aprobador ? `${aprobador.nombre} ${aprobador.apellido}` : 'Sin asignar'}</div>
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

        const info = info_por_marca?.[marca] || {};
        const rg = info.regla || {};
        const ppto_clr = info.pct_consumo < 80 ? '#27ae60' : (info.pct_consumo < 100 ? '#e67e22' : '#e74c3c');

        return (
          <div key={marca} className="card" style={{ marginBottom: '12px', borderLeft: '4px solid #1a5276' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
              <strong>🏷 {marca}</strong>
              <span>{mb} <span className="font-sm color-muted" style={{ marginLeft: '8px' }}>{mskus.length} SKU · {apr}✓ {rej}✕ {pen}⏳</span></span>
            </div>
            
            {role !== 'vendedor' && rg && (
              <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
                <span style={{ color: '#27ae60' }}>●</span> Vendedor hasta <strong>{rg.limite_vendedor}%</strong> &nbsp;|&nbsp;
                <span style={{ color: '#e67e22' }}>●</span> Supervisor hasta <strong>{rg.limite_supervisor}%</strong> &nbsp;|&nbsp;
                <span style={{ color: '#e74c3c' }}>●</span> Compras ≥<strong>{rg.limite_compras}%</strong>
              </div>
            )}
            
            {role !== 'vendedor' && info.ppto > 0 && (
              <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                {info.month_label}: Presupuesto <strong>{formatCRC(info.ppto)}</strong> | 
                Gastado <strong>{formatCRC(info.gastado)}</strong> | 
                <strong style={{ color: ppto_clr, marginLeft: '4px' }}>{info.pct_consumo}%</strong>
              </div>
            )}

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
                    const elbl = { 'aprobado': '✓ Aprobado', 'rechazado': '✕ Rechazada', 'pendiente': '⏳ Pendiente' }[s.sku_estado] || s.sku_estado;
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
                          <><td colSpan="3" className="text-right color-muted font-sm">—</td></>
                        )}
                        <td><span className={`badge ${ecls}`}>{elbl}</span>{s.aprobado_por_nombre && <span className="font-sm color-muted"> · {s.aprobado_por_nombre}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {isApprover && pendingSkus.length > 0 && (
        <div className="card" style={{ border: '2px solid var(--warning)' }}>
          <div className="card-header">Panel de Aprobación — {pendingSkus.length} SKU(s) pendientes</div>
          {pendingSkus.map(s => {
            const act = skuActions[s.id] || 'aprobar';
            return (
              <div key={s.id} className="sku-row" style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <strong className="font-sm">{s.marca} — {s.codigo_sku} — {s.descripcion}</strong>
                  <select className="form-control" style={{ width: '160px' }} value={act} onChange={(e) => handleActChange(s.id, e.target.value)}>
                    <option value="aprobar">✓ Aprobar</option>
                    <option value="rechazar">✕ Rechazar</option>
                    <option value="pendiente">⏸ Dejar pendiente</option>
                  </select>
                </div>
                {act === 'aprobar' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label className="font-sm">% desc. aprobado (máx {s.porcentaje_descuento_sol.toFixed(2)}%):</label>
                    <input type="number" className="form-control" value={skuAdjustments[s.id] ?? s.porcentaje_descuento_sol} onChange={(e) => setSkuAdjustments(prev => ({ ...prev, [s.id]: e.target.value }))} step="0.01" min="0" max={s.porcentaje_descuento_sol} style={{ width: '100px' }} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="form-group"><label>Comentario</label><textarea className="form-control" rows="2" value={comentario} onChange={e => setComentario(e.target.value)}></textarea></div>
          <div className="actions-bar" style={{ gap: '8px' }}>
            <button className="btn btn-success" onClick={procesarSolicitud}>✓ Procesar Selección</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAllActs('aprobar')}>Aprobar todos</button>
            <button className="btn btn-outline btn-sm" onClick={() => setAllActs('rechazar')}>Rechazar todos</button>
          </div>
          {actionError && <div className="alert alert-danger" style={{ marginTop: '10px' }}>{actionError}</div>}
        </div>
      )}

      <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
        <Link to={`/email/preview/${id}`} target="_blank" className="btn btn-outline btn-sm">📧 Ver Correo Enviado</Link>
        {solicitud.vendedor_id === user?.id && ['pendiente', 'en_revision', 'escalada'].includes(solicitud.estado) && (
          <button className="btn btn-outline btn-sm" onClick={cancelarSolicitud}>Cancelar Solicitud</button>
        )}
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">Historial / Auditoría</div>
        <div className="table-responsive">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.created_at.substring(0, 19)}</td>
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
