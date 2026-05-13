'use client';

import { useState, useEffect } from 'react';
import { Product, Category, UNIT_TYPE_LABELS, UnitType } from '@/types';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', model_number: '', unit_price: 0, unit_type: 'each', quantity_per_unit: 1, category_id: '', description: '' });

  useEffect(() => {
    loadProducts();
    fetch('/api/categories').then(r => r.json()).then(setCategories);
  }, []);

  async function loadProducts() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (catFilter) params.set('category_id', catFilter);
    const res = await fetch(`/api/products?${params}`);
    setProducts(await res.json());
  }

  useEffect(() => { loadProducts(); }, [search, catFilter]);

  function openNew() {
    setEditing(null);
    setForm({ name: '', model_number: '', unit_price: 0, unit_type: 'each', quantity_per_unit: 1, category_id: '', description: '' });
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, model_number: p.model_number || '', unit_price: p.unit_price, unit_type: p.unit_type, quantity_per_unit: p.quantity_per_unit, category_id: p.category_id ? String(p.category_id) : '', description: p.description || '' });
    setShowForm(true);
  }

  async function saveProduct() {
    const payload = { ...form, unit_price: Number(form.unit_price), quantity_per_unit: Number(form.quantity_per_unit), category_id: form.category_id ? Number(form.category_id) : null };
    if (editing) {
      await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editing.id }) });
    } else {
      await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setShowForm(false);
    loadProducts();
  }

  async function deleteProduct(id: number) {
    if (!confirm('Delete this product?')) return;
    await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
    loadProducts();
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Manage products and pricing</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add Product</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input className="input flex-1" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-auto" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50"><tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Product</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Category</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Price</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Unit</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase w-24">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No products found</td></tr>
            ) : products.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{p.name}</div>
                  {p.model_number && <div className="text-xs text-slate-400">{p.model_number}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{p.category_name || '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(p.unit_price)}</td>
                <td className="px-4 py-3 text-right text-sm text-slate-500">{UNIT_TYPE_LABELS[p.unit_type as UnitType] || p.unit_type}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(p)} className="btn-ghost btn-xs mr-1">Edit</button>
                  <button onClick={() => deleteProduct(p.id)} className="btn-ghost btn-xs text-rose-500">Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Product' : 'Add Product'}</h2>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label">Model Number</label><input className="input" value={form.model_number} onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Unit Price ($)</label><input className="input" type="number" step="0.01" value={form.unit_price || ''} onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))} /></div>
                <div><label className="label">Unit Type</label><select className="input" value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}>{Object.entries(UNIT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Qty Per Unit</label><input className="input" type="number" value={form.quantity_per_unit} onChange={e => setForm(f => ({ ...f, quantity_per_unit: parseInt(e.target.value) || 1 }))} /></div>
                <div><label className="label">Category</label><select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}><option value="">None</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              <div><label className="label">Description</label><textarea className="input min-h-[60px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveProduct} disabled={!form.name} className="btn-primary flex-1">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
