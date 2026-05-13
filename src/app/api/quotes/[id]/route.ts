import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(params.id);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const line_items = db.prepare(`
    SELECT li.*,
      p.name as product_name, p.model_number as product_model, p.unit_type as product_unit_type,
      c.name as category_name,
      a.name as assembly_name, a.description as assembly_description,
      lr.name as labor_rate_name, lr.rate_per_hour
    FROM quote_line_items li
    LEFT JOIN products p ON li.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN assemblies a ON li.assembly_id = a.id
    LEFT JOIN labor_rates lr ON li.labor_rate_id = lr.id
    WHERE li.quote_id = ?
    ORDER BY li.sort_order, li.id
  `).all(params.id);

  return NextResponse.json({ ...(quote as object), line_items });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();

  if (body.status !== undefined) {
    db.prepare('UPDATE quotes SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.status, params.id);
    if (body.status === 'sent' && !body.sent_at) {
      db.prepare('UPDATE quotes SET sent_at=CURRENT_TIMESTAMP WHERE id=?').run(params.id);
    }
  }

  if (body.job_name !== undefined) {
    db.prepare(`
      UPDATE quotes SET 
        job_name=?, job_description=?, scope_of_work=?, notes=?,
        customer_name=?, customer_email=?, customer_phone=?, customer_company=?, customer_address=?,
        tax_rate=?, discount_amount=?, discount_type=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      body.job_name, body.job_description || null, body.scope_of_work || null, body.notes || null,
      body.customer_name || null, body.customer_email || null, body.customer_phone || null, body.customer_company || null, body.customer_address || null,
      body.tax_rate || 0, body.discount_amount || 0, body.discount_type || 'flat',
      params.id
    );
  }

  recalcQuoteTotals(db, Number(params.id));
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(params.id);
  return NextResponse.json(quote);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM quotes WHERE id = ?').run(params.id);
  return NextResponse.json({ success: true });
}

function recalcQuoteTotals(db: ReturnType<typeof getDb>, quoteId: number) {
  const items = db.prepare('SELECT * FROM quote_line_items WHERE quote_id = ?').all(quoteId) as Array<Record<string, number>>;
  const subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
  const quote = db.prepare('SELECT tax_rate, discount_amount, discount_type FROM quotes WHERE id = ?').get(quoteId) as Record<string, unknown>;
  
  const taxRate = (quote?.tax_rate as number) || 0;
  const discountAmt = (quote?.discount_amount as number) || 0;
  const discountType = (quote?.discount_type as string) || 'flat';

  const discount = discountType === 'percent' ? subtotal * (discountAmt / 100) : discountAmt;
  const taxable = subtotal - discount;
  const taxAmount = taxable * (taxRate / 100);
  const total = taxable + taxAmount;

  db.prepare('UPDATE quotes SET subtotal=?, tax_amount=?, total=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(subtotal, taxAmount, total, quoteId);
}
