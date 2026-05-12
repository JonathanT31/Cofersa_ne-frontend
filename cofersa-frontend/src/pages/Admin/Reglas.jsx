import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import Layout from '../../components/layout/Layout';

const Reglas = () => {
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReglas = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reglas');
      const data = await res.json();
      if (data.ok) setReglas(data.reglas);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReglas();
  }, []);

  const handleAddRow = async () => {
    const res = await fetch('/admin/reglas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 0, field: 'new', value: '' })
    });
    if ((await res.json()).ok) fetchReglas();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta regla?')) return;
    const res = await fetch('/admin/reglas/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if ((await res.json()).ok) fetchReglas();
  };

  const handleChange = async (id, field, value) => {
    // Update local state for immediate feedback
    setReglas(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (id, field, value) => {
    const res = await fetch('/admin/reglas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, field, value })
    });
    return (await res.json()).ok;
  };

  const onBlur = async (e, id, field) => {
    const el = e.target;
    const ok = await handleSave(id, field, el.value);
    el.style.borderColor = ok ? '#27ae60' : '#e74c3c';
    setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
  };

  return (
    <Layout title="Reglas de Aprobación" active="reglas">
      <h1>Reglas de Aprobación por Marca</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form method="POST" action="/admin/reglas/import" encType="multipart/form-data" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="file" name="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="submit" className="btn btn-primary btn-sm">Importar Excel/CSV</button>
          </form>
          <a href="/api/export/reglas" className="btn btn-outline btn-sm">Exportar CSV</a>
          <button className="btn btn-success btn-sm" onClick={handleAddRow}>+ Agregar Fila</button>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Marca</th><th>Clasificación</th>
                <th>Lím. Vendedor %</th><th>Lím. Supervisor %</th><th>Compras (≥ Lím. Supervisor)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">Cargando...</td></tr>
              ) : reglas.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td><input type="text" className="form-control" value={r.marca} onChange={e => handleChange(r.id, 'marca', e.target.value)} onBlur={e => onBlur(e, r.id, 'marca')} style={{ minWidth: '120px' }} /></td>
                  <td><input type="text" className="form-control" value={r.clasificacion} onChange={e => handleChange(r.id, 'clasificacion', e.target.value)} onBlur={e => onBlur(e, r.id, 'clasificacion')} style={{ minWidth: '80px' }} /></td>
                  <td><input type="number" className="form-control" value={r.limite_vendedor} step="0.01" onChange={e => handleChange(r.id, 'limite_vendedor', e.target.value)} onBlur={e => onBlur(e, r.id, 'limite_vendedor')} style={{ width: '80px' }} /></td>
                  <td><input type="number" className="form-control" value={r.limite_supervisor} step="0.01" onChange={e => handleChange(r.id, 'limite_supervisor', e.target.value)} onBlur={e => onBlur(e, r.id, 'limite_supervisor')} style={{ width: '80px' }} /></td>
                  <td style={{ padding: '8px', fontSize: '13px', color: '#555' }}>≥ <strong>{r.limite_compras}%</strong></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Reglas;
