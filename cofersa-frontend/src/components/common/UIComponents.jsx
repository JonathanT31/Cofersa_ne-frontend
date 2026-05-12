import React from 'react';

export const formatCRC = (n) => {
  if (isNaN(n) || n === null || n === undefined) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatPct = (n) => {
  if (isNaN(n) || n === null || n === undefined) return "0.00%";
  return Number(n).toFixed(2) + "%";
};

export const EstadoBadge = ({ estado }) => {
  const clsMap = {
    'borrador': 'badge-draft', 'pendiente': 'badge-pending',
    'en_revision': 'badge-review', 'escalada': 'badge-escalated',
    'aprobada': 'badge-approved', 'parcialmente_aprobada': 'badge-escalated',
    'rechazada': 'badge-rejected', 'cancelada': 'badge-cancelled',
  };
  const labels = {
    'borrador': 'Borrador', 'pendiente': 'Pendiente',
    'en_revision': 'En Revisión', 'escalada': 'Escalada',
    'aprobada': 'Aprobada', 'parcialmente_aprobada': 'Parcial',
    'rechazada': 'Rechazada', 'cancelada': 'Cancelada',
  };
  return <span className={`badge ${clsMap[estado] || 'badge-draft'}`}>{labels[estado] || estado}</span>;
};
