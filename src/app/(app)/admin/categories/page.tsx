'use client';

import { useState, useEffect } from 'react';
import { Category } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    const res = await fetch('/api/categories');
    setCategories(await res.json());
  }

  function openNew(presetParentId = '') {
    setEditing(null);
    setName('');
    setParentId(presetParentId);
    setShowForm(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setParentId(c.parent_id ? String(c.parent_id) : '');
    setShowForm(true);
  }

  async function save() {
    if (!name.trim()) return;
    const payload = { name, parent_id: parentId ? Number(parentId) : null };
    if (editing) {
      await fetch('/api/categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) });
    } else {
      await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setShowForm(false);
    loadCategories();
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category? Products will be uncategorized. Subcategories will become top-level.')) return;
    await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
    loadCategories();
  }

  const parents = categories.filter(c => !c.parent_id);
  const orphans = categories.filter(c => c.parent_id && !categories.find(p => p.id === c.parent_id));
  const topLevelCats = categories.filter(c => !c.parent_id && c.id !== editing?.id);

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">Organize products with categories and subcategories</p>
        </div>
        <button onClick={() => openNew()} className="btn-primary">+ New Category</button>
      </div>

      <div className="space-y-3">
        {categories.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No categories yet. Create one to organize your products.</div>
        ) : (
          <>
            {parents.map(parent => {
              const subs = categories.filter(c => c.parent_id === parent.id);
              return (
                <div key={parent.id} className="card overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="font-semibold text-slate-900">{parent.name}</span>
                      <span className="text-xs text-slate-400">
                        {subs.length} {subs.length === 1 ? 'subcategory' : 'subcategories'} · {parent.product_count ?? 0} direct products
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openNew(String(parent.id))} className="btn-ghost btn-xs text-brand-600">+ Subcategory</button>
                      <button onClick={() => openEdit(parent)} className="btn-ghost btn-xs">Edit</button>
                      <button onClick={() => deleteCategory(parent.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
                    </div>
                  </div>
                  {subs.length > 0 ? (
                    <div className="divide-y divide-slate-50">
                      {subs.map(sub => (
                        <div key={sub.id} className="px-4 py-3 pl-10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm font-medium text-slate-700">{sub.name}</span>
                            <span className="text-xs text-slate-400">({sub.product_count ?? 0} products)</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(sub)} className="btn-ghost btn-xs">Edit</button>
                            <button onClick={() => deleteCategory(sub.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-2 pl-10 text-xs text-slate-400 italic">No subcategories yet — click "+ Subcategory" to add one</div>
                  )}
                </div>
              );
            })}
            {orphans.map(c => (
              <div key={c.id} className="card p-4 flex items-center justify-between border-amber-200">
                <div>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="ml-2 badge bg-amber-100 text-amber-700 text-[10px]">unassigned</span>
                  <span className="text-xs text-slate-400 ml-2">({c.product_count ?? 0} products)</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="btn-ghost btn-xs">Edit</button>
                  <button onClick={() => deleteCategory(c.id)} className="btn-ghost btn-xs text-rose-500">Delete</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Category' : 'New Category'}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Parent Category</label>
                <select className="input" value={parentId} onChange={e => setParentId(e.target.value)}>
                  <option value="">None (top-level category)</option>
                  {topLevelCats.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Select a parent to nest this as a subcategory, or leave empty for top-level.</p>
              </div>
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
