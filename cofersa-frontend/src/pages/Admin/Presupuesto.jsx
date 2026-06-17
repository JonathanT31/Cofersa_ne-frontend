import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const SearchableSelect = ({ value, onChange, onBlur, options, placeholder }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const matched = options.find(o => o.value === value);
    setSearch(matched ? matched.label : value || '');
  }, [value, options]);

  const filtered = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (option) => {
    onChange(option.value);
    setSearch(option.label);
    setIsOpen(false);
    if (onBlur) {
      onBlur(option.value);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest('.search-select-container')) {
        setIsOpen(false);
        const matched = options.find(o => o.value === value);
        setSearch(matched ? matched.label : value || '');
        if (onBlur) onBlur(value);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, value, options]);

  return (
    <div className="search-select-container" style={{ position: 'relative', minWidth: '180px' }}>
      <input 
        type="text" 
        className="form-control" 
        value={search} 
        onChange={e => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          zIndex: 1000,
          maxHeight: '180px',
          overflowY: 'auto',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
        }}>
          {filtered.length > 0 ? (
            filtered.map(opt => (
              <div 
                key={opt.value} 
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                onClick={() => handleSelect(opt)}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '12px' }}>No se encontraron opciones</div>
          )}
        </div>
      )}
    </div>
  );
};

const Presupuesto = () => {
  const [presupuesto, setPresupuesto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);

  // States for search dropdowns
  const [profiles, setProfiles] = useState([]);
  const [marcas, setMarcas] = useState([]);

  useEffect(() => {
    fetchPresupuesto();
    fetchSupportData();
  }, []);

  const fetchPresupuesto = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('presupuesto')
        .select('*')
        .order('supervisor', { ascending: true });
      
      if (error) throw error;
      setPresupuesto(data || []);
    } catch (err) {
      console.error('Error fetching presupuesto:', err);
    } finally {
      setLoading(false);
    }  
  };

  const fetchSupportData = async () => {
    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('username, nombre, apellido, role');
      setProfiles(profs || []);

      const { data: rules } = await supabase
        .from('reglas')
        .select('marca');
      if (rules) {
        const uniqueMarcas = [...new Set(rules.map(r => r.marca))].sort();
        setMarcas(uniqueMarcas);
      }
    } catch (err) {
      console.error('Error fetching support data:', err);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) return;

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/import-presupuesto`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error al importar archivo');
      
      const result = await response.json();
      alert(`Éxito: Se importaron ${result.count} registros de presupuesto.`);
      fetchPresupuesto();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImporting(false);
      setFile(null);
    }
  };

  const handleExportCSV = () => {
    if (presupuesto.length === 0) return;
    const headers = ['Supervisor', 'Asesor', 'Marca', 'Ppto Mensual'];
    const rows = presupuesto.map(p => [
      p.supervisor || '',
      p.asesor || '',
      p.marca || '',
      p.ppto_mensual ?? 0
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `presupuesto_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddRow = () => {
    setPresupuesto([{
      id: 'new-' + Date.now(),
      supervisor: '',
      asesor: '',
      marca: '',
      ppto_mensual: 0
    }, ...presupuesto]);
  };

  const handleCellChange = (id, field, value) => {
    setPresupuesto(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleCellBlur = async (row, field, value) => {
    const isNew = typeof row.id === 'string' && row.id.startsWith('new-');
    
    if (isNew) {
      // We only insert if both marca and asesor have values
      if (!row.marca || !row.marca.trim() || !row.asesor || !row.asesor.trim()) {
        return; 
      }
      try {
        const { id, ...dataToInsert } = row;
        // Ensure to save the latest updated field/value in dataToInsert
        dataToInsert[field] = value;
        const { data, error } = await supabase
          .from('presupuesto')
          .insert([dataToInsert])
          .select();
        
        if (error) throw error;
        if (data && data.length > 0) {
          setPresupuesto(prev => prev.map(p => p.id === row.id ? data[0] : p));
        }
      } catch (err) {
        console.error('Error inserting budget row:', err);
        alert('Error al insertar presupuesto: ' + err.message);
      }
    } else {
      try {
        const { error } = await supabase
          .from('presupuesto')
          .update({ [field]: value })
          .eq('id', row.id);
        
        if (error) throw error;
      } catch (err) {
        console.error('Error updating budget row:', err);
        alert('Error al actualizar presupuesto: ' + err.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (typeof id === 'string' && id.startsWith('new-')) {
      setPresupuesto(presupuesto.filter(p => p.id !== id));
      return;
    }

    if (window.confirm('¿Eliminar este registro permanentemente?')) {
      const { error } = await supabase.from('presupuesto').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchPresupuesto();
    }
  };

  // Prepare options for select fields
  const supervisorOptions = profiles
    .filter(p => p.role === 'supervisor' || p.role === 'admin')
    .map(p => ({ value: p.username, label: `${p.nombre} ${p.apellido} (${p.username})` }));

  const asesorOptions = profiles
    .filter(p => p.role === 'vendedor' || p.role === 'admin')
    .map(p => ({ value: p.username, label: `${p.nombre} ${p.apellido} (${p.username})` }));

  const marcaOptions = marcas.map(m => ({ value: m, label: m }));

  return (
    <Layout title="Presupuesto" active="presupuesto">
      <h1>Presupuesto Mensual por Marca/Asesor</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={handleImport}>
            <input 
                type="file" 
                accept=".xlsx" 
                className="form-control" 
                style={{ maxWidth: '300px' }} 
                onChange={e => setFile(e.target.files[0])}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!file || importing}>
                {importing ? 'Importando...' : 'Importar Excel/CSV'}
            </button>
          </form>
          
          <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>Exportar CSV</button>
          <button className="btn btn-success btn-sm" onClick={handleAddRow} disabled={loading}>+ Agregar Fila</button>
          
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Supervisor</th>
                <th>Asesor</th>
                <th>Marca</th>
                <th className="text-right" style={{ width: '180px' }}>Ppto Mensual</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Cargando presupuesto...</td></tr>
              ) : presupuesto.map((p, index) => (
                <tr key={p.id}>
                  <td>{index + 1}</td>
                  <td>
                    <SearchableSelect 
                      value={p.supervisor}
                      onChange={val => handleCellChange(p.id, 'supervisor', val)}
                      onBlur={val => handleCellBlur(p, 'supervisor', val)}
                      options={supervisorOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td>
                    <SearchableSelect 
                      value={p.asesor}
                      onChange={val => handleCellChange(p.id, 'asesor', val)}
                      onBlur={val => handleCellBlur(p, 'asesor', val)}
                      options={asesorOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td>
                    <SearchableSelect 
                      value={p.marca}
                      onChange={val => handleCellChange(p.id, 'marca', val)}
                      onBlur={val => handleCellBlur(p, 'marca', val)}
                      options={marcaOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td className="text-right">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#777' }}>₡</span>
                      <input 
                        type="number" 
                        className="form-control text-right" 
                        value={p.ppto_mensual}
                        onChange={e => handleCellChange(p.id, 'ppto_mensual', parseFloat(e.target.value) || 0)}
                        onBlur={e => handleCellBlur(p, 'ppto_mensual', parseFloat(e.target.value) || 0)}
                        style={{ width: '130px', minHeight: '34px', height: '34px' }}
                      />
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!loading && presupuesto.length === 0 && (
                <tr><td colSpan="6" className="text-center color-muted">No hay registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Presupuesto;
