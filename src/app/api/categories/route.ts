import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM products WHERE category_id = c.id) as product_count
    FROM categories c 
    ORDER BY c.sort_order, c.name
  `).all();
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, icon, parent_id, sort_order } = body;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO categories (name, icon, parent_id, sort_order) VALUES (?, ?, ?, ?)'
  ).run(name, icon || 'box', parent_id || null, sort_order || 0);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(category, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, icon, parent_id, sort_order } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name required' }, { status: 400 });

  const db = getDb();
  db.prepare(
    'UPDATE categories SET name = ?, icon = ?, parent_id = ?, sort_order = ? WHERE id = ?'
  ).run(name, icon || 'box', parent_id || null, sort_order || 0, id);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  return NextResponse.json(category);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDb();
  db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
