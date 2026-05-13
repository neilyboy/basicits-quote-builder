'use client';

import { useState, useEffect } from 'react';
import { Category } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    const res = await fetch('/api/categories');
    setCategories(await res.json());
  }

  function openNew() { setEditing(null); setName(''); setDescription(''); setShowForm(true); }
  function openEdit(c: Category) { setEditing(c); setName(c.name); setDescription(c.description || ''); setShowForm(true); }

  async function save() {
    if (!name.trim()) return;
    if (editing) {
      await fetch('/api/categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, name, description }) });
    } else {
      await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    }
    setShowForm(false);
    loadCategories();
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category? Products in it will be uncategorized.')) return;
    await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
    loadCategories();
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">Organize your products and assemblies</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add Category</button>
      </div>

      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No categories yet. Create one to organize your products.</div>
        ) : categories.map(c => (
          <div key={c.id} className="card p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-slate-900">{c.name}</h3>
              {c.description && <p className="text-sm text-slate-500">{c.description}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(c)} className="btn-ghost btn-xs">Edit</button>
              <button onClick={() => deleteCategory(c.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Category' : 'New Category'}</h2>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
              <div><label className="label">Description</label><textarea className="input min-h-[60px]" value={description} onChange={e => setDescription(e.target.value)} /></div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={!name.trim()} className="btn-primary flex-1">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
