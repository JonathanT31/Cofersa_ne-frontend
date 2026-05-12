import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';


const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const now = new Date();
  const year = parseInt(searchParams.get('year') || now.getFullYear());
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [now.toISOString().substring(0, 7)];

  const mlm = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/data?${searchParams.toString()}`)
      .then(res => res.json())
      .then(json => {
        if (json.ok) setData(json);
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  if (loading || !data) return <Layout title="Dashboard"><div>Cargando dashboard...</div></Layout>;

  const toggleMonth = (ym) => {
    let next;
    if (selectedMonths.includes(ym)) next = selectedMonths.filter(x => x !== ym);
    else next = [...selectedMonths, ym].sort();

    if (next.length) searchParams.set('months', next.join(','));
    else searchParams.delete('months');
    setSearchParams(searchParams);
  };

  const sel_label = selectedMonths.length === 1
    ? `${mlm[parseInt(selectedMonths[0].split('-')[1]) - 1]} ${selectedMonths[0].split('-')[0]}`
    : `${selectedMonths.length} meses seleccionados`;

  return (
    <Layout title="Dashboard" active="dashboard">
      <div className="page-header">
        <h1>Dashboard — Control Presupuestario</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#888' }}>Meses seleccionados ({selectedMonths.length})</label>
            <button type="button" onClick={() => setPickerOpen(!pickerOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', minWidth: '220px', justifyContent: 'space-between', minHeight: '40px' }}>
              <span>{sel_label}</span>
              <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
            </button>
            {pickerOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 300, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: '200px', maxHeight: '340px', overflowY: 'auto', padding: '4px 0' }}>
                {Array.from({ length: 12 }, (_, i) => {
                  const ym = `${year}-${(i + 1).toString().padStart(2, '0')}`;
                  return (
                    <label key={ym} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={selectedMonths.includes(ym)} onChange={() => toggleMonth(ym)} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                      <span style={{ fontWeight: selectedMonths.includes(ym) ? 'bold' : 'normal', color: selectedMonths.includes(ym) ? '#1a5276' : 'inherit' }}>{mlm[i]} {year}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(data.gasto_sel)}</div><div className="kpi-label">Gasto Aprobado</div></div>
        <div className="kpi-card"><div className="kpi-value">{formatCRC(data.ppto_periodo)}</div><div className="kpi-label">Presupuesto Período</div></div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: data.consumo_pct < 80 ? '#27ae60' : '#e67e22' }}>{data.consumo_pct}%</div>
          <div className="kpi-label">Consumo Ppto.</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{data.sla_pct}%</div>
          <div className="kpi-label">SLA ({data.sla_ok} ok)</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card"><div className="kpi-value">{data.total_sol_sel}</div><div className="kpi-label">Solicitudes (período)</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--success)' }}>{data.aprobadas_sel}</div><div className="kpi-label">Aprobadas</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--danger)' }}>{data.rechazadas_sel}</div><div className="kpi-label">Rechazadas</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{ color: 'var(--warning)' }}>{data.pendientes}</div><div className="kpi-label">Pendientes (hoy)</div></div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">Evolución Mensual — {year}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ verticalAlign: 'bottom', height: '110px' }}>
                {mlm.map((lbl, i) => {
                  const val = data.monthly_evo[i] || 0;
                  const max_val = Math.max(...data.monthly_evo, 1);
                  const h = Math.floor((val / max_val) * 80);
                  const ym = `${year}-${(i + 1).toString().padStart(2, '0')}`;
                  const is_sel = selectedMonths.includes(ym);
                  return (
                    <td key={lbl} style={{ textAlign: 'center', verticalAlign: 'bottom', padding: '0 2px', width: `${100/12}%` }}>
                      <div style={{ fontSize: '8px', color: '#555', marginBottom: '2px' }}>{val > 0 ? formatCRC(val) : ""}</div>
                      <div title={formatCRC(val)} style={{ width: '20px', height: `${h}px`, background: is_sel ? '#1a5276' : '#a9cce3', borderRadius: '2px 2px 0 0', margin: '0 auto', minHeight: '2px' }}></div>
                      <div style={{ fontSize: '9px', marginTop: '3px', fontWeight: is_sel ? 'bold' : 'normal' }}>{lbl}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
        <a href={`/api/export/solicitudes?months=${selectedMonths.join(',')}`} className="btn btn-outline btn-sm">Exportar Solicitudes CSV</a>
        <a href={`/api/export/powerbi?months=${selectedMonths.join(',')}`} className="btn btn-outline btn-sm">Exportar Power BI</a>
      </div>
    </Layout>
  );
};

export default Dashboard;
