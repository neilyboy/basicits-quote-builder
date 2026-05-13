import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateQuoteNumber, generateShareToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const db = getDb();
  let query = 'SELECT * FROM quotes WHERE 1=1';
  const params: unknown[] = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (job_name LIKE ? OR customer_name LIKE ? OR customer_company LIKE ? OR quote_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY updated_at DESC';
  const quotes = db.prepare(query).all(...params);
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_name, job_description, scope_of_work, notes, customer_name, customer_email, customer_phone, customer_company, customer_address, tax_rate, discount_amount, discount_type } = body;
  if (!job_name) return NextResponse.json({ error: 'Job name required' }, { status: 400 });

  const db = getDb();
  const quote_number = generateQuoteNumber(db);
  const share_token = generateShareToken();

  const result = db.prepare(`
    INSERT INTO quotes (quote_number, job_name, job_description, scope_of_work, notes, customer_name, customer_email, customer_phone, customer_company, customer_address, tax_rate, discount_amount, discount_type, share_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(quote_number, job_name, job_description || null, scope_of_work || null, notes || null, customer_name || null, customer_email || null, customer_phone || null, customer_company || null, customer_address || null, tax_rate || 0, discount_amount || 0, discount_type || 'flat', share_token);

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(quote, { status: 201 });
}
