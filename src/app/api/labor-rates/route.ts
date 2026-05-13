import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const rates = db.prepare('SELECT * FROM labor_rates ORDER BY name').all();
  return NextResponse.json(rates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, rate_per_hour, description } = body;
  if (!name || rate_per_hour === undefined) return NextResponse.json({ error: 'Name and rate required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO labor_rates (name, rate_per_hour, description) VALUES (?, ?, ?)'
  ).run(name, rate_per_hour, description || null);

  const rate = db.prepare('SELECT * FROM labor_rates WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(rate, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, rate_per_hour, description, is_active } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name required' }, { status: 400 });

  const db = getDb();
  db.prepare(
    'UPDATE labor_rates SET name=?, rate_per_hour=?, description=?, is_active=? WHERE id=?'
  ).run(name, rate_per_hour, description || null, is_active ?? 1, id);

  const rate = db.prepare('SELECT * FROM labor_rates WHERE id = ?').get(id);
  return NextResponse.json(rate);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDb();
  db.prepare('DELETE FROM labor_rates WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
