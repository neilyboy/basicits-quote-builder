'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Category } from '@/types';

interface SitePlanItem {
  sku: string;
  quantity: number;
  msrp: number;
  plans: string[];
  found: boolean;
  product_id: number | null;
  product_name: string | null;
  unit_price: number;
  unit_type: string;
  selected: boolean;
}

interface SitePlanResult {
  projectName: string;
  locationName: string;
  plans: string[];
  totalRows: number;
  matchedCount: number;
  notFoundCount: number;
}

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
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<'url' | 'csv' | 'siteplan'>('url');
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

  const [sitePlanCsv, setSitePlanCsv] = useState('');
  const [sitePlanResult, setSitePlanResult] = useState<SitePlanResult | null>(null);
  const [sitePlanItems, setSitePlanItems] = useState<SitePlanItem[]>([]);
  const [sitePlanJobName, setSitePlanJobName] = useState('');
  const [sitePlanCustomer, setSitePlanCustomer] = useState({ name: '', company: '', email: '', phone: '' });
  const [creatingQuote, setCreatingQuote] = useState(false);

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

  async function parseSitePlan() {
    if (!sitePlanCsv.trim()) return;
    setLoading(true);
    setResult('');
    setSitePlanResult(null);
    setSitePlanItems([]);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'siteplan-parse', csv: sitePlanCsv }),
    });
    const data = await res.json();
    if (data.error) {
      setResult(`Error: ${data.error}`);
    } else {
      setSitePlanResult(data);
      setSitePlanItems((data.items || []).map((i: Omit<SitePlanItem, 'selected'>) => ({ ...i, selected: true })));
      setSitePlanJobName(data.projectName || '');
    }
    setLoading(false);
  }

  async function createQuoteFromSitePlan() {
    const selected = sitePlanItems.filter(i => i.selected);
    if (!selected.length || !sitePlanJobName.trim()) return;
    setCreatingQuote(true);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'siteplan-confirm',
        job_name: sitePlanJobName,
        customer_name: sitePlanCustomer.name || undefined,
        customer_company: sitePlanCustomer.company || undefined,
        customer_email: sitePlanCustomer.email || undefined,
        customer_phone: sitePlanCustomer.phone || undefined,
        items: selected,
      }),
    });
    const data = await res.json();
    if (data.success) {
      router.push(`/quotes/${data.quote_id}`);
    } else {
      setResult(`Error: ${data.error}`);
      setCreatingQuote(false);
    }
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
        <button onClick={() => setTab('siteplan')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === 'siteplan' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
          Site Planner
        </button>
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

      {/* Site Planner Tab */}
      {tab === 'siteplan' && (
        <div className="card p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Verkada Site Planner Import</h2>
              <p className="text-sm text-slate-500">In Verkada Site Planner, open your project → Export → CSV. Paste the file contents below. SKUs are matched against your catalog and quantities aggregated. A new draft quote is created automatically.</p>
            </div>
          </div>
          <textarea
            className="input min-h-[160px] font-mono text-xs mb-3"
            placeholder={'Paste your Verkada Site Planner CSV export here...\n\nExpected headers: "Project Name","Location Name","Plan Name","Product Line","Product Series","Device Name","SKU","Quantity","MSRP","Device ID"'}
            value={sitePlanCsv}
            onChange={e => { setSitePlanCsv(e.target.value); setSitePlanResult(null); setSitePlanItems([]); setResult(''); }}
          />
          <button onClick={parseSitePlan} disabled={loading || !sitePlanCsv.trim()} className="btn-primary">
            {loading ? 'Parsing...' : 'Parse Site Plan CSV'}
          </button>
        </div>
      )}

      {/* Site Planner Preview */}
      {tab === 'siteplan' && sitePlanResult && (
        <>
          {/* Summary */}
          <div className="card p-4 mb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">{sitePlanResult.projectName || 'Untitled Project'}</h3>
                {sitePlanResult.locationName && <p className="text-sm text-slate-500 mb-2">{sitePlanResult.locationName}</p>}
                <div className="flex gap-1.5 flex-wrap">
                  {sitePlanResult.plans.map(p => (
                    <span key={p} className="badge bg-slate-100 text-slate-600 text-xs">{p}</span>
                  ))}
                </div>
              </div>
              <div className="text-sm space-y-1 text-right">
                <div className="text-slate-500">{sitePlanResult.totalRows} rows → <strong>{sitePlanItems.length} unique SKUs</strong></div>
                <div className="text-emerald-600 font-medium">✓ {sitePlanResult.matchedCount} matched in catalog</div>
                {sitePlanResult.notFoundCount > 0 && (
                  <div className="text-amber-600 font-medium">⚠ {sitePlanResult.notFoundCount} not in catalog (MSRP used)</div>
                )}
              </div>
            </div>
          </div>

          {/* Quote details form */}
          <div className="card p-4 mb-4">
            <h3 className="font-semibold text-slate-800 mb-3">Quote Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Job Name *</label>
                <input className="input" value={sitePlanJobName} onChange={e => setSitePlanJobName(e.target.value)} placeholder="Required" />
              </div>
              <div>
                <label className="label">Customer Name</label>
                <input className="input" placeholder="Optional" value={sitePlanCustomer.name} onChange={e => setSitePlanCustomer(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Company</label>
                <input className="input" placeholder="Optional" value={sitePlanCustomer.company} onChange={e => setSitePlanCustomer(c => ({ ...c, company: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" placeholder="Optional" value={sitePlanCustomer.email} onChange={e => setSitePlanCustomer(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="Optional" value={sitePlanCustomer.phone} onChange={e => setSitePlanCustomer(c => ({ ...c, phone: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* BOM table */}
          <div className="card overflow-hidden mb-4">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Bill of Materials Preview</span>
              <div className="flex gap-1">
                <button onClick={() => setSitePlanItems(its => its.map(i => ({ ...i, selected: true })))} className="btn-ghost btn-xs">Select All</button>
                <button onClick={() => setSitePlanItems(its => its.map(i => ({ ...i, selected: false })))} className="btn-ghost btn-xs">Deselect All</button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Product / Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Plans</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-16">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase w-32">Unit Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sitePlanItems.map((item, idx) => (
                    <tr key={item.sku} className={`${
                      !item.selected ? 'opacity-40 bg-slate-50' :
                      !item.found ? 'bg-amber-50/40' : ''
                    }`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={item.selected} onChange={e => {
                          const copy = [...sitePlanItems];
                          copy[idx] = { ...copy[idx], selected: e.target.checked };
                          setSitePlanItems(copy);
                        }} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{item.sku}</td>
                      <td className="px-3 py-2 text-sm max-w-[260px]">
                        {item.found ? (
                          <div>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-emerald-500 font-bold text-xs">✓</span>
                              <span className="text-slate-900 font-medium truncate block max-w-[240px]" title={item.product_name || ''}>{item.product_name}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <span className="text-amber-500 font-bold text-xs">⚠</span>
                              <span className="text-xs font-medium">Not in catalog</span>
                            </span>
                            <p className="text-xs text-amber-600">Will be added as custom item using MSRP</p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{item.plans.join(', ')}</td>
                      <td className="px-3 py-2 text-center text-sm font-semibold text-slate-900">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" step="0.01" min="0"
                          className={`w-24 text-right text-sm border rounded px-2 py-0.5 ${
                            !item.found ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                          }`}
                          value={item.unit_price || ''}
                          onChange={e => {
                            const copy = [...sitePlanItems];
                            copy[idx] = { ...copy[idx], unit_price: parseFloat(e.target.value) || 0 };
                            setSitePlanItems(copy);
                          }}
                          title={!item.found ? 'From Site Planner MSRP — editable' : 'From product catalog — editable'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-slate-500 space-x-2">
              <span>{sitePlanItems.filter(i => i.selected).length} of {sitePlanItems.length} SKUs selected</span>
              {sitePlanItems.filter(i => i.selected && !i.found).length > 0 && (
                <span className="text-amber-600 font-medium">
                  ({sitePlanItems.filter(i => i.selected && !i.found).length} will use MSRP price)
                </span>
              )}
            </div>
            <button
              onClick={createQuoteFromSitePlan}
              disabled={creatingQuote || !sitePlanJobName.trim() || sitePlanItems.filter(i => i.selected).length === 0}
              className="btn-primary"
            >
              {creatingQuote ? (
                <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating quote...</span>
              ) : (
                `Create Quote with ${sitePlanItems.filter(i => i.selected).length} Items →`
              )}
            </button>
          </div>
        </>
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
