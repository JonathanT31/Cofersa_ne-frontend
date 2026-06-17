import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n) || n === null) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Data from Supabase
  const [solicitudes, setSolicitudes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [presupuesto, setPresupuesto] = useState([]);
  const [profiles, setProfiles] = useState([]);

  // Filter States
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Fetch budget
        const { data: budgetData, error: budgetErr } = await supabase
          .from('presupuesto')
          .select('*');
        if (budgetErr) throw budgetErr;
        setPresupuesto(budgetData || []);

        // 2. Fetch profiles to link supervisors
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('*');
        if (profilesErr) throw profilesErr;
        setProfiles(profilesData || []);

        // 3. Fetch solicitudes with vendor relation
        const { data: solData, error: solErr } = await supabase
          .from('solicitudes')
          .select(`
            *,
            vendedor:profiles!vendedor_id(id, nombre, apellido, username, supervisor_id)
          `);
        if (solErr) throw solErr;
        setSolicitudes(solData || []);

        // 4. Fetch SKU lines with parent solicitudes
        const { data: skusData, error: skusErr } = await supabase
          .from('solicitud_skus')
          .select(`
            *,
            solicitud:solicitudes(*)
          `);
        if (skusErr) throw skusErr;
        setSkus(skusData || []);

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  if (loading) {
    return (
      <Layout title="Dashboard" active="dashboard">
        <div className="text-center" style={{ padding: '100px 0' }}>
          <h3>Cargando estadísticas y presupuestos...</h3>
          <p className="color-muted">Analizando datos en tiempo real</p>
        </div>
      </Layout>
    );
  }

  // --- HIERARCHY SCOPING & FILTERING ---
  // Resolve supervisor details in frontend
  const profilesMap = {};
  profiles.forEach(p => {
    profilesMap[p.id] = p;
  });

  const getSupervisor = (vendedor) => {
    if (!vendedor || !vendedor.supervisor_id) return null;
    return profilesMap[vendedor.supervisor_id] || null;
  };

  // Filter solicitudes based on user role
  const scopedSolicitudes = solicitudes.filter(s => {
    if (user.role === 'vendedor') {
      return s.vendedor_id === user.id;
    } else if (user.role === 'supervisor') {
      // Find if vendedor of this request has user as supervisor
      const vendProfile = profilesMap[s.vendedor_id];
      return vendProfile?.supervisor_id === user.id;
    }
    return true; // Admin, Compras, Gerente de ventas see all
  });

  // Filter skus based on role
  const scopedSkus = skus.filter(sku => {
    const s = sku.solicitud;
    if (!s) return false;
    if (user.role === 'vendedor') {
      return s.vendedor_id === user.id;
    } else if (user.role === 'supervisor') {
      const vendProfile = profilesMap[s.vendedor_id];
      return vendProfile?.supervisor_id === user.id;
    }
    return true;
  });

  // Calculate scope budget
  let totalPptoMensual = 0;
  if (user.role === 'vendedor') {
    totalPptoMensual = presupuesto
      .filter(p => p.asesor === user.username)
      .reduce((sum, p) => sum + (p.ppto_mensual || 0), 0);
  } else if (user.role === 'supervisor') {
    totalPptoMensual = presupuesto
      .filter(p => p.supervisor === user.username)
      .reduce((sum, p) => sum + (p.ppto_mensual || 0), 0);
  } else {
    totalPptoMensual = presupuesto.reduce((sum, p) => sum + (p.ppto_mensual || 0), 0);
  }

  // --- TIME FILTERS ---
  const monthsNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const formattedSelectedMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const isApprovedInMonth = (s, ym) => {
    if (s.estado !== 'aprobada' || !s.approved_at) return false;
    return s.approved_at.startsWith(ym);
  };

  const isApprovedInYear = (s, yr) => {
    if (s.estado !== 'aprobada' || !s.approved_at) return false;
    return s.approved_at.startsWith(String(yr));
  };

  // --- KPI CALCULATIONS ---
  // Monthly statistics
  const solicitudesMes = scopedSolicitudes.filter(s => s.created_at && s.created_at.startsWith(formattedSelectedMonth));
  const aprobadasMes = scopedSolicitudes.filter(s => isApprovedInMonth(s, formattedSelectedMonth));
  const rechazadasMes = scopedSolicitudes.filter(s => s.estado === 'rechazada' && s.updated_at && s.updated_at.startsWith(formattedSelectedMonth));
  const pendientesMes = scopedSolicitudes.filter(s => ['pendiente', 'en_revision', 'escalada'].includes(s.estado));

  const gastoAprobadoMes = aprobadasMes.reduce((sum, s) => sum + (s.monto_total_aprobado || s.monto_total_descuento || 0), 0);
  const pptoMes = totalPptoMensual;
  const consumoMesPct = pptoMes > 0 ? (gastoAprobadoMes / pptoMes) * 100 : 0;

  // SLA calculations
  const aprobadasSlaOkMes = aprobadasMes.filter(s => s.approved_at && s.sla_deadline && s.approved_at <= s.sla_deadline);
  const slaPctMes = aprobadasMes.length > 0 ? (aprobadasSlaOkMes.length / aprobadasMes.length) * 100 : 0;

  // Annual statistics
  const aprobadasAnual = scopedSolicitudes.filter(s => isApprovedInYear(s, selectedYear));
  const gastoAcumuladoAnual = aprobadasAnual.reduce((sum, s) => sum + (s.monto_total_aprobado || s.monto_total_descuento || 0), 0);
  const pptoAnualProyectado = totalPptoMensual * 12;
  const consumoAnualPct = pptoAnualProyectado > 0 ? (gastoAcumuladoAnual / pptoAnualProyectado) * 100 : 0;
  const disponibleAnualEstimado = Math.max(0, pptoAnualProyectado - gastoAcumuladoAnual);

  // --- BAR CHART: MONTHLY EVOLUTION ---
  const monthlyEvolution = monthsNames.map((name, index) => {
    const mNum = index + 1;
    const ym = `${selectedYear}-${String(mNum).padStart(2, '0')}`;
    const monthApproved = scopedSolicitudes.filter(s => isApprovedInMonth(s, ym));
    const gasto = monthApproved.reduce((sum, s) => sum + (s.monto_total_aprobado || s.monto_total_descuento || 0), 0);
    return {
      name,
      monthNum: mNum,
      gasto,
      ppto: totalPptoMensual
    };
  });

  const maxChartVal = Math.max(...monthlyEvolution.map(m => Math.max(m.gasto, m.ppto)), 1);

  // --- TABLE CALCULATIONS ---

  // 1. Gasto por Supervisor
  const supervisorStatsMes = {};
  const supervisorStatsAnual = {};

  // Initialize all supervisors with their budget
  profiles.filter(p => p.role === 'supervisor').forEach(sup => {
    const supBudget = presupuesto
      .filter(p => p.supervisor === sup.username)
      .reduce((sum, p) => sum + (p.ppto_mensual || 0), 0);

    supervisorStatsMes[sup.id] = {
      nombre: `${sup.nombre} ${sup.apellido}`,
      username: sup.username,
      gasto: 0,
      presupuesto: supBudget
    };

    supervisorStatsAnual[sup.id] = {
      nombre: `${sup.nombre} ${sup.apellido}`,
      username: sup.username,
      gasto: 0,
      presupuesto: supBudget * 12
    };
  });

  // Calculate actual gasto
  aprobadasMes.forEach(s => {
    const vend = profilesMap[s.vendedor_id];
    const sup = getSupervisor(vend);
    if (sup && supervisorStatsMes[sup.id]) {
      supervisorStatsMes[sup.id].gasto += (s.monto_total_aprobado || s.monto_total_descuento || 0);
    }
  });

  aprobadasAnual.forEach(s => {
    const vend = profilesMap[s.vendedor_id];
    const sup = getSupervisor(vend);
    if (sup && supervisorStatsAnual[sup.id]) {
      supervisorStatsAnual[sup.id].gasto += (s.monto_total_aprobado || s.monto_total_descuento || 0);
    }
  });

  const supervisorTableMes = Object.values(supervisorStatsMes).filter(s => s.gasto > 0 || s.presupuesto > 0).sort((a, b) => b.gasto - a.gasto);
  const supervisorTableAnual = Object.values(supervisorStatsAnual).filter(s => s.gasto > 0 || s.presupuesto > 0).sort((a, b) => b.gasto - a.gasto);

  // 2. Gasto por Vendedor
  const vendedorStatsMes = {};
  aprobadasMes.forEach(s => {
    const vend = profilesMap[s.vendedor_id];
    if (vend) {
      if (!vendedorStatsMes[vend.id]) {
        vendedorStatsMes[vend.id] = {
          nombre: `${vend.nombre} ${vend.apellido}`,
          gasto: 0
        };
      }
      vendedorStatsMes[vend.id].gasto += (s.monto_total_aprobado || s.monto_total_descuento || 0);
    }
  });
  const vendedorTableMes = Object.values(vendedorStatsMes).sort((a, b) => b.gasto - a.gasto);

  // 3. Gasto por Marca (Mes & Acumulado)
  const marcaStatsMes = {};
  const marcaStatsAnual = {};

  // Sum budgets by brand
  const brandBudgets = {};
  presupuesto.forEach(p => {
    if (p.marca) {
      brandBudgets[p.marca] = (brandBudgets[p.marca] || 0) + (p.ppto_mensual || 0);
    }
  });

  // Calculate actual brand gasto from SKUs
  scopedSkus.forEach(sku => {
    const s = sku.solicitud;
    if (!s || s.estado !== 'aprobada' || !s.approved_at) return;
    
    const brand = sku.marca;
    if (!brand) return;

    const skuGasto = sku.monto_aprobado || sku.monto_descuento || 0;

    // Monthly
    if (s.approved_at.startsWith(formattedSelectedMonth)) {
      if (!marcaStatsMes[brand]) {
        marcaStatsMes[brand] = {
          marca: brand,
          gasto: 0,
          presupuesto: (brandBudgets[brand] || 0)
        };
      }
      marcaStatsMes[brand].gasto += skuGasto;
    }

    // Annual
    if (s.approved_at.startsWith(String(selectedYear))) {
      if (!marcaStatsAnual[brand]) {
        marcaStatsAnual[brand] = {
          marca: brand,
          gasto: 0,
          presupuesto: (brandBudgets[brand] || 0) * 12
        };
      }
      marcaStatsAnual[brand].gasto += skuGasto;
    }
  });

  // Ensure brands with budget are also listed if relevant
  Object.keys(brandBudgets).forEach(br => {
    if (brandBudgets[br] > 0) {
      if (!marcaStatsMes[br]) {
        marcaStatsMes[br] = { marca: br, gasto: 0, presupuesto: brandBudgets[br] };
      }
      if (!marcaStatsAnual[br]) {
        marcaStatsAnual[br] = { marca: br, gasto: 0, presupuesto: brandBudgets[br] * 12 };
      }
    }
  });

  const marcaTableMes = Object.values(marcaStatsMes).filter(m => m.gasto > 0 || m.presupuesto > 0).sort((a, b) => b.gasto - a.gasto);
  const marcaTableAnual = Object.values(marcaStatsAnual).filter(m => m.gasto > 0 || m.presupuesto > 0).sort((a, b) => b.gasto - a.gasto);

  // 4. Gasto Supervisor + Marca (Mes)
  const supMarcaStatsMes = {};
  scopedSkus.forEach(sku => {
    const s = sku.solicitud;
    if (!s || s.estado !== 'aprobada' || !s.approved_at || !s.approved_at.startsWith(formattedSelectedMonth)) return;

    const vend = profilesMap[s.vendedor_id];
    const sup = getSupervisor(vend);
    const brand = sku.marca;
    if (!sup || !brand) return;

    const key = `${sup.id}_${brand}`;
    if (!supMarcaStatsMes[key]) {
      supMarcaStatsMes[key] = {
        supervisor: `${sup.nombre} ${sup.apellido}`,
        marca: brand,
        gasto: 0
      };
    }
    supMarcaStatsMes[key].gasto += (sku.monto_aprobado || sku.monto_descuento || 0);
  });
  const supMarcaTableMes = Object.values(supMarcaStatsMes).sort((a, b) => b.gasto - a.gasto);

  // 5. Top 10 Solicitudes
  const top10Solicitudes = scopedSolicitudes
    .filter(s => isApprovedInMonth(s, formattedSelectedMonth))
    .sort((a, b) => (b.monto_total_aprobado || b.monto_total_descuento || 0) - (a.monto_total_aprobado || a.monto_total_descuento || 0))
    .slice(0, 10);

  // Get color depending on percentage consumption
  const getProgressColor = (pct) => {
    if (pct < 80) return '#27ae60'; // Green
    if (pct < 100) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  };

  const pcColorMes = getProgressColor(consumoMesPct);
  const pcColorAnual = getProgressColor(consumoAnualPct);

  return (
    <Layout title="Dashboard" active="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', gap: '12px' }}>
        <h1 style={{ margin: 0 }}>Dashboard — Control Presupuestario</h1>
        
        {/* Year / Month Selectors */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            className="form-control" 
            value={selectedYear} 
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            style={{ width: '90px', minHeight: '36px', height: '36px' }}
          >
            {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i).map(yr => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
          <select 
            className="form-control" 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(parseInt(e.target.value))}
            style={{ width: '130px', minHeight: '36px', height: '36px' }}
          >
            {monthsNames.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Row 1: Selected Month Overview */}
      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card">
          <div className="kpi-value">{formatCRC(gastoAprobadoMes)}</div>
          <div className="kpi-label">Gasto Aprobado ({monthsNames[selectedMonth - 1]} {selectedYear})</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{formatCRC(pptoMes)}</div>
          <div className="kpi-label">Presupuesto Período (1 mes)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: pcColorMes }}>{consumoMesPct.toFixed(1)}%</div>
          <div className="kpi-label">Consumo del Presupuesto</div>
          <div className="progress-bar" style={{ marginTop: '8px', height: '6px', background: '#e0e4ea', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(consumoMesPct, 100)}%`, height: '100%', background: pcColorMes }}></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{slaPctMes.toFixed(0)}%</div>
          <div className="kpi-label">Cumplimiento SLA</div>
          <div className="kpi-sub" style={{ fontSize: '11px', marginTop: '4px', color: '#888' }}>
            {aprobadasSlaOkMes.length}/{aprobadasMes.length} dentro de SLA
          </div>
        </div>
      </div>

      {/* KPI Row 2: Selected Month Operations */}
      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card">
          <div className="kpi-value">{solicitudesMes.length}</div>
          <div className="kpi-label">Solicitudes creadas en mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#27ae60' }}>{aprobadasMes.length}</div>
          <div className="kpi-label">Aprobadas en el mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#e74c3c' }}>{rechazadasMes.length}</div>
          <div className="kpi-label">Rechazadas en el mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: '#f39c12' }}>{pendientesMes.length}</div>
          <div className="kpi-label">Pendientes de Aprobación (hoy)</div>
        </div>
      </div>

      {/* KPI Row 3: Annual Stats */}
      <div className="grid-4" style={{ marginBottom: '16px' }}>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: pcColorAnual }}>{formatCRC(gastoAcumuladoAnual)}</div>
          <div className="kpi-label">Gasto Acumulado {selectedYear}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: pcColorAnual }}>{consumoAnualPct.toFixed(1)}%</div>
          <div className="kpi-label">Consumo Anual vs Ppto x12</div>
          <div className="progress-bar" style={{ marginTop: '8px', height: '6px', background: '#e0e4ea', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(consumoAnualPct, 100)}%`, height: '100%', background: pcColorAnual }}></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{formatCRC(pptoAnualProyectado)}</div>
          <div className="kpi-label">Presupuesto Anual Proyectado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{formatCRC(disponibleAnualEstimado)}</div>
          <div className="kpi-label">Disponible Anual Estimado</div>
        </div>
      </div>

      {/* Monthly Evolution Chart */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Evolución Mensual — {selectedYear}</span>
          <span style={{ fontSize: '11px', fontWeight: 400, color: '#888' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#d0e8f8', marginRight: '4px', borderRadius: '2px' }}></span> Presupuesto
            <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#1a5276', marginLeft: '12px', marginRight: '4px', borderRadius: '2px' }}></span> Aprobado
          </span>
        </div>
        <div style={{ padding: '16px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ verticalAlign: 'bottom', height: '120px' }}>
                {monthlyEvolution.map((m, idx) => {
                  const isSel = m.monthNum === selectedMonth;
                  const hApr = Math.max(2, Math.round((m.gasto / maxChartVal) * 80));
                  const hPpto = Math.max(2, Math.round((m.ppto / maxChartVal) * 80));
                  const bgApr = isSel ? '#1a5276' : '#a9cce3';
                  
                  return (
                    <td 
                      key={idx} 
                      style={{ 
                        textAlign: 'center', 
                        padding: '0 4px', 
                        width: `${100 / 12}%`,
                        cursor: 'pointer' 
                      }}
                      onClick={() => setSelectedMonth(m.monthNum)}
                    >
                      {m.gasto > 0 && (
                        <div style={{ fontSize: '9px', color: '#333', marginBottom: '4px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {formatCRC(m.gasto).replace('₡', '')}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div title={`Presupuesto: ${formatCRC(m.ppto)}`} style={{ width: '12px', height: `${hPpto}px`, background: '#d0e8f8', borderRadius: '2px 2px 0 0' }}></div>
                        <div title={`Aprobado: ${formatCRC(m.gasto)}`} style={{ width: '12px', height: `${hApr}px`, background: bgApr, borderRadius: '2px 2px 0 0' }}></div>
                      </div>
                      <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: isSel ? 700 : 400, color: isSel ? '#1a5276' : '#666' }}>
                        {m.name}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Supervisor section (Only for managers/admins) */}
      {['admin', 'compras', 'gerente_ventas'].includes(user.role) && (
        <div className="grid-2" style={{ marginBottom: '16px' }}>
          {/* Monthly */}
          <div className="card">
            <div className="card-header">Gasto por Supervisor — {monthsNames[selectedMonth - 1]} {selectedYear}</div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Supervisor</th>
                    <th className="text-right">Gasto</th>
                    <th className="text-right">Presupuesto</th>
                    <th className="text-right">% Consumo</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorTableMes.length > 0 ? (
                    <>
                      {supervisorTableMes.map((s, i) => {
                        const pct = s.presupuesto > 0 ? (s.gasto / s.presupuesto) * 100 : 0;
                        const pctColor = getProgressColor(pct);
                        return (
                          <tr key={i}>
                            <td>{s.nombre}</td>
                            <td className="text-right">{formatCRC(s.gasto)}</td>
                            <td className="text-right">{formatCRC(s.presupuesto)}</td>
                            <td className="text-right" style={{ color: pctColor, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                        <td>TOTAL</td>
                        <td className="text-right">{formatCRC(supervisorTableMes.reduce((sum, s) => sum + s.gasto, 0))}</td>
                        <td className="text-right">{formatCRC(supervisorTableMes.reduce((sum, s) => sum + s.presupuesto, 0))}</td>
                        <td className="text-right">
                          {(supervisorTableMes.reduce((sum, s) => sum + s.presupuesto, 0) > 0 
                            ? (supervisorTableMes.reduce((sum, s) => sum + s.gasto, 0) / supervisorTableMes.reduce((sum, s) => sum + s.presupuesto, 0)) * 100
                            : 0).toFixed(1)}%
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr><td colSpan="4" className="text-center color-muted">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cumulative */}
          <div className="card">
            <div className="card-header">Gasto por Supervisor — Acumulado {selectedYear}</div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Supervisor</th>
                    <th className="text-right">Gasto</th>
                    <th className="text-right">Presupuesto</th>
                    <th className="text-right">% Consumo</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorTableAnual.length > 0 ? (
                    <>
                      {supervisorTableAnual.map((s, i) => {
                        const pct = s.presupuesto > 0 ? (s.gasto / s.presupuesto) * 100 : 0;
                        const pctColor = getProgressColor(pct);
                        return (
                          <tr key={i}>
                            <td>{s.nombre}</td>
                            <td className="text-right">{formatCRC(s.gasto)}</td>
                            <td className="text-right">{formatCRC(s.presupuesto)}</td>
                            <td className="text-right" style={{ color: pctColor, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                        <td>TOTAL</td>
                        <td className="text-right">{formatCRC(supervisorTableAnual.reduce((sum, s) => sum + s.gasto, 0))}</td>
                        <td className="text-right">{formatCRC(supervisorTableAnual.reduce((sum, s) => sum + s.presupuesto, 0))}</td>
                        <td className="text-right">
                          {(supervisorTableAnual.reduce((sum, s) => sum + s.presupuesto, 0) > 0 
                            ? (supervisorTableAnual.reduce((sum, s) => sum + s.gasto, 0) / supervisorTableAnual.reduce((sum, s) => sum + s.presupuesto, 0)) * 100
                            : 0).toFixed(1)}%
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr><td colSpan="4" className="text-center color-muted">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Vendedor section (For supervisors and above) */}
      {['admin', 'compras', 'gerente_ventas', 'supervisor'].includes(user.role) && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header">Gasto por Vendedor — {monthsNames[selectedMonth - 1]} {selectedYear}</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="text-right" style={{ width: '250px' }}>Gasto</th>
                </tr>
              </thead>
              <tbody>
                {vendedorTableMes.length > 0 ? (
                  <>
                    {vendedorTableMes.map((v, i) => (
                      <tr key={i}>
                        <td>{v.nombre}</td>
                        <td className="text-right">{formatCRC(v.gasto)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                      <td>TOTAL</td>
                      <td className="text-right">{formatCRC(vendedorTableMes.reduce((sum, v) => sum + v.gasto, 0))}</td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="2" className="text-center color-muted">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Brand statistics row */}
      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Brand Monthly */}
        <div className="card">
          <div className="card-header">Gasto por Marca — {monthsNames[selectedMonth - 1]} {selectedYear}</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th className="text-right">Gasto</th>
                  <th className="text-right">Presupuesto</th>
                  <th className="text-right">% Consumo</th>
                </tr>
              </thead>
              <tbody>
                {marcaTableMes.length > 0 ? (
                  <>
                    {marcaTableMes.map((m, i) => {
                      const pct = m.presupuesto > 0 ? (m.gasto / m.presupuesto) * 100 : 0;
                      const pctColor = getProgressColor(pct);
                      return (
                        <tr key={i}>
                          <td>{m.marca}</td>
                          <td className="text-right">{formatCRC(m.gasto)}</td>
                          <td className="text-right">{formatCRC(m.presupuesto)}</td>
                          <td className="text-right" style={{ color: pctColor, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                      <td>TOTAL</td>
                      <td className="text-right">{formatCRC(marcaTableMes.reduce((sum, m) => sum + m.gasto, 0))}</td>
                      <td className="text-right">{formatCRC(marcaTableMes.reduce((sum, m) => sum + m.presupuesto, 0))}</td>
                      <td className="text-right">
                        {(marcaTableMes.reduce((sum, m) => sum + m.presupuesto, 0) > 0 
                          ? (marcaTableMes.reduce((sum, m) => sum + m.gasto, 0) / marcaTableMes.reduce((sum, m) => sum + m.presupuesto, 0)) * 100
                          : 0).toFixed(1)}%
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="4" className="text-center color-muted">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Brand Cumulative */}
        <div className="card">
          <div className="card-header">Gasto por Marca — Acumulado {selectedYear}</div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th className="text-right">Gasto</th>
                  <th className="text-right">Presupuesto</th>
                  <th className="text-right">% Consumo</th>
                </tr>
              </thead>
              <tbody>
                {marcaTableAnual.length > 0 ? (
                  <>
                    {marcaTableAnual.map((m, i) => {
                      const pct = m.presupuesto > 0 ? (m.gasto / m.presupuesto) * 100 : 0;
                      const pctColor = getProgressColor(pct);
                      return (
                        <tr key={i}>
                          <td>{m.marca}</td>
                          <td className="text-right">{formatCRC(m.gasto)}</td>
                          <td className="text-right">{formatCRC(m.presupuesto)}</td>
                          <td className="text-right" style={{ color: pctColor, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                      <td>TOTAL</td>
                      <td className="text-right">{formatCRC(marcaTableAnual.reduce((sum, m) => sum + m.gasto, 0))}</td>
                      <td className="text-right">{formatCRC(marcaTableAnual.reduce((sum, m) => sum + m.presupuesto, 0))}</td>
                      <td className="text-right">
                        {(marcaTableAnual.reduce((sum, m) => sum + m.presupuesto, 0) > 0 
                          ? (marcaTableAnual.reduce((sum, m) => sum + m.gasto, 0) / marcaTableAnual.reduce((sum, m) => sum + m.presupuesto, 0)) * 100
                          : 0).toFixed(1)}%
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="4" className="text-center color-muted">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cross Supervisor + Brand table (Only for managers/admins) */}
      {['admin', 'compras', 'gerente_ventas'].includes(user.role) && supMarcaTableMes.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header">Gasto Supervisor + Marca — {monthsNames[selectedMonth - 1]} {selectedYear}</div>
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
                {supMarcaTableMes.map((sm, i) => (
                  <tr key={i}>
                    <td>{sm.supervisor}</td>
                    <td>{sm.marca}</td>
                    <td className="text-right">{formatCRC(sm.gasto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top 10 Solicitudes Mes */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">Top 10 Solicitudes Aprobadas — {monthsNames[selectedMonth - 1]} {selectedYear}</div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Vendedor</th>
                <th>Cliente</th>
                <th className="text-right">Monto Aprobado</th>
                <th>Fecha Aprobación</th>
              </tr>
            </thead>
            <tbody>
              {top10Solicitudes.length > 0 ? (
                top10Solicitudes.map((s, i) => {
                  const vend = profilesMap[s.vendedor_id];
                  return (
                    <tr key={i}>
                      <td>
                        <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                      </td>
                      <td>{vend ? `${vend.nombre} ${vend.apellido}` : 'Desconocido'}</td>
                      <td>{s.cliente_nombre}</td>
                      <td className="text-right">{formatCRC(s.monto_total_aprobado || s.monto_total_descuento || 0)}</td>
                      <td>{s.approved_at ? s.approved_at.substring(0, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="5" className="text-center color-muted">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
