'use client';

import { useState, useEffect } from 'react';
import { Category } from '@/types';

interface ImportItem {
  name: string;
  model_number: string;
  price: number;
  category_suggestion: string;
  description: string;
  category_id?: number;
  selected?: boolean;
}

export default function ImportPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<'url' | 'csv'>('url');
  const [url, setUrl] = useState('');
  const [csvData, setCsvData] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string>('');
  const [excludePattern, setExcludePattern] = useState('');
  const [filterText, setFilterText] = useState('');
  const [onlyWithPrice, setOnlyWithPrice] = useState(false);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(setCategories);
  }, []);

  async function fetchUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setResult('');
    setItems([]);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url', url }),
    });
    const data = await res.json();
    if (data.error) { setResult(`Error: ${data.error}`); }
    else { setItems((data.items || []).map((i: ImportItem) => ({ ...i, selected: true }))); }
    setLoading(false);
  }

  async function parseCsv() {
    if (!csvData.trim()) return;
    setLoading(true);
    setResult('');
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'csv', data: csvData, category_id: defaultCategoryId ? Number(defaultCategoryId) : undefined }),
    });
    const data = await res.json();
    if (data.error) { setResult(`Error: ${data.error}`); }
    else { setItems((data.items || []).map((i: ImportItem) => ({ ...i, selected: true }))); }
    setLoading(false);
  }

  async function confirmImport() {
    const selected = visibleItems.filter(i => i.selected).map(i => ({
      name: i.name,
      model_number: i.model_number,
      price: i.price,
      description: i.description,
      category_suggestion: i.category_suggestion,
      category_id: i.category_id || (defaultCategoryId ? Number(defaultCategoryId) : undefined),
      unit_type: 'each',
      quantity_per_unit: 1,
    }));
    if (selected.length === 0) { setResult('No items selected'); return; }
    setImporting(true);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'confirm', items: selected }),
    });
    const data = await res.json();
    if (data.success) {
      const catMsg = data.categoriesCreated ? ` (${data.categoriesCreated} categories auto-created)` : '';
      setResult(`Successfully imported ${data.imported} products!${catMsg}`);
      setItems([]);
    }
    else { setResult(`Error: ${data.error}`); }
    setImporting(false);
  }

  async function migrateHierarchy() {
    setLoading(true);
    setResult('');
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'migrate-hierarchy' }),
    });
    const data = await res.json();
    if (data.success) {
      setResult(`Migrated ${data.updated} products into subcategory hierarchy! ${data.categoriesCreated} new categories created. (${data.skipped} products had unrecognized categories and were left unchanged.)`);
    } else {
      setResult(`Error: ${data.error}`);
    }
    setLoading(false);
  }

  async function recategorizeExisting() {
    const verkadaUrl = 'https://www.verkada.com/pricing/';
    setLoading(true);
    setResult('');
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recategorize', url: verkadaUrl }),
    });
    const data = await res.json();
    if (data.success) {
      setResult(`Re-categorized ${data.updated} of ${data.totalProducts} products! ${data.categoriesCreated} new categories created.`);
    } else {
      setResult(`Error: ${data.error}`);
    }
    setLoading(false);
  }

  function applyExclude() {
    if (!excludePattern.trim()) return;
    const patterns = excludePattern.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    setItems(items.map(item => {
      const text = `${item.name} ${item.model_number}`.toLowerCase();
      const matches = patterns.some(p => text.includes(p));
      return matches ? { ...item, selected: false } : item;
    }));
    setResult(`Deselected items matching: ${patterns.join(', ')}`);
  }

  function removeDeselected() {
    setItems(items.filter(i => i.selected));
  }

  function updateItemPrice(idx: number, price: number) {
    const copy = [...items];
    copy[idx] = { ...copy[idx], price };
    setItems(copy);
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  // Filter visible items
  const visibleItems = items.filter(item => {
    if (filterText) {
      const text = `${item.name} ${item.model_number}`.toLowerCase();
      if (!text.includes(filterText.toLowerCase())) return false;
    }
    if (onlyWithPrice && item.price === 0) return false;
    return true;
  });

  const selectedCount = visibleItems.filter(i => i.selected).length;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Products</h1>
        <p className="text-sm text-slate-500">Import products from a URL or CSV data</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 mb-6">
        <button onClick={() => setTab('url')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'url' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>From URL</button>
        <button onClick={() => setTab('csv')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'csv' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>From CSV</button>
      </div>

      {/* URL Import */}
      {tab === 'url' && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-3">Fetch from URL</h2>
          <p className="text-sm text-slate-500 mb-3">Enter a URL to a product page (e.g., Verkada pricing). The system will attempt to extract product names and prices.</p>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="https://www.verkada.com/security-cameras/pricing/" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUrl()} />
            <button onClick={fetchUrl} disabled={loading || !url.trim()} className="btn-primary">{loading ? 'Fetching...' : 'Fetch'}</button>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Migrate to subcategory hierarchy</p>
              <p className="text-xs text-slate-400 mb-2">Splits your existing flat categories (Camera, Access Control, etc.) into parent + subcategories (Video Security › Cameras, Camera Licenses, Camera Accessories). Run this once after updating.</p>
              <button onClick={migrateHierarchy} disabled={loading} className="btn-primary text-sm">
                {loading ? 'Processing...' : '⚡ Migrate Existing Products to Hierarchy'}
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Re-categorize from Verkada (requires internet)</p>
              <p className="text-xs text-slate-400 mb-2">Re-fetches the Verkada pricing page and maps products by SKU.</p>
              <button onClick={recategorizeExisting} disabled={loading} className="btn-secondary text-sm">
                {loading ? 'Processing...' : 'Re-categorize Existing Products from Verkada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import */}
      {tab === 'csv' && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-3">Paste CSV Data</h2>
          <p className="text-sm text-slate-500 mb-3">Paste CSV data with headers. Expected columns: name, model_number, price, description, category</p>
          <textarea className="input min-h-[150px] font-mono text-sm mb-3" placeholder="name,model_number,price,description&#10;Camera X1,CX-100,299.99,Indoor dome camera" value={csvData} onChange={e => setCsvData(e.target.value)} />
          <button onClick={parseCsv} disabled={loading || !csvData.trim()} className="btn-primary">{loading ? 'Parsing...' : 'Parse CSV'}</button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={`rounded-lg p-3 mb-4 text-sm ${result.startsWith('Error') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {result}
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="card p-4 mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Category:</label>
              <select className="input w-auto text-sm" value={defaultCategoryId} onChange={e => setDefaultCategoryId(e.target.value)}>
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-1 ml-auto">
                <button onClick={() => setItems(items.map(i => ({ ...i, selected: true })))} className="btn-ghost btn-xs">Select All</button>
                <button onClick={() => setItems(items.map(i => ({ ...i, selected: false })))} className="btn-ghost btn-xs">Deselect All</button>
                <button onClick={removeDeselected} className="btn-ghost btn-xs text-rose-500">Remove Deselected</button>
              </div>
            </div>

            {/* Exclude pattern */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Exclude containing:</label>
              <input className="input flex-1 text-sm" placeholder="e.g. datasheet, pdf, spec (comma-separated)" value={excludePattern} onChange={e => setExcludePattern(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyExclude()} />
              <button onClick={applyExclude} className="btn-secondary text-sm px-3 py-1.5">Apply</button>
            </div>

            {/* Filter/search */}
            <div className="flex items-center gap-3">
              <input className="input flex-1 text-sm" placeholder="Filter items by name/model..." value={filterText} onChange={e => setFilterText(e.target.value)} />
              <label className="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
                <input type="checkbox" checked={onlyWithPrice} onChange={e => setOnlyWithPrice(e.target.checked)} />
                Only with price
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden mb-4">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0"><tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Name / Description</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Category</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase w-28">Price</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((item, idx) => (
                    <tr key={idx} className={item.selected ? 'hover:bg-slate-50' : 'opacity-40 bg-slate-50'}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={item.selected || false} onChange={e => {
                          const realIdx = items.indexOf(item);
                          const copy = [...items]; copy[realIdx] = { ...copy[realIdx], selected: e.target.checked }; setItems(copy);
                        }} />
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-slate-900 max-w-[300px] truncate" title={item.name}>{item.name}</td>
                      <td className="px-3 py-2 text-sm text-slate-500 font-mono whitespace-nowrap">{item.model_number || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-400 max-w-[150px] truncate" title={item.category_suggestion}>{item.category_suggestion || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" min="0" className="w-24 text-right text-sm border border-slate-200 rounded px-2 py-0.5" value={item.price || ''} onChange={e => {
                          const realIdx = items.indexOf(item);
                          updateItemPrice(realIdx, parseFloat(e.target.value) || 0);
                        }} placeholder="0.00" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{selectedCount} of {visibleItems.length} selected ({items.length} total)</span>
            <button onClick={confirmImport} disabled={importing || selectedCount === 0} className="btn-primary">
              {importing ? 'Importing...' : `Import ${selectedCount} Products`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
