'use client';

import { useState, useEffect } from 'react';
import { Assembly, Product, LaborRate } from '@/types';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AssembliesPage() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [laborRates, setLaborRates] = useState<LaborRate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Assembly | null>(null);
  const [form, setForm] = useState({ name: '', description: '', default_multiplier: 1, default_labor_minutes: 0, default_labor_rate_id: '' as string });
  const [components, setComponents] = useState<{ product_id: number; quantity: number }[]>([]);

  useEffect(() => {
    loadAssemblies();
    fetch('/api/products').then(r => r.json()).then(setProducts);
    fetch('/api/labor-rates').then(r => r.json()).then(setLaborRates);
  }, []);

  async function loadAssemblies() {
    const res = await fetch('/api/assemblies');
    setAssemblies(await res.json());
  }

  function openNew() {
    setEditing(null);
    setForm({ name: '', description: '', default_multiplier: 1, default_labor_minutes: 0, default_labor_rate_id: '' });
    setComponents([]);
    setShowForm(true);
  }

  function openEdit(a: Assembly) {
    setEditing(a);
    setForm({
      name: a.name, description: a.description || '',
      default_multiplier: a.default_multiplier, default_labor_minutes: a.default_labor_minutes,
      default_labor_rate_id: a.default_labor_rate_id ? String(a.default_labor_rate_id) : '',
    });
    setComponents((a.components || []).map(c => ({ product_id: c.product_id, quantity: c.quantity })));
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      default_multiplier: Number(form.default_multiplier),
      default_labor_minutes: Number(form.default_labor_minutes),
      default_labor_rate_id: form.default_labor_rate_id ? Number(form.default_labor_rate_id) : null,
      components,
    };
    if (editing) {
      await fetch('/api/assemblies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editing.id }) });
    } else {
      await fetch('/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setShowForm(false);
    loadAssemblies();
  }

  async function deleteAssembly(id: number) {
    if (!confirm('Delete this assembly?')) return;
    await fetch(`/api/assemblies?id=${id}`, { method: 'DELETE' });
    loadAssemblies();
  }

  function addComponent() {
    if (products.length === 0) return;
    setComponents([...components, { product_id: products[0].id, quantity: 1 }]);
  }

  function removeComponent(idx: number) {
    setComponents(components.filter((_, i) => i !== idx));
  }

  function updateComponent(idx: number, field: string, value: number) {
    const copy = [...components];
    copy[idx] = { ...copy[idx], [field]: value };
    setComponents(copy);
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assemblies</h1>
          <p className="text-sm text-slate-500">Create bundles of products and labor for common installations</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ New Assembly</button>
      </div>

      <div className="space-y-3">
        {assemblies.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No assemblies yet. Create one to bundle products and labor.</div>
        ) : assemblies.map(a => (
          <div key={a.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{a.name}</h3>
                {a.description && <p className="text-sm text-slate-500 mt-0.5">{a.description}</p>}
                <div className="flex gap-4 text-xs text-slate-400 mt-2">
                  <span>{(a.components || []).length} components</span>
                  <span>{a.default_labor_minutes} min labor</span>
                  <span>×{a.default_multiplier} multiplier</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(a)} className="btn-ghost btn-xs">Edit</button>
                <button onClick={() => deleteAssembly(a.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh] overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 mb-10">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Assembly' : 'New Assembly'}</h2>
            <div className="space-y-4">
              <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div><label className="label">Description</label><textarea className="input min-h-[60px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Multiplier</label><input className="input" type="number" step="0.01" value={form.default_multiplier} onChange={e => setForm(f => ({ ...f, default_multiplier: parseFloat(e.target.value) || 1 }))} /></div>
                <div><label className="label">Labor (min)</label><input className="input" type="number" value={form.default_labor_minutes} onChange={e => setForm(f => ({ ...f, default_labor_minutes: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label">Labor Rate</label>
                  <select className="input" value={form.default_labor_rate_id} onChange={e => setForm(f => ({ ...f, default_labor_rate_id: e.target.value }))}>
                    <option value="">None</option>
                    {laborRates.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.name} ({fmt(r.rate_per_hour)}/hr)</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Components</label>
                  <button onClick={addComponent} className="btn-ghost btn-xs text-brand-600">+ Add</button>
                </div>
                {components.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No components added yet.</p>
                ) : components.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select className="input flex-1 text-sm" value={c.product_id} onChange={e => updateComponent(idx, 'product_id', Number(e.target.value))}>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.model_number ? ` (${p.model_number})` : ''}</option>)}
                    </select>
                    <input className="input w-20 text-sm" type="number" min="1" value={c.quantity} onChange={e => updateComponent(idx, 'quantity', parseInt(e.target.value) || 1)} />
                    <button onClick={() => removeComponent(idx)} className="text-rose-400 hover:text-rose-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
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
