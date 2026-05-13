'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewQuotePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    job_name: '',
    job_description: '',
    scope_of_work: '',
    notes: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_company: '',
    customer_address: '',
    tax_rate: 0,
  });

  const update = (field: string, value: string | number) => setForm(f => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.job_name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/quotes/${data.id}`);
    }
    setSaving(false);
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Quote</h1>
        <p className="text-sm text-slate-500 mt-1">Fill in the details to create a new quote</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job Information */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Job Information</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Job / Project Name *</label>
              <input className="input" placeholder="e.g., Office Camera Installation" value={form.job_name} onChange={e => update('job_name', e.target.value)} required />
            </div>
            <div>
              <label className="label">Job Description</label>
              <textarea className="input min-h-[80px]" placeholder="Brief description of the project..." value={form.job_description} onChange={e => update('job_description', e.target.value)} />
            </div>
            <div>
              <label className="label">Scope of Work</label>
              <textarea className="input min-h-[120px]" placeholder="Detailed scope of work for this project..." value={form.scope_of_work} onChange={e => update('scope_of_work', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Customer Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Name</label>
              <input className="input" placeholder="John Smith" value={form.customer_name} onChange={e => update('customer_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Company</label>
              <input className="input" placeholder="Acme Corp" value={form.customer_company} onChange={e => update('customer_company', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="john@acme.com" value={form.customer_email} onChange={e => update('customer_email', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" type="tel" placeholder="(555) 123-4567" value={form.customer_phone} onChange={e => update('customer_phone', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" placeholder="123 Main St, City, State ZIP" value={form.customer_address} onChange={e => update('customer_address', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quote Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Tax Rate (%)</label>
              <input className="input" type="number" step="0.01" min="0" max="100" placeholder="0" value={form.tax_rate || ''} onChange={e => update('tax_rate', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Notes</label>
            <textarea className="input min-h-[80px]" placeholder="Internal notes about this quote..." value={form.notes} onChange={e => update('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => router.push('/')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving || !form.job_name.trim()} className="btn-primary">
            {saving ? 'Creating...' : 'Create Quote'}
          </button>
        </div>
      </form>
    </div>
  );
}
