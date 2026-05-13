import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE share_token = ?').get(params.token);
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const line_items = db.prepare(`
    SELECT li.id, li.description, li.quantity, li.unit_type, li.unit_price, li.multiplier, li.line_total, li.item_type, li.notes,
      c.name as category_name
    FROM quote_line_items li
    LEFT JOIN products p ON li.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE li.quote_id = ?
    ORDER BY li.sort_order, li.id
  `).all((quote as Record<string, unknown>).id);

  const companyName = (db.prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as Record<string, string>)?.value || 'Basic ITS';

  return NextResponse.json({
    company_name: companyName,
    quote: {
      quote_number: (quote as Record<string, unknown>).quote_number,
      status: (quote as Record<string, unknown>).status,
      customer_name: (quote as Record<string, unknown>).customer_name,
      customer_company: (quote as Record<string, unknown>).customer_company,
      customer_email: (quote as Record<string, unknown>).customer_email,
      job_name: (quote as Record<string, unknown>).job_name,
      job_description: (quote as Record<string, unknown>).job_description,
      scope_of_work: (quote as Record<string, unknown>).scope_of_work,
      notes: (quote as Record<string, unknown>).notes,
      subtotal: (quote as Record<string, unknown>).subtotal,
      tax_rate: (quote as Record<string, unknown>).tax_rate,
      tax_amount: (quote as Record<string, unknown>).tax_amount,
      discount_amount: (quote as Record<string, unknown>).discount_amount,
      discount_type: (quote as Record<string, unknown>).discount_type,
      total: (quote as Record<string, unknown>).total,
      created_at: (quote as Record<string, unknown>).created_at,
      expires_at: (quote as Record<string, unknown>).expires_at,
      line_items,
    },
  });
}
