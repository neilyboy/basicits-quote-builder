import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(params.id);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const line_items = db.prepare(`
    SELECT li.*,
      p.name as product_name, p.model_number as product_model,
      a.name as assembly_name,
      lr.name as labor_rate_name, lr.rate_per_hour
    FROM quote_line_items li
    LEFT JOIN products p ON li.product_id = p.id
    LEFT JOIN assemblies a ON li.assembly_id = a.id
    LEFT JOIN labor_rates lr ON li.labor_rate_id = lr.id
    WHERE li.quote_id = ?
    ORDER BY li.sort_order, li.id
  `).all(params.id);

  const exportData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    app: 'ScopeForge',
    quote: { ...(quote as object), line_items },
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="quote-${(quote as Record<string, string>).quote_number}.json"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.quote || body.app !== 'ScopeForge') {
    return NextResponse.json({ error: 'Invalid ScopeForge export file' }, { status: 400 });
  }

  const db = getDb();
  const q = body.quote;

  const existing = db.prepare('SELECT id FROM quotes WHERE quote_number = ?').get(q.quote_number);
  const newQuoteNumber = existing
    ? `${q.quote_number}-IMP${Date.now().toString(36)}`
    : q.quote_number;

  const result = db.prepare(`
    INSERT INTO quotes (quote_number, status, customer_name, customer_email, customer_phone, customer_company, customer_address, job_name, job_description, scope_of_work, notes, subtotal, tax_rate, tax_amount, discount_amount, discount_type, total, share_token)
    VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newQuoteNumber, q.customer_name, q.customer_email, q.customer_phone, q.customer_company, q.customer_address,
    q.job_name, q.job_description, q.scope_of_work, q.notes,
    q.subtotal || 0, q.tax_rate || 0, q.tax_amount || 0, q.discount_amount || 0, q.discount_type || 'flat', q.total || 0,
    crypto.randomBytes(16).toString('hex')
  );

  const newQuoteId = result.lastInsertRowid;

  if (q.line_items) {
    const insertItem = db.prepare(`
      INSERT INTO quote_line_items (quote_id, sort_order, item_type, description, quantity, unit_type, unit_price, multiplier, labor_minutes, line_total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of q.line_items) {
      insertItem.run(newQuoteId, item.sort_order || 0, item.item_type, item.description, item.quantity, item.unit_type, item.unit_price, item.multiplier, item.labor_minutes || 0, item.line_total, item.notes);
    }
  }

  return NextResponse.json({ id: newQuoteId, quote_number: newQuoteNumber }, { status: 201 });
}
