'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function SitePlannerPage() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [result, setResult] = useState<SitePlanResult | null>(null);
  const [items, setItems] = useState<SitePlanItem[]>([]);
  const [jobName, setJobName] = useState('');
  const [customer, setCustomer] = useState({ name: '', company: '', email: '', phone: '' });
  const [error, setError] = useState('');

  async function parseCsv() {
    if (!csv.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setItems([]);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'siteplan-parse', csv }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
    } else {
      setResult(data);
      setItems((data.items || []).map((i: Omit<SitePlanItem, 'selected'>) => ({ ...i, selected: true })));
      setJobName(data.projectName || '');
    }
    setLoading(false);
  }

  async function createQuote() {
    const selected = items.filter(i => i.selected);
    if (!selected.length || !jobName.trim()) return;
    setCreatingQuote(true);
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'siteplan-confirm',
        job_name: jobName,
        customer_name: customer.name || undefined,
        customer_company: customer.company || undefined,
        customer_email: customer.email || undefined,
        customer_phone: customer.phone || undefined,
        items: selected,
      }),
    });
    const data = await res.json();
    if (data.success) {
      router.push(`/quotes/${data.quote_id}`);
    } else {
      setError(data.error || 'Failed to create quote');
      setCreatingQuote(false);
    }
  }

  const selectedCount = items.filter(i => i.selected).length;
  const notFoundSelected = items.filter(i => i.selected && !i.found).length;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Site Planner Import</h1>
        <p className="text-sm text-slate-500 mt-1">
          In Verkada Site Planner, open your project → <strong>Export → CSV</strong>. Paste the file contents below to create a quote from your bill of materials.
        </p>
      </div>

      {/* CSV input */}
      <div className="card p-5 mb-5">
        <label className="label mb-1">Paste Site Planner CSV Export</label>
        <textarea
          className="input min-h-[160px] font-mono text-xs mb-3"
          placeholder={"Paste your Verkada Site Planner CSV export here...\n\nExpected headers: \"Project Name\",\"Location Name\",\"Plan Name\",\"Product Line\",\"Product Series\",\"Device Name\",\"SKU\",\"Quantity\",\"MSRP\",\"Device ID\""}
          value={csv}
          onChange={e => { setCsv(e.target.value); setResult(null); setItems([]); setError(''); }}
        />
        <button onClick={parseCsv} disabled={loading || !csv.trim()} className="btn-primary">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Parsing...
            </span>
          ) : 'Parse CSV'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 mb-5 text-sm bg-rose-50 text-rose-700 border border-rose-200">
          {error}
        </div>
      )}

      {/* Preview */}
      {result && (
        <>
          {/* Summary banner */}
          <div className="card p-4 mb-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-slate-900 text-lg">{result.projectName || 'Untitled Project'}</h2>
                {result.locationName && <p className="text-sm text-slate-500 mb-2">{result.locationName}</p>}
                <div className="flex gap-1.5 flex-wrap">
                  {result.plans.map(p => (
                    <span key={p} className="badge bg-slate-100 text-slate-600 text-xs">{p}</span>
                  ))}
                </div>
              </div>
              <div className="text-sm space-y-1 text-right">
                <div className="text-slate-500">{result.totalRows} rows → <strong>{items.length} unique SKUs</strong></div>
                <div className="text-emerald-600 font-medium">✓ {result.matchedCount} matched in catalog</div>
                {result.notFoundCount > 0 && (
                  <div className="text-amber-600 font-medium">⚠ {result.notFoundCount} not in catalog (MSRP used)</div>
                )}
              </div>
            </div>
          </div>

          {/* Quote details */}
          <div className="card p-4 mb-4">
            <h3 className="font-semibold text-slate-800 mb-3">Quote Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Job Name *</label>
                <input className="input" value={jobName} onChange={e => setJobName(e.target.value)} placeholder="Required" />
              </div>
              <div>
                <label className="label">Customer Name</label>
                <input className="input" placeholder="Optional" value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Company</label>
                <input className="input" placeholder="Optional" value={customer.company} onChange={e => setCustomer(c => ({ ...c, company: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" placeholder="Optional" value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="Optional" value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* BOM table */}
          <div className="card overflow-hidden mb-4">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Bill of Materials</span>
              <div className="flex gap-1">
                <button onClick={() => setItems(its => its.map(i => ({ ...i, selected: true })))} className="btn-ghost btn-xs">Select All</button>
                <button onClick={() => setItems(its => its.map(i => ({ ...i, selected: false })))} className="btn-ghost btn-xs">Deselect All</button>
              </div>
            </div>
            <div className="max-h-[450px] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Product / Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Plans</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-16">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase w-32">Unit Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.sku} className={`${
                      !item.selected ? 'opacity-40 bg-slate-50' : !item.found ? 'bg-amber-50/40' : ''
                    }`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={item.selected} onChange={e => {
                          const copy = [...items];
                          copy[idx] = { ...copy[idx], selected: e.target.checked };
                          setItems(copy);
                        }} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{item.sku}</td>
                      <td className="px-3 py-2 text-sm max-w-[220px]">
                        {item.found ? (
                          <span className="flex items-center gap-1">
                            <span className="text-emerald-500 font-bold text-xs">✓</span>
                            <span className="text-slate-900 truncate" title={item.product_name || ''}>{item.product_name}</span>
                          </span>
                        ) : (
                          <div>
                            <span className="flex items-center gap-1 text-amber-700">
                              <span className="text-amber-500 font-bold text-xs">⚠</span>
                              <span className="text-xs font-medium">Not in catalog</span>
                            </span>
                            <p className="text-xs text-amber-600">Custom item — MSRP price used</p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 hidden sm:table-cell">{item.plans.join(', ')}</td>
                      <td className="px-3 py-2 text-center text-sm font-semibold text-slate-900">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" step="0.01" min="0"
                          className={`w-24 text-right text-sm border rounded px-2 py-0.5 ${
                            !item.found ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                          }`}
                          value={item.unit_price || ''}
                          onChange={e => {
                            const copy = [...items];
                            copy[idx] = { ...copy[idx], unit_price: parseFloat(e.target.value) || 0 };
                            setItems(copy);
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

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-slate-500">
              <span>{selectedCount} of {items.length} items selected</span>
              {notFoundSelected > 0 && (
                <span className="ml-2 text-amber-600 font-medium">({notFoundSelected} using MSRP price)</span>
              )}
            </div>
            <button
              onClick={createQuote}
              disabled={creatingQuote || !jobName.trim() || selectedCount === 0}
              className="btn-primary"
            >
              {creatingQuote ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating quote...
                </span>
              ) : (
                `Create Quote with ${selectedCount} Items →`
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
