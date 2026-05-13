import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const active = searchParams.get('active');

  const db = getDb();
  let query = `
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (category) {
    query += ' AND p.category_id = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (p.name LIKE ? OR p.model_number LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (active !== null && active !== undefined && active !== '') {
    query += ' AND p.is_active = ?';
    params.push(active);
  }

  query += ' ORDER BY c.name, p.name';
  const products = db.prepare(query).all(...params);
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category_id, model_number, description, unit_price, unit_type, quantity_per_unit, sku, notes } = body;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO products (name, category_id, model_number, description, unit_price, unit_type, quantity_per_unit, sku, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, category_id || null, model_number || null, description || null, unit_price || 0, unit_type || 'each', quantity_per_unit || 1, sku || null, notes || null);

  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(result.lastInsertRowid);
  return NextResponse.json(product, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, category_id, model_number, description, unit_price, unit_type, quantity_per_unit, sku, notes, is_active } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name required' }, { status: 400 });

  const db = getDb();
  db.prepare(`
    UPDATE products SET name=?, category_id=?, model_number=?, description=?, unit_price=?, unit_type=?, quantity_per_unit=?, sku=?, notes=?, is_active=?, updated_at=CURRENT_TIMESTAMP 
    WHERE id=?
  `).run(name, category_id || null, model_number || null, description || null, unit_price || 0, unit_type || 'each', quantity_per_unit || 1, sku || null, notes || null, is_active ?? 1, id);

  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(id);
  return NextResponse.json(product);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
