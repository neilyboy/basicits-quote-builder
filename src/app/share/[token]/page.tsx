'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

interface ShareQuote {
  id: number;
  quote_number: string;
  job_name: string;
  job_description?: string;
  scope_of_work?: string;
  notes?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_company?: string;
  customer_address?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_type: string;
  total: number;
  status: string;
  created_at: string;
  line_items: {
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    multiplier: number;
    line_total: number;
    item_type: string;
    category_name?: string | null;
    notes?: string;
  }[];
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<{ company_name: string; quote: ShareQuote } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => { if (!r.ok) throw new Error('Quote not found'); return r.json(); })
      .then(setData)
      .catch(() => setError('This quote link is invalid or has expired.'));
  }, [token]);

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Quote Not Found</h1>
        <p className="text-slate-500">{error}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const { company_name, quote } = data;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
          <div className="flex items-start justify-between mb-8">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-dark.svg" alt="Logo" className="h-10 mb-3" />
              <p className="text-sm text-slate-500">{company_name}</p>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold text-slate-900">{quote.quote_number}</h1>
              <p className="text-sm text-slate-500">Created {new Date(quote.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">{quote.job_name}</h2>
              {quote.job_description && <p className="text-sm text-slate-500">{quote.job_description}</p>}
            </div>
            <div className="text-right sm:text-right">
              {quote.customer_company && <p className="font-semibold text-slate-900">{quote.customer_company}</p>}
              {quote.customer_name && <p className="text-slate-600">{quote.customer_name}</p>}
              {quote.customer_email && <p className="text-sm text-slate-500">{quote.customer_email}</p>}
              {quote.customer_phone && <p className="text-sm text-slate-500">{quote.customer_phone}</p>}
              {quote.customer_address && <p className="text-sm text-slate-500 mt-1">{quote.customer_address}</p>}
            </div>
          </div>

          {quote.scope_of_work && (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl">
              <h3 className="font-semibold text-slate-900 mb-1">Scope of Work</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.scope_of_work}</p>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <table className="min-w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Item</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Unit Price</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quote.line_items.map(item => (
                <tr key={item.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="badge text-[10px] bg-blue-50 text-blue-700">{item.item_type === 'product' && item.category_name ? item.category_name : item.item_type}</span>
                      <span className="text-sm font-medium text-slate-900">{item.description}</span>
                    </div>
                    {item.multiplier !== 1 && <span className="text-xs text-amber-600">×{item.multiplier} multiplier</span>}
                    {item.notes && <p className="text-xs text-slate-400 mt-0.5">{item.notes}</p>}
                  </td>
                  <td className="px-4 py-4 text-sm text-right text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-4 text-sm text-right text-slate-600">{fmt(item.unit_price)}</td>
                  <td className="px-6 py-4 text-sm text-right font-semibold text-slate-900">{fmt(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
          <div className="flex flex-col items-end gap-3">
            <div className="flex justify-between w-full max-w-xs">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-900">{fmt(quote.subtotal)}</span>
            </div>
            {quote.discount_amount > 0 && (
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-slate-500">Discount{quote.discount_type === 'percent' ? ` (${quote.discount_amount}%)` : ''}</span>
                <span className="font-medium text-rose-600">-{fmt(quote.discount_type === 'percent' ? quote.subtotal * (quote.discount_amount / 100) : quote.discount_amount)}</span>
              </div>
            )}
            {quote.tax_rate > 0 && (
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-slate-500">Tax ({quote.tax_rate}%)</span>
                <span className="font-medium text-slate-900">{fmt(quote.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between w-full max-w-xs pt-3 border-t border-slate-200 mt-1">
              <span className="text-lg font-bold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">{fmt(quote.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
            <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          Generated by ScopeForge Quote Builder · {company_name}
        </div>
      </div>
    </div>
  );
}
