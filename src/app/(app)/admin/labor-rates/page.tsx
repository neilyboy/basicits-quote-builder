'use client';

import { useState, useEffect } from 'react';
import { LaborRate } from '@/types';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function LaborRatesPage() {
  const [rates, setRates] = useState<LaborRate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LaborRate | null>(null);
  const [form, setForm] = useState({ name: '', rate_per_hour: 0, description: '' });

  useEffect(() => { loadRates(); }, []);

  async function loadRates() {
    const res = await fetch('/api/labor-rates');
    setRates(await res.json());
  }

  function openNew() { setEditing(null); setForm({ name: '', rate_per_hour: 0, description: '' }); setShowForm(true); }
  function openEdit(r: LaborRate) { setEditing(r); setForm({ name: r.name, rate_per_hour: r.rate_per_hour, description: r.description || '' }); setShowForm(true); }

  async function save() {
    if (!form.name.trim()) return;
    const payload = { ...form, rate_per_hour: Number(form.rate_per_hour) };
    if (editing) {
      await fetch('/api/labor-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editing.id, is_active: editing.is_active }) });
    } else {
      await fetch('/api/labor-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setShowForm(false);
    loadRates();
  }

  async function deleteRate(id: number) {
    if (!confirm('Delete this labor rate?')) return;
    await fetch(`/api/labor-rates?id=${id}`, { method: 'DELETE' });
    loadRates();
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Labor Rates</h1>
          <p className="text-sm text-slate-500">Define hourly rates for different labor types</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add Rate</button>
      </div>

      <div className="space-y-2">
        {rates.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No labor rates defined yet.</div>
        ) : rates.map(r => (
          <div key={r.id} className="card p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-slate-900">{r.name}</h3>
              {r.description && <p className="text-sm text-slate-500">{r.description}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900">{fmt(r.rate_per_hour)}/hr</span>
              <button onClick={() => openEdit(r)} className="btn-ghost btn-xs">Edit</button>
              <button onClick={() => deleteRate(r.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Labor Rate' : 'New Labor Rate'}</h2>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div><label className="label">Rate Per Hour ($)</label><input className="input" type="number" step="0.01" value={form.rate_per_hour || ''} onChange={e => setForm(f => ({ ...f, rate_per_hour: parseFloat(e.target.value) || 0 }))} /></div>
              <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={!form.name.trim()} className="btn-primary flex-1">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
