'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Quote, QuoteLineItem, Product, Assembly, LaborRate, Category, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS, QuoteStatus, UNIT_TYPE_LABELS, UnitType } from '@/types';
import { generateQuotePdf } from '@/lib/generatePdf';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function QuoteEditorPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [laborRates, setLaborRates] = useState<LaborRate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'summary'>('items');
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemType, setAddItemType] = useState<'product' | 'assembly' | 'labor' | 'custom'>('product');
  const [itemSearch, setItemSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [editingItem, setEditingItem] = useState<QuoteLineItem | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [suggestionContext, setSuggestionContext] = useState<{
    parentName: string; parentId: number;
    siblingCategories: { id: number; name: string }[];
  } | null>(null);

  const [editForm, setEditForm] = useState({
    job_name: '', job_description: '', scope_of_work: '', notes: '',
    customer_name: '', customer_email: '', customer_phone: '', customer_company: '', customer_address: '',
    tax_rate: 0, discount_amount: 0, discount_type: 'flat' as 'flat' | 'percent',
  });

  const loadQuote = useCallback(async () => {
    const res = await fetch(`/api/quotes/${quoteId}`);
    if (!res.ok) { router.push('/'); return; }
    const data = await res.json();
    setQuote(data);
    setLineItems(data.line_items || []);
    setEditForm({
      job_name: data.job_name || '', job_description: data.job_description || '',
      scope_of_work: data.scope_of_work || '', notes: data.notes || '',
      customer_name: data.customer_name || '', customer_email: data.customer_email || '',
      customer_phone: data.customer_phone || '', customer_company: data.customer_company || '',
      customer_address: data.customer_address || '',
      tax_rate: data.tax_rate || 0, discount_amount: data.discount_amount || 0,
      discount_type: data.discount_type || 'flat',
    });
    setLoading(false);
  }, [quoteId, router]);

  useEffect(() => {
    loadQuote();
    fetch('/api/products').then(r => r.json()).then(setProducts);
    fetch('/api/assemblies').then(r => r.json()).then(setAssemblies);
    fetch('/api/labor-rates').then(r => r.json()).then(setLaborRates);
    fetch('/api/categories').then(r => r.json()).then(setCategories);
  }, [loadQuote]);

  async function saveDetails() {
    setSaving(true);
    await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    await loadQuote();
    setSaving(false);
  }

  async function updateStatus(status: string) {
    await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadQuote();
  }

  async function addLineItem(item: {
    item_type: string; product_id?: number; assembly_id?: number; labor_rate_id?: number;
    description?: string; quantity?: number; unit_price?: number; multiplier?: number;
    labor_minutes?: number; notes?: string; unit_type?: string;
  }, sourceCategoryParentId?: number | null, sourceCategoryId?: number | null) {
    await fetch(`/api/quotes/${quoteId}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    await loadQuote();
    setShowAddItem(false);
    setItemSearch('');
    if (sourceCategoryParentId) {
      const siblings = categories.filter(c => c.parent_id === sourceCategoryParentId && c.id !== sourceCategoryId);
      const parent = categories.find(c => c.id === sourceCategoryParentId);
      if (siblings.length > 0 && parent) {
        setSuggestionContext({ parentName: parent.name, parentId: sourceCategoryParentId, siblingCategories: siblings.map(s => ({ id: s.id, name: s.name })) });
      }
    }
  }

  async function updateLineItem(itemId: number, updates: Record<string, unknown>) {
    await fetch(`/api/quotes/${quoteId}/items`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, ...updates }),
    });
    await loadQuote();
    setEditingItem(null);
  }

  async function removeLineItem(itemId: number) {
    await fetch(`/api/quotes/${quoteId}/items?item_id=${itemId}`, { method: 'DELETE' });
    await loadQuote();
  }

  async function deleteQuote() {
    if (!confirm('Delete this quote permanently?')) return;
    await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
    router.push('/');
  }

  async function exportJson() {
    window.open(`/api/quotes/${quoteId}/export`, '_blank');
    setShowExportMenu(false);
  }

  function exportPdf() {
    if (!quote) return;
    const doc = generateQuotePdf(quote, lineItems);
    doc.save(`quote-${quote.quote_number}.pdf`);
    setShowExportMenu(false);
  }

  // Close export menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function copyShareLink() {
    if (!quote?.share_token) return;
    const url = `${window.location.origin}/share/${quote.share_token}`;
    navigator.clipboard.writeText(url);
    alert('Share link copied to clipboard!');
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = !itemSearch || p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (p.model_number && p.model_number.toLowerCase().includes(itemSearch.toLowerCase()));
    let matchCat = true;
    if (selectedCategory) {
      const catId = Number(selectedCategory);
      const selectedCat = categories.find(c => c.id === catId);
      if (selectedCat && !selectedCat.parent_id) {
        matchCat = p.category_id === catId || p.category_parent_id === catId;
      } else {
        matchCat = p.category_id === catId;
      }
    }
    return matchSearch && matchCat && p.is_active;
  });

  const filteredAssemblies = assemblies.filter(a => {
    return (!itemSearch || a.name.toLowerCase().includes(itemSearch.toLowerCase())) &&
      a.is_active;
  });

  if (loading || !quote) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.push('/')} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-slate-900">{quote.job_name}</h1>
            <span className={`badge ${QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}`}>
              {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
            </span>
          </div>
          <p className="text-sm text-slate-500 ml-8">{quote.quote_number}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={quote.status}
            onChange={e => updateStatus(e.target.value)}
            className="input py-2 w-auto text-sm"
          >
            {Object.entries(QUOTE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button onClick={copyShareLink} className="btn-secondary btn-sm" title="Copy share link">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <div className="relative" ref={exportRef}>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn-secondary btn-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                <button onClick={exportPdf} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export as PDF
                </button>
                <button onClick={exportJson} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Export as JSON
                </button>
              </div>
            )}
          </div>
          <button onClick={deleteQuote} className="btn-danger btn-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['details', 'items', 'summary'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'details' ? 'Details' : tab === 'items' ? 'Line Items' : 'Summary'}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Job Information</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Job Name *</label>
                <input className="input" value={editForm.job_name} onChange={e => setEditForm(f => ({ ...f, job_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[80px]" value={editForm.job_description} onChange={e => setEditForm(f => ({ ...f, job_description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Scope of Work</label>
                <textarea className="input min-h-[120px]" value={editForm.scope_of_work} onChange={e => setEditForm(f => ({ ...f, scope_of_work: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Customer</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Name</label><input className="input" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
              <div><label className="label">Company</label><input className="input" value={editForm.customer_company} onChange={e => setEditForm(f => ({ ...f, customer_company: e.target.value }))} /></div>
              <div><label className="label">Email</label><input className="input" value={editForm.customer_email} onChange={e => setEditForm(f => ({ ...f, customer_email: e.target.value }))} /></div>
              <div><label className="label">Phone</label><input className="input" value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} /></div>
              <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={editForm.customer_address} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} /></div>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Pricing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className="label">Tax Rate (%)</label><input className="input" type="number" step="0.01" value={editForm.tax_rate || ''} onChange={e => setEditForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))} /></div>
              <div><label className="label">Discount</label><input className="input" type="number" step="0.01" value={editForm.discount_amount || ''} onChange={e => setEditForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || 0 }))} /></div>
              <div><label className="label">Discount Type</label><select className="input" value={editForm.discount_type} onChange={e => setEditForm(f => ({ ...f, discount_type: e.target.value as 'flat' | 'percent' }))}><option value="flat">Flat ($)</option><option value="percent">Percent (%)</option></select></div>
            </div>
            <div className="mt-4"><label className="label">Notes</label><textarea className="input min-h-[80px]" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveDetails} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Details'}</button>
          </div>
        </div>
      )}

      {/* Line Items Tab */}
      {activeTab === 'items' && (
        <div>
          {suggestionContext && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-blue-700">💡 Add related {suggestionContext.parentName} items:</span>
                {suggestionContext.siblingCategories.map(cat => (
                  <button key={cat.id} onClick={() => { setSelectedCategory(String(cat.id)); setShowAddItem(true); setSuggestionContext(null); }}
                    className="text-xs font-medium px-2.5 py-1 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                    {cat.name} →
                  </button>
                ))}
              </div>
              <button onClick={() => setSuggestionContext(null)} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Line Items ({lineItems.length})</h2>
            <button onClick={() => setShowAddItem(true)} className="btn-primary btn-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>

          {lineItems.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-500 mb-4">No line items yet. Add products, assemblies, or custom items.</p>
              <button onClick={() => setShowAddItem(true)} className="btn-primary">Add First Item</button>
            </div>
          ) : (
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge text-[10px] ${
                          item.item_type === 'product' ? 'bg-blue-100 text-blue-700' :
                          item.item_type === 'assembly' ? 'bg-purple-100 text-purple-700' :
                          item.item_type === 'labor' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>{item.item_type === 'product' && item.category_name ? item.category_name : item.item_type}</span>
                        <span className="font-medium text-slate-900 truncate">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>{item.quantity} × {fmt(item.unit_price)}</span>
                        {item.multiplier !== 1 && <span className="text-amber-600">×{item.multiplier} multiplier</span>}
                        {item.notes && <span className="italic truncate max-w-[200px]">{item.notes}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-bold text-slate-900">{fmt(item.line_total)}</span>
                      <button onClick={() => setEditingItem(item)} className="btn-ghost btn-xs">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => removeLineItem(item.id)} className="btn-ghost btn-xs text-rose-500 hover:text-rose-700">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="card p-4 mt-4">
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex justify-between w-full max-w-xs"><span className="text-slate-500">Subtotal</span><span className="font-medium">{fmt(quote.subtotal)}</span></div>
              {quote.discount_amount > 0 && <div className="flex justify-between w-full max-w-xs"><span className="text-slate-500">Discount</span><span className="font-medium text-rose-600">-{fmt(quote.discount_type === 'percent' ? quote.subtotal * (quote.discount_amount / 100) : quote.discount_amount)}</span></div>}
              {quote.tax_rate > 0 && <div className="flex justify-between w-full max-w-xs"><span className="text-slate-500">Tax ({quote.tax_rate}%)</span><span className="font-medium">{fmt(quote.tax_amount)}</span></div>}
              <div className="flex justify-between w-full max-w-xs pt-2 border-t border-slate-200 mt-1"><span className="font-semibold text-slate-900">Total</span><span className="text-xl font-bold text-slate-900">{fmt(quote.total)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start gap-6 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-dark.svg" alt="Logo" className="h-12" />
              <div>
                <h2 className="text-xl font-bold">{quote.quote_number}</h2>
                <p className="text-sm text-slate-500">Created {new Date(quote.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            {quote.customer_company && <p className="font-semibold text-lg">{quote.customer_company}</p>}
            {quote.customer_name && <p className="text-slate-600">{quote.customer_name}</p>}
            {quote.customer_email && <p className="text-slate-500 text-sm">{quote.customer_email}</p>}
            {quote.customer_phone && <p className="text-slate-500 text-sm">{quote.customer_phone}</p>}
            {quote.customer_address && <p className="text-slate-500 text-sm mt-1">{quote.customer_address}</p>}
          </div>
          {quote.scope_of_work && (
            <div className="card p-6">
              <h3 className="font-semibold mb-2">Scope of Work</h3>
              <p className="text-slate-600 whitespace-pre-wrap">{quote.scope_of_work}</p>
            </div>
          )}
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Item</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Unit Price</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Total</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center gap-2">
                        <span className="badge text-[10px] bg-blue-50 text-blue-700">{item.item_type === 'product' && item.category_name ? item.category_name : item.item_type}</span>
                        <span>{item.description}</span>
                      </span>
                      {item.multiplier !== 1 && <span className="text-amber-600 ml-1">(×{item.multiplier})</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-right">{fmt(item.unit_price)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{fmt(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card p-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex justify-between w-64"><span>Subtotal</span><span className="font-medium">{fmt(quote.subtotal)}</span></div>
              {quote.discount_amount > 0 && <div className="flex justify-between w-64"><span>Discount</span><span className="text-rose-600">-{fmt(quote.discount_type === 'percent' ? quote.subtotal * (quote.discount_amount / 100) : quote.discount_amount)}</span></div>}
              {quote.tax_rate > 0 && <div className="flex justify-between w-64"><span>Tax ({quote.tax_rate}%)</span><span>{fmt(quote.tax_amount)}</span></div>}
              <div className="flex justify-between w-64 pt-2 border-t border-slate-200"><span className="font-bold text-lg">Total</span><span className="font-bold text-lg">{fmt(quote.total)}</span></div>
            </div>
          </div>
          {quote.notes && <div className="card p-6"><h3 className="font-semibold mb-2">Notes</h3><p className="text-slate-600 whitespace-pre-wrap">{quote.notes}</p></div>}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 mb-10">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold">Add Line Item</h2>
              <button onClick={() => { setShowAddItem(false); setItemSearch(''); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Type selector */}
            <div className="flex gap-1 p-4 border-b border-slate-100">
              {(['product', 'assembly', 'labor', 'custom'] as const).map(t => (
                <button key={t} onClick={() => { setAddItemType(t); setItemSearch(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${addItemType === t ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {addItemType === 'product' && (
                <>
                  <div className="flex gap-2 mb-3">
                    <input className="input flex-1" placeholder="Search products..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} autoFocus />
                    <select className="input w-auto" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                      <option value="">All Categories</option>
                      {(() => {
                        const parents = categories.filter(c => !c.parent_id);
                        const flat = categories.filter(c => !c.parent_id && !categories.some(s => s.parent_id === c.id));
                        const withSubs = parents.filter(p => categories.some(c => c.parent_id === p.id));
                        return [
                          ...withSubs.map(parent => (
                            <optgroup key={parent.id} label={parent.name}>
                              <option value={parent.id}>— {parent.name} (all)</option>
                              {categories.filter(c => c.parent_id === parent.id).map(sub => (
                                <option key={sub.id} value={sub.id}>  {sub.name}</option>
                              ))}
                            </optgroup>
                          )),
                          ...flat.map(c => <option key={c.id} value={c.id}>{c.name}</option>),
                        ];
                      })()}
                    </select>
                  </div>
                  <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                    {filteredProducts.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No products found. Add products in Admin → Inventory.</p> :
                    filteredProducts.map(p => (
                      <button key={p.id} onClick={() => addLineItem({ item_type: 'product', product_id: p.id, quantity: 1 }, p.category_parent_id, p.category_id)}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-slate-900">{p.name}</span>
                            {p.model_number && <span className="ml-2 text-xs text-slate-400">{p.model_number}</span>}
                            {p.category_name && <span className="ml-2 badge bg-slate-100 text-slate-600 text-[10px]">{p.category_name}</span>}
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-slate-900">{fmt(p.unit_price)}</span>
                            <span className="text-xs text-slate-400 ml-1">/ {UNIT_TYPE_LABELS[p.unit_type as UnitType] || p.unit_type}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {addItemType === 'assembly' && (
                <>
                  <input className="input mb-3" placeholder="Search assemblies..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} autoFocus />
                  <div className="space-y-1">
                    {filteredAssemblies.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No assemblies found. Create them in Admin → Assemblies.</p> :
                    filteredAssemblies.map(a => (
                      <button key={a.id} onClick={() => addLineItem({ item_type: 'assembly', assembly_id: a.id, quantity: 1, labor_rate_id: a.default_labor_rate_id || undefined, labor_minutes: a.default_labor_minutes, multiplier: a.default_multiplier })}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200">
                        <span className="font-medium text-slate-900">{a.name}</span>
                        {a.description && <p className="text-sm text-slate-500 mt-0.5">{a.description}</p>}
                        <div className="text-xs text-slate-400 mt-1">
                          {(a.components || []).length} components · {a.default_labor_minutes}min labor · ×{a.default_multiplier} multiplier
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {addItemType === 'labor' && (
                <div className="space-y-1">
                  {laborRates.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No labor rates defined. Add them in Admin → Labor Rates.</p> :
                  laborRates.filter(r => r.is_active).map(r => (
                    <button key={r.id} onClick={() => addLineItem({ item_type: 'labor', labor_rate_id: r.id, labor_minutes: 60, quantity: 1 })}
                      className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200">
                      <div className="flex justify-between">
                        <span className="font-medium">{r.name}</span>
                        <span className="font-semibold">{fmt(r.rate_per_hour)}/hr</span>
                      </div>
                      {r.description && <p className="text-sm text-slate-500">{r.description}</p>}
                    </button>
                  ))}
                </div>
              )}

              {addItemType === 'custom' && (
                <CustomItemForm onAdd={(item) => addLineItem({ item_type: 'custom', ...item })} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">Edit Line Item</h2>
            <EditItemForm item={editingItem} laborRates={laborRates} onSave={(updates) => updateLineItem(editingItem.id, updates)} onCancel={() => setEditingItem(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomItemForm({ onAdd }: { onAdd: (item: { description: string; quantity: number; unit_price: number; notes?: string }) => void }) {
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-3">
      <div><label className="label">Description *</label><input className="input" value={desc} onChange={e => setDesc(e.target.value)} autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Quantity</label><input className="input" type="number" step="0.01" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 1)} /></div>
        <div><label className="label">Unit Price ($)</label><input className="input" type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} /></div>
      </div>
      <div><label className="label">Notes</label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <button onClick={() => { if (desc) onAdd({ description: desc, quantity: qty, unit_price: price, notes: notes || undefined }); }} disabled={!desc} className="btn-primary w-full">Add Custom Item</button>
    </div>
  );
}

function EditItemForm({ item, laborRates, onSave, onCancel }: {
  item: QuoteLineItem; laborRates: LaborRate[];
  onSave: (u: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [qty, setQty] = useState(item.quantity);
  const [price, setPrice] = useState(item.unit_price);
  const [mult, setMult] = useState(item.multiplier);
  const [desc, setDesc] = useState(item.description || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [laborMin, setLaborMin] = useState(item.labor_minutes);

  return (
    <div className="space-y-3">
      <div><label className="label">Description</label><input className="input" value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Quantity</label><input className="input" type="number" step="0.01" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 1)} /></div>
        <div><label className="label">Unit Price</label><input className="input" type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} /></div>
        <div><label className="label">Multiplier</label><input className="input" type="number" step="0.01" value={mult} onChange={e => setMult(parseFloat(e.target.value) || 1)} /></div>
      </div>
      {(item.item_type === 'assembly' || item.item_type === 'labor') && (
        <div><label className="label">Labor Minutes</label><input className="input" type="number" value={laborMin} onChange={e => setLaborMin(parseFloat(e.target.value) || 0)} /></div>
      )}
      <div><label className="label">Notes</label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <p className="text-sm text-slate-500">Line Total: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price * qty * mult)}</strong></p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button onClick={() => onSave({ quantity: qty, unit_price: price, multiplier: mult, description: desc, notes, labor_minutes: laborMin })} className="btn-primary flex-1">Save</button>
      </div>
    </div>
  );
}
