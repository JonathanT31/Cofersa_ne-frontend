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

// Datos simulados
const mockSol = {
  id: 101,
  folio: 'NE-0101',
  estado: 'pendiente',
  cliente_codigo: 'C-555',
  cliente_nombre: 'Ferreteria X',
  numero_pedido: 'PED-500',
  created_at: '2026-05-01 10:00:00',
  aprobador_nivel: 'supervisor',
  justificacion: 'Descuento especial por volumen mensual.',
  comentario_aprobador: '',
  monto_total_descuento: 150000,
  monto_total_aprobado: 0
};

const mockVendedor = { nombre: 'Juan', apellido: 'Perez' };
const mockAprobador = { nombre: 'Carlos', apellido: 'Supervisor' };

const mockSkus = [
  {
    id: 1,
    marca: 'Marca A',
    codigo_sku: 'SKU-001',
    descripcion: 'Taladro Percutor 500W',
    bdf: 'BDF-1234',
    cantidad: 10,
    precio_base: 50000,
    porcentaje_descuento_sol: 15.0,
    precio_solicitado: 42500,
    monto_descuento: 75000,
    sku_estado: 'pendiente',
    porcentaje_aprobado: 15.0, // Default to requested for approval panel
    precio_aprobado: 0,
    monto_aprobado: 0,
    aprobado_por_nombre: ''
  },
  {
    id: 2,
    marca: 'Marca A',
    codigo_sku: 'SKU-002',
    descripcion: 'Broca Concreto 1/4"',
    bdf: '',
    cantidad: 50,
    precio_base: 2000,
    porcentaje_descuento_sol: 20.0,
    precio_solicitado: 1600,
    monto_descuento: 20000,
    sku_estado: 'pendiente',
    porcentaje_aprobado: 20.0,
    precio_aprobado: 0,
    monto_aprobado: 0,
    aprobado_por_nombre: ''
  },
  {
    id: 3,
    marca: 'Marca B',
    codigo_sku: 'SKU-003',
    descripcion: 'Sierra Circular',
    bdf: '',
    cantidad: 5,
    precio_base: 80000,
    porcentaje_descuento_sol: 10.0,
    precio_solicitado: 72000,
    monto_descuento: 40000,
    sku_estado: 'aprobado',
    porcentaje_aprobado: 10.0,
    precio_aprobado: 72000,
    monto_aprobado: 40000,
    aprobado_por_nombre: 'Admin Prueba'
  }
];

const mockAudit = [
  {
    created_at: '2026-05-01 10:00:00',
    username: 'jperez',
    action: 'creacion',
    details: 'Solicitud creada con descuento excedente a reglas. Enviada a supervisor.'
  }
];

const mockInfoMarca = {
  'Marca A': {
    regla: { limite_vendedor: 10, limite_supervisor: 15, limite_compras: 20 },
    ppto: 1000000,
    gastado: 450000,
    pct_consumo: 45.0,
    month_label: 'May 2026'
  },
  'Marca B': {
    regla: { limite_vendedor: 5, limite_supervisor: 10, limite_compras: 15 },
    ppto: 500000,
    gastado: 100000,
    pct_consumo: 20.0,
    month_label: 'May 2026'
  }
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
  
  // Agrupar SKUs por marca
  const skusByMarca = mockSkus.reduce((acc, sku) => {
    if (!acc[sku.marca]) acc[sku.marca] = [];
    acc[sku.marca].push(sku);
    return acc;
  }, {});

  const [skuActions, setSkuActions] = useState({});
  const [skuAdjustments, setSkuAdjustments] = useState({});

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

  const pendingSkus = mockSkus.filter(s => s.sku_estado === 'pendiente');

  return (
    <Layout title={`Solicitud ${mockSol.folio || mockSol.id}`} active="mis">
      <div className="page-header">
        <h1>Solicitud {mockSol.folio || `#${mockSol.id}`}</h1>
        <div><EstadoBadge estado={mockSol.estado} /></div>
      </div>

      <div className="card">
        <div className="grid-3">
          <div><strong>Cliente:</strong> {mockSol.cliente_codigo} — {mockSol.cliente_nombre}</div>
          <div><strong>Pedido:</strong> {mockSol.numero_pedido}</div>
          <div><strong>Vendedor:</strong> {mockVendedor.nombre} {mockVendedor.apellido}</div>
        </div>
        <div className="grid-3" style={{ marginTop: '10px' }}>
          <div><strong>Creada:</strong> {mockSol.created_at}</div>
          <div><strong>Nivel Aprobación:</strong> {mockSol.aprobador_nivel}</div>
          <div><strong>Aprobador Asignado:</strong> {mockAprobador ? `${mockAprobador.nombre} ${mockAprobador.apellido}` : 'Sin asignar'}</div>
        </div>
        <div style={{ marginTop: '10px' }}><strong>Justificación:</strong> {mockSol.justificacion}</div>
        {mockSol.folio && <div style={{ marginTop: '8px' }}><strong>Folio:</strong> {mockSol.folio}</div>}
        {mockSol.comentario_aprobador && <div style={{ marginTop: '6px' }}><strong>Comentario:</strong> {mockSol.comentario_aprobador}</div>}
        <div className="grid-2" style={{ marginTop: '10px' }}>
          <div><strong>Total Solicitado:</strong> {formatCRC(mockSol.monto_total_descuento)}</div>
          <div><strong>Total Aprobado:</strong> {formatCRC(mockSol.monto_total_aprobado)}</div>
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

        const info = mockInfoMarca[marca] || {};
        const rg = info.regla || {};
        const ppto_clr = info.pct_consumo < 80 ? '#27ae60' : (info.pct_consumo < 100 ? '#e67e22' : '#e74c3c');

        return (
          <div key={marca} className="card" style={{ marginBottom: '12px', borderLeft: '4px solid #1a5276' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
              <strong>🏷 {marca}</strong>
              <span>{mb} <span className="font-sm color-muted" style={{ marginLeft: '8px' }}>{mskus.length} SKU · {apr}✓ {rej}✕ {pen}⏳</span></span>
            </div>
            
            {rg && (
              <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
                <span style={{ color: '#27ae60' }}>●</span> Vendedor hasta <strong>{rg.limite_vendedor}%</strong> &nbsp;|&nbsp;
                <span style={{ color: '#e67e22' }}>●</span> Supervisor hasta <strong>{rg.limite_supervisor}%</strong> &nbsp;|&nbsp;
                <span style={{ color: '#e74c3c' }}>●</span> Compras ≥<strong>{rg.limite_compras}%</strong>
              </div>
            )}
            
            {info.ppto > 0 && (
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
            <textarea className="form-control" rows="2"></textarea>
          </div>
          <div className="actions-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <button className="btn btn-success">✓ Procesar Selección</button>
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
              {mockAudit.map((a, i) => (
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
