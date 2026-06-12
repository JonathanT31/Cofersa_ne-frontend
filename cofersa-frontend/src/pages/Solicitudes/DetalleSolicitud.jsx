import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPct = (n) => {
  if (isNaN(n)) return "0.00%";
  return Number(n).toFixed(2) + "%";
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
      className += 'badge-review';
      label = 'En Revisión';
      break;
    case 'escalada':
      className += 'badge-escalated';
      label = 'Escalada';
      break;
    case 'aprobada':
      className += 'badge-approved';
      label = 'Aprobada';
      break;
    case 'parcialmente_aprobada':
      className += 'badge-warning';
      label = 'Parcialmente Aprobada';
      break;
    case 'rechazada':
      className += 'badge-rejected';
      label = 'Rechazada';
      break;
    case 'cancelada':
      className += 'badge-cancelled';
      label = 'Cancelada';
      break;
    default:
      className += 'badge-pending';
  }

  return <span className={className}>{label}</span>;
};

const DetalleSolicitud = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [sol, setSol] = useState(null);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [comentario, setComentario] = useState('');
  const [listaPrecios, setListaPrecios] = useState('');
  
  const [profilesMap, setProfilesMap] = useState({});
  const [brandInfo, setBrandInfo] = useState({});
  const [skuActions, setSkuActions] = useState({});       // {sku_id: 'aprobar'|'rechazar'|'pendiente'}
  const [skuAdjustments, setSkuAdjustments] = useState({}); // {sku_id: percentage}
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  useEffect(() => {
    if (sol && skus.length > 0 && user && user.role !== 'vendedor' && Object.keys(brandInfo).length === 0) {
      const uniqueBrands = [...new Set(skus.map(s => s.marca))];
      fetchBrandDetails(sol.vendedor_id, sol.vendedor?.username, uniqueBrands);
    }
  }, [sol, skus, user]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      
      // Fetch solicitud with related info
      const { data: sData, error: sError } = await supabase
        .from('solicitudes')
        .select(`
            *,
            vendedor:profiles!vendedor_id(username, nombre, apellido, email),
            aprobador:profiles!aprobador_actual_id(nombre, apellido)
        `)
        .eq('id', id)
        .single();
      
      if (sError) throw sError;
      setSol(sData);

      // Fetch client list price
      if (sData.cliente_codigo) {
        supabase
          .from('clientes')
          .select('lista_precios')
          .eq('cod_cliente', sData.cliente_codigo)
          .maybeSingle()
          .then(({ data: cData }) => {
            if (cData) {
              setListaPrecios(cData.lista_precios);
            }
          })
          .catch(err => console.error('Error fetching list price:', err));
      }

      // Fetch skus
      const { data: skData, error: skError } = await supabase
        .from('solicitud_skus')
        .select('*')
        .eq('solicitud_id', id);
      
      if (skError) throw skError;
      setSkus(skData || []);

      // Pre-initialize actions and adjustments
      const initialActions = {};
      const initialAdjustments = {};
      (skData || []).forEach(s => {
        if (s.sku_estado === 'pendiente' || !s.sku_estado) {
          initialActions[s.id] = 'aprobar';
          initialAdjustments[s.id] = s.porcentaje_descuento_sol;
        }
      });
      setSkuActions(initialActions);
      setSkuAdjustments(initialAdjustments);

      // Fetch profiles for who approved them
      const approverIds = [...new Set((skData || []).map(s => s.aprobado_por).filter(Boolean))];
      if (approverIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, nombre, apellido')
          .in('id', approverIds);
        if (profs) {
          const pMap = {};
          profs.forEach(p => { pMap[p.id] = p; });
          setProfilesMap(pMap);
        }
      }

      // Fetch audit logs
      const { data: auData, error: auError } = await supabase
        .from('audit_log')
        .select('*')
        .eq('entity_type', 'solicitud')
        .eq('entity_id', id)
        .order('created_at', { ascending: false });
      if (!auError) {
        setAudit(auData || []);
      }

    } catch (err) {
      console.error('Error fetching detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrandDetails = async (vendedorId, vendedorUsername, brands) => {
    if (!brands || brands.length === 0) return;
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const ms = new Date(year, month, 1).toISOString();
      const me = new Date(year, month + 1, 1).toISOString();
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const monthLabel = `${monthNames[month]} ${year}`;

      // Fetch rules
      const { data: rData } = await supabase
        .from('reglas')
        .select('*')
        .in('marca', brands);

      const rulesMap = {};
      if (rData) {
        rData.forEach(r => { rulesMap[r.marca] = r; });
      }

      // Fetch budgets
      let pptoMap = {};
      if (vendedorUsername) {
        const { data: pData } = await supabase
          .from('presupuesto')
          .select('*')
          .eq('asesor', vendedorUsername);
        if (pData) {
          pData.forEach(p => {
            pptoMap[p.marca] = (pptoMap[p.marca] || 0) + (parseFloat(p.ppto_mensual_crc) || 0);
          });
        }
      }

      // Fetch consumed spent
      let gastadoMap = {};
      if (vendedorId) {
        const { data: sData } = await supabase
          .from('solicitudes')
          .select('id')
          .eq('vendedor_id', vendedorId)
          .eq('estado', 'aprobada')
          .gte('approved_at', ms)
          .lt('approved_at', me);

        if (sData && sData.length > 0) {
          const sIds = sData.map(s => s.id);
          const { data: skData } = await supabase
            .from('solicitud_skus')
            .select('marca, monto_aprobado')
            .in('solicitud_id', sIds)
            .not('monto_aprobado', 'is', null);

          if (skData) {
            skData.forEach(sk => {
              gastadoMap[sk.marca] = (gastadoMap[sk.marca] || 0) + (parseFloat(sk.monto_aprobado) || 0);
            });
          }
        }
      }

      const info = {};
      brands.forEach(b => {
        const rule = rulesMap[b] || null;
        const pptoVal = pptoMap[b] || 0;
        const gastadoVal = gastadoMap[b] || 0;
        info[b] = {
          rule,
          ppto: pptoVal,
          gastado: gastadoVal,
          pctConsumo: pptoVal > 0 ? parseFloat((gastadoVal / pptoVal * 100).toFixed(1)) : 0,
          monthLabel
        };
      });

      setBrandInfo(info);
    } catch (err) {
      console.error('Error fetching brand details:', err);
    }
  };

  const handleProcesarSelection = async () => {
    const hasPend = Object.values(skuActions).some(act => act === 'pendiente');
    const msg = hasPend
      ? 'Hay SKUs marcados como "Dejar pendiente". ¿Procesar solo los seleccionados?'
      : '¿Confirma el procesamiento?';
    if (!window.confirm(msg)) return;

    try {
      setSubmitting(true);
      
      const payload = {
        sol_id: parseInt(id),
        user_id: user.id,
        comentario,
        sku_actions: skuActions,
        sku_adjustments: skuAdjustments
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/solicitudes/procesar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Error en el servidor');
      }

      const result = await response.json();
      
      if (result.status === 'escalated') {
        alert(result.message);
      } else if (result.status === 'partial') {
        alert(result.message);
      } else if (result.status === 'rejected') {
        alert('Solicitud rechazada exitosamente.');
      } else {
        alert('Solicitud procesada y aprobada con éxito.');
      }

      setComentario('');
      fetchDetail();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    const motivo = prompt('Motivo de cancelación:');
    if (!motivo) return;

    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('solicitudes')
        .update({
          estado: 'cancelada',
          comentario_aprobador: motivo,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      alert('Solicitud cancelada exitosamente.');
      fetchDetail();
    } catch (err) {
      alert('Error al cancelar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const setAllActs = (act) => {
    const newActs = { ...skuActions };
    pendingSkus.forEach(s => {
      newActs[s.id] = act;
    });
    setSkuActions(newActs);
  };

  if (loading) return <Layout title="Cargando..."><div className="text-center" style={{padding:'50px'}}>Cargando detalle de solicitud...</div></Layout>;
  if (!sol) return <Layout title="No encontrada"><div className="text-center" style={{padding:'50px'}}>Solicitud no encontrada.</div></Layout>;

  // Group SKUs by brand
  const skusByMarca = {};
  skus.forEach(s => {
    if (!skusByMarca[s.marca]) skusByMarca[s.marca] = [];
    skusByMarca[s.marca].push(s);
  });

  const isAssignedApprover = sol.aprobador_actual_id === user?.id;
  const isComprasAct = user?.role === 'compras' && sol.aprobador_nivel === 'compras';
  const isSupervisorAct = user?.role === 'supervisor' && sol.aprobador_nivel === 'supervisor';
  const isGteVentasAct = user?.role === 'gerente_ventas' && sol.aprobador_nivel === 'gerente_ventas';
  
  const isApprover = (
    isAssignedApprover || 
    user?.role === 'admin' || 
    isComprasAct || 
    isSupervisorAct || 
    isGteVentasAct
  ) && ['pendiente', 'en_revision', 'escalada', 'parcialmente_aprobada'].includes(sol.estado);

  const pendingSkus = skus.filter(s => s.sku_estado === 'pendiente' || !s.sku_estado);

  return (
    <Layout title={`Solicitud ${sol.folio || sol.id}`} active="mis">
      <div className="page-header">
        <h1>Solicitud {sol.folio || `#${sol.id}`}</h1>
        <div><EstadoBadge estado={sol.estado} /></div>
      </div>

      <div className="card">
        <div className="grid-4">
          <div><strong>Cliente:</strong> {sol.cliente_codigo} — {sol.cliente_nombre}</div>
          <div><strong>Lista de Precios:</strong> {listaPrecios || 'N/A'}</div>
          <div><strong>Pedido:</strong> {sol.numero_pedido || 'N/A'}</div>
          <div><strong>Vendedor:</strong> {sol.vendedor ? `${sol.vendedor.nombre} ${sol.vendedor.apellido}` : 'Unknown'}</div>
        </div>
        <div className="grid-3" style={{ marginTop: '10px' }}>
          <div><strong>Creada:</strong> {sol.created_at?.substring(0, 16)?.replace('T', ' ')}</div>
          <div><strong>Nivel Aprobación:</strong> {sol.aprobador_nivel}</div>
          <div><strong>Aprobador Actual:</strong> {sol.aprobador ? `${sol.aprobador.nombre} ${sol.aprobador.apellido}` : 'Sin asignar'}</div>
        </div>
        <div style={{ marginTop: '10px' }}><strong>Justificación:</strong> {sol.justificacion}</div>
        {sol.comentario_aprobador && <div style={{ marginTop: '6px', color: '#e67e22' }}><strong>Comentario del Aprobador:</strong> {sol.comentario_aprobador}</div>}
        
        <div className="grid-2" style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
          <div><strong>Total Descuento Solicitado:</strong> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCRC(sol.monto_total_descuento)}</span></div>
          <div><strong>Total Descuento Aprobado:</strong> <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCRC(sol.monto_total_aprobado)}</span></div>
        </div>
      </div>

      <h2 style={{ margin: '20px 0 10px' }}>Detalle por Marca</h2>
      {Object.entries(skusByMarca).map(([marca, mskus]) => {
        const total = mskus.length;
        const approvedCount = mskus.filter(sk => sk.sku_estado === 'aprobado').length;
        const rejectedCount = mskus.filter(sk => sk.sku_estado === 'rechazado').length;
        const pendingCount = mskus.filter(sk => sk.sku_estado === 'pendiente' || !sk.sku_estado).length;

        let brandBadge = <span className="badge badge-pending">Pendiente</span>;
        if (approvedCount === total) {
          brandBadge = <span className="badge badge-approved">✓ Aprobada</span>;
        } else if (rejectedCount === total) {
          brandBadge = <span className="badge badge-rejected">✕ Rechazada</span>;
        } else if (pendingCount === total) {
          brandBadge = <span className="badge badge-pending">Pendiente</span>;
        } else {
          brandBadge = <span className="badge badge-escalated">Parcial</span>;
        }

        const info = brandInfo[marca];
        const rule = info?.rule;
        const pptoVal = info?.ppto || 0;
        const gastadoVal = info?.gastado || 0;
        const pctConsumo = info?.pctConsumo || 0;
        const monthLabel = info?.monthLabel || '';

        const progressColor = pctConsumo < 80 ? '#27ae60' : (pctConsumo < 100 ? '#f39c12' : '#e74c3c');

        return (
          <div key={marca} className="card" style={{ marginBottom: '16px', borderLeft: '4px solid #1a5276', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 'bold' }}>🏷️ {marca}</span>
              <div>
                {brandBadge}
                <span className="font-sm color-muted" style={{ marginLeft: '8px' }}>
                  {total} SKU · {approvedCount}✓ {rejectedCount}✕ {pendingCount}⏳
                </span>
              </div>
            </div>

            {/* Brand rules & budget */}
            {user?.role !== 'vendedor' && (
              <div style={{ marginBottom: '14px', backgroundColor: '#f8f9fa', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                {rule && (
                  <div style={{ marginBottom: '4px', color: '#4a5568' }}>
                    <span style={{ color: '#27ae60', marginRight: '4px' }}>●</span> Vendedor hasta <strong>{rule.limite_vendedor}%</strong>
                    <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span> 
                    <span style={{ color: '#f39c12', marginRight: '4px' }}>●</span> Supervisor hasta <strong>{rule.limite_supervisor}%</strong>
                    <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span> 
                    <span style={{ color: '#e74c3c', marginRight: '4px' }}>●</span> Compras &ge;<strong>{rule.limite_compras}%</strong>
                  </div>
                )}
                {pptoVal > 0 && (
                  <div style={{ color: '#4a5568' }}>
                    {monthLabel}: Presupuesto <strong>{formatCRC(pptoVal)}</strong>
                    <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span> 
                    Gastado <strong>{formatCRC(gastadoVal)}</strong>
                    <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span> 
                    Consumo: <strong style={{ color: progressColor }}>{pctConsumo}%</strong>
                  </div>
                )}
              </div>
            )}

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Descripción</th>
                    <th className="text-right">Cant</th>
                    <th className="text-right">P.Base</th>
                    <th className="text-right">%Sol</th>
                    <th className="text-right">P.Sol</th>
                    <th className="text-right">Mto.Desc</th>
                    <th className="text-right">%Aprob</th>
                    <th className="text-right">P.Aprob</th>
                    <th className="text-right">Mto.Aprob</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {mskus.map(s => {
                    const est = s.sku_estado || 'pendiente';
                    let skuBadgeClass = 'badge ';
                    let skuBadgeLabel = est;
                    
                    if (est === 'aprobado') {
                      skuBadgeClass += 'badge-approved';
                      skuBadgeLabel = '✓ Aprobado';
                    } else if (est === 'rechazado') {
                      skuBadgeClass += 'badge-rejected';
                      skuBadgeLabel = '✕ Rechazado';
                    } else {
                      skuBadgeClass += 'badge-pending';
                      skuBadgeLabel = '⏳ Pendiente';
                    }

                    const isApproved = est === 'aprobado';
                    const approver = s.aprobado_por && profilesMap[s.aprobado_por] 
                      ? ` · ${profilesMap[s.aprobado_por].nombre} ${profilesMap[s.aprobado_por].apellido}` 
                      : '';

                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.codigo_sku}</td>
                        <td className="wrap">
                          {s.descripcion}
                          {s.bdf && <div style={{ fontSize: '11px', color: '#1a5276', marginTop: '2px', fontWeight: 500 }}>BDF: {s.bdf}</div>}
                        </td>
                        <td className="text-right">{s.cantidad}</td>
                        <td className="text-right">{formatCRC(s.precio_base)}</td>
                        <td className="text-right">{formatPct(s.porcentaje_descuento_sol)}</td>
                        <td className="text-right">{formatCRC(s.precio_solicitado)}</td>
                        <td className="text-right">{formatCRC(s.monto_descuento)}</td>
                        <td className="text-right" style={!isApproved ? { color: '#aaa', fontSize: '12px' } : { fontWeight: 600 }}>
                          {isApproved ? formatPct(s.porcentaje_aprobado) : '—'}
                        </td>
                        <td className="text-right" style={!isApproved ? { color: '#aaa', fontSize: '12px' } : {}}>
                          {isApproved ? formatCRC(s.precio_aprobado) : '—'}
                        </td>
                        <td className="text-right" style={!isApproved ? { color: '#aaa', fontSize: '12px' } : {}}>
                          {isApproved ? formatCRC(s.monto_aprobado) : '—'}
                        </td>
                        <td>
                          <span className={skuBadgeClass}>{skuBadgeLabel}</span>
                          {approver && <span className="font-sm color-muted" style={{ marginLeft: '4px' }}>{approver}</span>}
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

      {isApprover && (
        pendingSkus.length > 0 ? (
          <div className="card" style={{ marginTop: '20px', border: '2px solid var(--warning)' }}>
            <div className="card-header">Panel de Aprobación — {pendingSkus.length} SKU(s) pendientes</div>
            <p className="font-sm color-muted" style={{ marginBottom: '12px' }}>
              Seleccione la acción para cada SKU. Use los botones rápidos para actuar sobre todos a la vez.
            </p>
            
            {pendingSkus.map(s => (
              <div key={s.id} className="sku-row" style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fcfcfc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>
                    <strong>{s.marca}</strong> — {s.codigo_sku} — {s.descripcion}
                    {s.bdf && <span style={{ color: '#1a5276', marginLeft: '8px', fontSize: '11px', fontWeight: 500 }}>[BDF: {s.bdf}]</span>}
                  </span>
                  
                  <select 
                    className="form-control" 
                    style={{ width: '160px', minHeight: '34px', height: '34px', padding: '4px 8px' }}
                    value={skuActions[s.id] || 'aprobar'}
                    onChange={e => setSkuActions({ ...skuActions, [s.id]: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="aprobar">✓ Aprobar</option>
                    <option value="rechazar">✕ Rechazar</option>
                    <option value="pendiente">⏸ Dejar pendiente</option>
                  </select>
                </div>

                {(skuActions[s.id] || 'aprobar') === 'aprobar' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
                    <label style={{ margin: 0, fontWeight: 500 }}>% desc. aprobado (máx {s.porcentaje_descuento_sol.toFixed(2)}%):</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      style={{ width: '100px', minHeight: '34px', height: '34px', padding: '4px 8px' }}
                      value={skuAdjustments[s.id] !== undefined ? skuAdjustments[s.id] : s.porcentaje_descuento_sol} 
                      step="0.01" 
                      min="0" 
                      max={s.porcentaje_descuento_sol}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setSkuAdjustments({ ...skuAdjustments, [s.id]: isNaN(val) ? '' : val });
                      }}
                      disabled={submitting}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="form-group" style={{ marginTop: '14px' }}>
              <label style={{ fontWeight: 600 }}>Comentario de Aprobación/Rechazo</label>
              <textarea 
                className="form-control" 
                rows="2" 
                value={comentario} 
                onChange={e => setComentario(e.target.value)}
                placeholder="Escriba un comentario o justificación..."
                disabled={submitting}
              ></textarea>
            </div>
            
            <div className="actions-bar" style={{ gap: '10px' }}>
              <button className="btn btn-success" onClick={handleProcesarSelection} disabled={submitting}>
                {submitting ? 'Procesando...' : '✓ Procesar Selección'}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAllActs('aprobar')} disabled={submitting}>
                Aprobar todos
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAllActs('rechazar')} disabled={submitting}>
                Rechazar todos
              </button>
            </div>
          </div>
        ) : (
          <div className="alert alert-info" style={{ marginTop: '20px' }}>
            Todos los SKUs de esta solicitud ya han sido procesados.
          </div>
        )
      )}

      {sol.vendedor_id === user?.id && ['pendiente', 'en_revision', 'escalada'].includes(sol.estado) && (
        <div style={{ marginTop: '10px' }}>
          <button 
            className="btn btn-outline" 
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            onClick={handleCancelRequest}
            disabled={submitting}
          >
            Cancelar Solicitud
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-header">Historial / Auditoría</div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {audit.length > 0 ? (
                audit.map(log => (
                  <tr key={log.id}>
                    <td>{log.created_at?.replace('T', ' ')?.substring(0, 19)}</td>
                    <td style={{ fontWeight: 600 }}>{log.username}</td>
                    <td><span className="badge badge-draft" style={{ textTransform: 'uppercase', fontSize: '10px' }}>{log.action}</span></td>
                    <td className="wrap" style={{ fontSize: '12px' }}>{log.details || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center" style={{ padding: '20px', color: '#999' }}>
                    Sin registros de auditoría.
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

export default DetalleSolicitud;
