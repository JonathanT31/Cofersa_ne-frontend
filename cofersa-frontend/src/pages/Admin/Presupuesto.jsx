import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const Presupuesto = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ presupuesto: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchPpto = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/presupuesto?${searchParams.toString()}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPpto();
  }, [searchParams]);

  const handleAddRow = async () => {
    const res = await fetch('/admin/presupuesto/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 0, field: 'new', value: '' })
    });
    if ((await res.json()).ok) fetchPpto();
  };

  const handleSave = async (id, field, value) => {
    const res = await fetch('/admin/presupuesto/save', {
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

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar?')) return;
    const res = await fetch('/admin/presupuesto/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if ((await res.json()).ok) fetchPpto();
  };

  const changePage = (p) => {
    searchParams.set('page', p);
    setSearchParams(searchParams);
  };

  const totalPages = Math.ceil((data.total || 0) / (data.per_page || 50));

  return (
    <Layout title="Presupuesto" active="presupuesto">
      <h1>Presupuesto Mensual por Marca/Asesor</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form method="POST" action="/admin/presupuesto/import" encType="multipart/form-data" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="file" name="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="submit" className="btn btn-primary btn-sm">Importar Excel/CSV</button>
          </form>
          <a href="/api/export/presupuesto" className="btn btn-outline btn-sm">Exportar CSV</a>
          <button className="btn btn-success btn-sm" onClick={handleAddRow}>+ Agregar Fila</button>
        </div>
        
        <p style={{ fontSize: '12px', color: '#888' }}>Total: {data.total} registros | Página {data.page} de {totalPages}</p>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>#</th><th>Supervisor</th><th>Asesor</th><th>Marca</th><th>Ppto Mensual CRC</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="6" className="text-center">Cargando...</td></tr> : data.presupuesto.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td><input type="text" className="form-control" defaultValue={p.supervisor} onBlur={e => onBlur(e, p.id, 'supervisor')} style={{ minWidth: '120px' }} /></td>
                  <td><input type="text" className="form-control" defaultValue={p.asesor} onBlur={e => onBlur(e, p.id, 'asesor')} style={{ minWidth: '120px' }} /></td>
                  <td><input type="text" className="form-control" defaultValue={p.marca} onBlur={e => onBlur(e, p.id, 'marca')} style={{ minWidth: '100px' }} /></td>
                  <td><input type="number" className="form-control" defaultValue={p.ppto_mensual_crc} onBlur={e => onBlur(e, p.id, 'ppto_mensual_crc')} style={{ width: '120px' }} /></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '10px' }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} className={`btn btn-sm ${p === data.page ? 'btn-primary' : 'btn-outline'}`} onClick={() => changePage(p)} style={{ marginRight: '4px' }}>{p}</button>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Presupuesto;
