import React, { useState } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';

const Exportar = () => {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(null); // Guardará el ID o nombre del reporte actual

  const role = user?.role || 'vendedor';

  const downloadCSV = (data, filename) => {
    if (!data || !data.length) {
      alert("No se encontraron datos para exportar.");
      return;
    }
    
    // Obtener todas las claves únicas de los objetos como columnas
    const headers = Object.keys(data[0]);
    
    // Construir las filas del CSV
    const csvRows = [];
    csvRows.push(headers.join(',')); // Fila de cabecera
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        // Convertir null/undefined a string vacío, y escapar comillas dobles
        let cellText = val !== null && val !== undefined ? String(val) : '';
        cellText = cellText.replace(/"/g, '""'); // Escapar comillas dobles estándar en CSV
        
        // Si contiene comas, saltos de línea o comillas, envolver todo entre comillas dobles
        if (cellText.includes(',') || cellText.includes('\n') || cellText.includes('\r') || cellText.includes('"')) {
          return `"${cellText}"`;
        }
        return cellText;
      });
      csvRows.push(values.join(','));
    }
    
    // Añadir BOM (Byte Order Mark) UTF-8 para compatibilidad directa con Excel en español
    const csvContent = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSupervisedVendedores = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('supervisor_id', user.id);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching supervised vendedores:', err);
      return [];
    }
  };

  const handleExportSolicitudes = async (onlyApproved = false) => {
    const reportType = onlyApproved ? 'aprobadas' : 'todas_solicitudes';
    setExporting(reportType);
    try {
      let query = supabase.from('solicitudes').select('*');
      
      if (role === 'vendedor') {
        query = query.eq('vendedor_id', user.id);
      } else if (role === 'supervisor') {
        const supervised = await getSupervisedVendedores();
        const ids = supervised.map(v => v.id);
        ids.push(user.id); // Incluir al propio supervisor
        query = query.in('vendedor_id', ids);
      }

      if (onlyApproved) {
        query = query.eq('estado', 'aprobada');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const prefix = onlyApproved ? 'solicitudes_aprobadas' : 'todas_solicitudes';
      downloadCSV(data, `${prefix}_${new Date().toISOString().substring(0,10)}.csv`);
    } catch (err) {
      alert(`Error al exportar solicitudes: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPresupuesto = async () => {
    setExporting('presupuesto');
    try {
      let query = supabase.from('presupuesto').select('*');
      
      if (role === 'supervisor') {
        const supervised = await getSupervisedVendedores();
        const usernames = supervised.map(v => v.username).filter(Boolean);
        // Incluir el username del propio supervisor
        if (user.username) usernames.push(user.username);
        
        if (usernames.length > 0) {
          query = query.in('asesor', usernames);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      downloadCSV(data, `presupuesto_${new Date().toISOString().substring(0,10)}.csv`);
    } catch (err) {
      alert(`Error al exportar presupuestos: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportReglas = async () => {
    setExporting('reglas');
    try {
      const { data, error } = await supabase.from('reglas').select('*');
      if (error) throw error;
      downloadCSV(data, `reglas_descuento_${new Date().toISOString().substring(0,10)}.csv`);
    } catch (err) {
      alert(`Error al exportar reglas: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportAuditoria = async () => {
    setExporting('auditoria');
    try {
      const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      downloadCSV(data, `log_auditoria_${new Date().toISOString().substring(0,10)}.csv`);
    } catch (err) {
      alert(`Error al exportar auditoría: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Layout title="Exportar" active="exportar">
      <h1>Exportar Datos</h1>
      <p style={{ color: '#555', fontSize: '13px', marginBottom: '20px' }}>
        Los datos exportados respetan tu nivel de acceso y rol dentro de la plataforma.
      </p>
      
      <div className="grid-2">
        {/* Sección Solicitudes */}
        <div className="card">
          <div className="card-header">📋 Solicitudes y Aprobaciones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => handleExportSolicitudes(false)}
              disabled={exporting !== null}
            >
              {exporting === 'todas_solicitudes' ? 'Exportando...' : 'Todas las Solicitudes (CSV)'}
            </button>
            <button 
              className="btn btn-success btn-sm" 
              onClick={() => handleExportSolicitudes(true)}
              disabled={exporting !== null}
            >
              {exporting === 'aprobadas' ? 'Exportando...' : 'Solo Aprobadas (CSV)'}
            </button>
          </div>
          
          {role === 'vendedor' && (
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', fontStyle: 'italic' }}>
              * Limitado a tus propias solicitudes enviadas.
            </p>
          )}
          {role === 'supervisor' && (
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', fontStyle: 'italic' }}>
              * Limitado a tus solicitudes y las de los asesores bajo tu supervisión.
            </p>
          )}
        </div>
        
        {/* Sección Presupuesto */}
        {role !== 'vendedor' && (
          <div className="card">
            <div className="card-header">💰 Presupuestos por Marca</div>
            <div style={{ marginTop: '10px' }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleExportPresupuesto}
                disabled={exporting !== null}
              >
                {exporting === 'presupuesto' ? 'Exportando...' : 'Exportar Presupuesto (CSV)'}
              </button>
            </div>
            {role === 'supervisor' && (
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', fontStyle: 'italic' }}>
                * Limitado a los presupuestos de los asesores que supervisas.
              </p>
            )}
          </div>
        )}
        
        {/* Sección Administración */}
        {role === 'admin' && (
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">⚙️ Configuración Administrativa (Admin)</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleExportReglas}
                disabled={exporting !== null}
              >
                {exporting === 'reglas' ? 'Exportando...' : 'Exportar Reglas de Descuento (CSV)'}
              </button>
              <button 
                className="btn btn-outline btn-sm" 
                onClick={handleExportAuditoria}
                disabled={exporting !== null}
              >
                {exporting === 'auditoria' ? 'Exportando...' : 'Exportar Registro de Auditoría (CSV)'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Exportar;
