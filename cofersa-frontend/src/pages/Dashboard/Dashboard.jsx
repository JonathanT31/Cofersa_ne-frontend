import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { httpClient } from '../../api/httpClient';

const mlm = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const year = new Date().getFullYear();

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Placeholders for data not yet fully implemented in API
  const gasto_anual = 0;
  const total_ppto = 0;
  const consumo_anual_pct = 0;
  const pac = "#27ae60";
  const monthly_data = Array(12).fill([0, 0]);
  const by_sup_sel = [];
  const by_sup_marca_sel = [];
  const by_marca_sel = [];
  const top10 = [];
  const max_val = 1;
  const sel_label = "Período Actual";
  const n_months = 1;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await httpClient(ENDPOINTS.dashboard.stats);
        if (res.success) setStats(res.stats);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [marcasOpen, setMarcasOpen] = useState(false);
  const [supsOpen, setSupsOpen] = useState(false);
  const [vendsOpen, setVendsOpen] = useState(false);

  const max_val = 3000000;
  // Rol simulado para mostrar la vista completa de administrador
  const role = "admin";

  const renderMarcaTable = (rows_data, title) => {
    let tg = 0;
    let tp = 0;
    return (
      <div className="card">
        <div className="card-header">{title}</div>
        <div className="table-responsive">
          <table style={{ minWidth: '320px' }}>
            <thead>
              <tr>
                <th>Marca</th>
                <th className="text-right">Gasto</th>
                <th className="text-right">Presupuesto</th>
                <th className="text-right">% Consumo</th>
              </tr>
            </thead>
            <tbody>
              {rows_data.map(r => {
                tg += r.gasto;
                tp += r.ppto;
                const pct = r.ppto > 0 ? (r.gasto / r.ppto * 100) : 0;
                const pc2 = pct < 80 ? "#27ae60" : (pct < 100 ? "#f39c12" : "#e74c3c");
                return (
                  <tr key={r.marca}>
                    <td>{r.marca}</td>
                    <td className="text-right">{formatCRC(r.gasto)}</td>
                    <td className="text-right">{r.ppto > 0 ? formatCRC(r.ppto) : <span style={{color:'#aaa'}}>—</span>}</td>
                    <td className="text-right">
                      {r.ppto > 0 ? <span style={{ color: pc2, fontWeight: 600 }}>{pct.toFixed(1)}%</span> : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows_data.length === 0 && (
                <tr><td colSpan="4" className="text-center color-muted font-sm">Sin datos</td></tr>
              )}
              {rows_data.length > 0 && (() => {
                const tpct = tp > 0 ? (tg / tp * 100) : 0;
                const tpc = tpct < 80 ? "#27ae60" : (tpct < 100 ? "#f39c12" : "#e74c3c");
                return (
                  <tr style={{ background: '#f0f4f8', fontWeight: 700, borderTop: '2px solid #d0d7e0' }}>
                    <td>TOTAL</td>
                    <td className="text-right">{formatCRC(tg)}</td>
                    <td className="text-right">{tp > 0 ? formatCRC(tp) : <span style={{color:'#aaa'}}>—</span>}</td>
                    <td className="text-right">
                      {tp > 0 ? <span style={{ color: tpc, fontWeight: 700 }}>{tpct.toFixed(1)}%</span> : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSupTable = (rows_data, title) => {
    let tg = 0;
    let tp = 0;
    return (
      <div className="card">
        <div className="card-header">{title}</div>
        <div className="table-responsive">
          <table style={{ minWidth: '340px' }}>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th className="text-right">Gasto</th>
                <th className="text-right">Presupuesto</th>
                <th className="text-right">% Consumo</th>
              </tr>
            </thead>
            <tbody>
              {rows_data.map(r => {
                tg += r.gasto;
                tp += r.ppto;
                const pct = r.ppto > 0 ? (r.gasto / r.ppto * 100) : 0;
                const pc2 = pct < 80 ? "#27ae60" : (pct < 100 ? "#f39c12" : "#e74c3c");
                return (
                  <tr key={r.sup_nombre}>
                    <td>{r.sup_nombre}</td>
                    <td className="text-right">{formatCRC(r.gasto)}</td>
                    <td className="text-right">{r.ppto > 0 ? formatCRC(r.ppto) : <span style={{color:'#aaa'}}>—</span>}</td>
                    <td className="text-right">
                      {r.ppto > 0 ? <span style={{ color: pc2, fontWeight: 600 }}>{pct.toFixed(1)}%</span> : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows_data.length === 0 && (
                <tr><td colSpan="4" className="text-center color-muted font-sm">Sin datos</td></tr>
              )}
              {rows_data.length > 0 && (() => {
                const tpct = tp > 0 ? (tg / tp * 100) : 0;
                const tpc = tpct < 80 ? "#27ae60" : (tpct < 100 ? "#f39c12" : "#e74c3c");
                return (
                  <tr style={{ background: '#f0f4f8', fontWeight: 700, borderTop: '2px solid #d0d7e0' }}>
                    <td>TOTAL</td>
                    <td className="text-right">{formatCRC(tg)}</td>
                    <td className="text-right">{tp > 0 ? formatCRC(tp) : <span style={{color:'#aaa'}}>—</span>}</td>
                    <td className="text-right">
                      {tp > 0 ? <span style={{ color: tpc, fontWeight: 700 }}>{tpct.toFixed(1)}%</span> : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderVendTable = (rows_data, title) => {
    let tg = 0;
    return (
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">{title}</div>
        <div className="table-responsive">
          <table style={{ minWidth: '260px' }}>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th className="text-right">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {rows_data.map(r => {
                tg += r.gasto;
                return (
                  <tr key={r.vend_nombre}>
                    <td>{r.vend_nombre}</td>
                    <td className="text-right">{formatCRC(r.gasto)}</td>
                  </tr>
                );
              })}
              {rows_data.length === 0 && (
                <tr><td colSpan="2" className="text-center color-muted font-sm">Sin datos</td></tr>
              )}
              {rows_data.length > 0 && (
                <tr style={{ background: '#f0f4f8', fontWeight: 700, borderTop: '2px solid #d0d7e0' }}>
                  <td>TOTAL</td>
                  <td className="text-right">{formatCRC(tg)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <Layout title="Dashboard" active="dashboard">
      <div className="page-header">
        <h1>Dashboard — Control Presupuestario</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Meses seleccionados ({n_months})</label>
            <button type="button" onClick={() => setPickerOpen(!pickerOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '220px', justifyContent: 'space-between', minHeight: '40px' }}>
              <span>{sel_label}</span>
              <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
            </button>
            {pickerOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '340px', overflowY: 'auto', padding: '4px 0' }}>
                <div style={{ padding: '6px 10px', borderBottom: '1px solid #eee', display: 'flex', gap: '6px' }}>
                  <button type="button" style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>Ninguno</button>
                  <button type="button" style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>Año {year}</button>
                </div>
                {mlm.map((m, i) => {
                  const ym = `${year}-${(i+1).toString().padStart(2, '0')}`;
                  return (
                    <label key={ym} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={selectedMonths.includes(ym)} readOnly style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                      <span style={{ fontWeight: selectedMonths.includes(ym) ? 'bold' : 'normal', color: selectedMonths.includes(ym) ? '#1a5276' : 'inherit' }}>{m} {year}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Año acumulado</label>
            <select className="form-control" defaultValue={year}>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Marcas</label>
            <button type="button" onClick={() => setMarcasOpen(!marcasOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
              <span>Todos</span>
              <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
            </button>
          </div>

          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Supervisores</label>
            <button type="button" onClick={() => setSupsOpen(!supsOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
              <span>Todos</span>
              <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
            </button>
          </div>

          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Vendedores</label>
            <button type="button" onClick={() => setVendsOpen(!vendsOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '160px', justifyContent: 'space-between', minHeight: '40px' }}>
              <span>Todos</span>
              <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
            </button>
          </div>

        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(stats?.gasto_aprobado || 0)}</div><div className="kpi-label">Gasto Aprobado</div></div>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(0)}</div><div className="kpi-label">Presupuesto Período</div></div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#27ae60' }}>0.0%</div>
          <div className="kpi-label">Consumo del Presupuesto</div>
          <div className="progress-bar" style={{ marginTop: '8px' }}>
            <div className="progress-fill" style={{ width: `0%`, background: '#27ae60' }}></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{stats?.cumplimiento_sla || 0}%</div>
          <div className="kpi-label">Cumplimiento SLA</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card"><div className="kpi-value">{stats?.total_solicitudes || 0}</div><div className="kpi-label">Solicitudes (Total)</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--success)' }}>{stats?.aprobadas || 0}</div><div className="kpi-label">Aprobadas</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--danger)' }}>{stats?.rechazadas || 0}</div><div className="kpi-label">Rechazadas</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--warning)' }}>{stats?.pendientes || 0}</div><div className="kpi-label">Pendientes</div></div>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card"><div className="kpi-value" style={{ color: pac }}>{formatCRC(gasto_anual)}</div><div className="kpi-label">Gasto Acumulado {year}</div></div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: pac }}>{consumo_anual_pct.toFixed(1)}%</div>
          <div className="kpi-label">Consumo Anual vs Ppto x12</div>
          <div className="progress-bar" style={{ marginTop: '8px' }}>
            <div className="progress-fill" style={{ width: `${Math.min(consumo_anual_pct, 100)}%`, background: pac }}></div>
          </div>
        </div>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(total_ppto * 12)}</div><div className="kpi-label">Presupuesto Anual Proyectado</div></div>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(Math.max(0, total_ppto * 12 - gasto_anual))}</div><div className="kpi-label">Disponible Anual Estimado</div></div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          Evolución Mensual — {year}
          <span style={{ fontSize: '11px', fontWeight: 400, color: '#888', marginLeft: '10px' }}>
            ■ Presupuesto &nbsp; ■ Aprobado
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ verticalAlign: 'bottom', height: '110px' }}>
                {mlm.map((lbl, i) => {
                  const val = monthly_data[i][0];
                  const pval = monthly_data[i][1];
                  const h_apr = max_val > 0 ? Math.floor((val / max_val) * 80) : 0;
                  const h_ppto = max_val > 0 ? Math.floor((pval / max_val) * 80) : 0;
                  const ym_bar = `${year}-${(i+1).toString().padStart(2, '0')}`;
                  const is_sel = selectedMonths.includes(ym_bar);
                  const bg_apr = is_sel ? "#1a5276" : "#a9cce3";
                  const bst = is_sel ? { fontWeight: 'bold', color: '#1a5276' } : {};
                  return (
                    <td key={lbl} style={{ textAlign: 'center', verticalAlign: 'bottom', padding: '0 2px', width: `${100/12}%` }}>
                      <div style={{ fontSize: '8px', color: '#555', marginBottom: '2px', whiteSpace: 'nowrap' }}>{val > 0 ? formatCRC(val) : ""}</div>
                      <div style={{ display: 'flex', gap: '1px', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div title={`Presupuesto: ${formatCRC(pval)}`} style={{ width: '10px', height: `${h_ppto}px`, background: '#d0e8f8', borderRadius: '2px 2px 0 0', minHeight: '2px' }}></div>
                        <div title={`Aprobado: ${formatCRC(val)}`} style={{ width: '10px', height: `${h_apr}px`, background: bg_apr, borderRadius: '2px 2px 0 0', minHeight: '2px' }}></div>
                      </div>
                      <div style={{ fontSize: '9px', marginTop: '3px', ...bst }}>{lbl}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {["supervisor", "gerente_ventas", "compras", "admin"].includes(role) && (
        <>
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            {renderSupTable(by_sup_sel, `Gasto por Supervisor — ${sel_label}`)}
            {renderSupTable(by_sup_sel.map(r => ({ ...r, gasto: r.gasto * 3, ppto: r.ppto * 12 })), `Gasto por Supervisor — Acumulado ${year}`)}
          </div>
          
          {by_sup_marca_sel.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header">Gasto Supervisor + Marca — {sel_label}</div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Supervisor</th>
                      <th>Marca</th>
                      <th className="text-right">Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {by_sup_marca_sel.map((r, i) => (
                      <tr key={i}>
                        <td>{r.sup_nombre}</td>
                        <td>{r.marca}</td>
                        <td className="text-right">{formatCRC(r.gasto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {renderVendTable(by_vend_sel, `Gasto por Vendedor — ${sel_label}`)}
        </>
      )}

      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {renderMarcaTable(by_marca_sel, `Gasto por Marca — ${sel_label}`)}
        {renderMarcaTable(by_marca_sel.map(r => ({ ...r, gasto: r.gasto * 3, ppto: r.ppto * 12 })), `Gasto por Marca — Acumulado ${year}`)}
      </div>

      <div className="card">
        <div className="card-header">Top 10 Solicitudes — {sel_label}</div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th className="text-right">Monto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {top10.map(t => (
                <tr key={t.id}>
                  <td><a href={`/solicitud/${t.id}`}>{t.folio}</a></td>
                  <td>{t.vendedor_nombre}</td>
                  <td>{t.cliente_nombre}</td>
                  <td className="text-right">{formatCRC(t.monto_total_aprobado)}</td>
                  <td>{t.approved_at}</td>
                </tr>
              ))}
              {top10.length === 0 && (
                <tr><td colSpan="5" className="text-center color-muted">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
        <button className="btn btn-outline btn-sm">Exportar Dashboard CSV</button>
        <button className="btn btn-outline btn-sm">Exportar Solicitudes CSV</button>
        <button className="btn btn-outline btn-sm">Exportar Power BI</button>
      </div>

    </Layout>
  );
};

export default Dashboard;
