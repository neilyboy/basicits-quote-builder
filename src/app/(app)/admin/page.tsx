'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats {
  products: number;
  categories: number;
  assemblies: number;
  laborRates: number;
  quotes: number;
  quotesTotal: number;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({ products: 0, categories: 0, assemblies: 0, laborRates: 0, quotes: 0, quotesTotal: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const [products, categories, assemblies, laborRates, quotes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/assemblies').then(r => r.json()),
        fetch('/api/labor-rates').then(r => r.json()),
        fetch('/api/quotes').then(r => r.json()),
      ]);
      setStats({
        products: products.length,
        categories: categories.length,
        assemblies: assemblies.length,
        laborRates: laborRates.length,
        quotes: quotes.length,
        quotesTotal: quotes.reduce((sum: number, q: { total: number }) => sum + (q.total || 0), 0),
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  const cards = [
    { label: 'Products', value: stats.products, href: '/admin/inventory', color: 'bg-blue-500', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Categories', value: stats.categories, href: '/admin/categories', color: 'bg-emerald-500', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { label: 'Assemblies', value: stats.assemblies, href: '/admin/assemblies', color: 'bg-purple-500', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: 'Labor Rates', value: stats.laborRates, href: '/admin/labor-rates', color: 'bg-amber-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Total Quotes', value: stats.quotes, href: '/', color: 'bg-slate-600', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Quotes Value', value: fmt(stats.quotesTotal), href: '/', color: 'bg-green-600', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  const quickLinks = [
    { label: 'Import Products', description: 'Import from URL or CSV', href: '/admin/import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    { label: 'Add Product', description: 'Manually add a product to inventory', href: '/admin/inventory', icon: 'M12 4v16m8-8H4' },
    { label: 'Create Assembly', description: 'Bundle products and labor', href: '/admin/assemblies', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: 'New Quote', description: 'Start a new project quote', href: '/quotes/new', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your quote builder system</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map(card => (
          <Link key={card.label} href={card.href} className="card p-4 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
              </svg>
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map(link => (
            <Link key={link.label} href={link.href} className="card-hover p-5 flex items-start gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-slate-900">{link.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">System Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <dt className="text-slate-500">Application</dt>
            <dd className="font-medium text-slate-900">ScopeForge Quote Builder</dd>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <dt className="text-slate-500">Version</dt>
            <dd className="font-medium text-slate-900">1.0.0</dd>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <dt className="text-slate-500">Database</dt>
            <dd className="font-medium text-slate-900">SQLite</dd>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <dt className="text-slate-500">Framework</dt>
            <dd className="font-medium text-slate-900">Next.js 14</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
