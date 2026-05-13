'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Quote, QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS, QuoteStatus } from '@/types';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'archived', label: 'Archived' },
];

export default function DashboardPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuotes();
  }, [statusFilter, search]);

  async function loadQuotes() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search) params.set('search', search);
    const res = await fetch(`/api/quotes?${params}`);
    const data = await res.json();
    setQuotes(data);
    setLoading(false);
  }

  async function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!data.quote || data.app !== 'ScopeForge') {
        alert('Invalid ScopeForge export file. Please select a previously exported JSON file.');
        e.target.value = '';
        return;
      }
      const res = await fetch(`/api/quotes/${data.quote?.id || 0}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Quote "${result.quote_number}" imported successfully!`);
        loadQuotes();
      } else {
        const err = await res.json();
        alert(`Failed to import: ${err.error || 'Unknown error'}`);
      }
    } catch {
      alert('Invalid JSON file. Please select a ScopeForge export (.json).');
    }
    e.target.value = '';
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your project quotes and proposals</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn-secondary cursor-pointer" title="Import a previously exported ScopeForge quote (.json)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Quote
            <input type="file" accept=".json" className="hidden" onChange={handleImportJson} />
          </label>
          <Link href="/quotes/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Quote
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search quotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quotes Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No quotes found</h3>
          <p className="text-slate-500 mb-4">Get started by creating your first quote.</p>
          <Link href="/quotes/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Quote
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((quote) => (
            <Link key={quote.id} href={`/quotes/${quote.id}`} className="card-hover p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono text-slate-400">{quote.quote_number}</span>
                <span className={`badge ${QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}`}>
                  {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 line-clamp-1">{quote.job_name}</h3>
              {quote.customer_company && (
                <p className="text-sm text-slate-500 mb-1">{quote.customer_company}</p>
              )}
              {quote.customer_name && (
                <p className="text-sm text-slate-400">{quote.customer_name}</p>
              )}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-lg font-bold text-slate-900">{fmt(quote.total)}</span>
                <span className="text-xs text-slate-400">{fmtDate(quote.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
