import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const id = searchParams.get('id');
  const db = getDb();

  if (id) {
    const assembly = db.prepare(`
      SELECT a.*, c.name as category_name 
      FROM assemblies a 
      LEFT JOIN categories c ON a.category_id = c.id 
      WHERE a.id = ?
    `).get(id);
    if (!assembly) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const components = db.prepare(`
      SELECT ac.*, p.name as product_name, p.model_number, p.unit_price, p.unit_type, p.quantity_per_unit, c.name as product_category
      FROM assembly_components ac
      JOIN products p ON ac.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ac.assembly_id = ?
      ORDER BY p.name
    `).all(id);

    const labor_rate = (assembly as Record<string, unknown>).default_labor_rate_id
      ? db.prepare('SELECT * FROM labor_rates WHERE id = ?').get((assembly as Record<string, unknown>).default_labor_rate_id)
      : null;

    return NextResponse.json({ ...assembly, components, labor_rate });
  }

  let query = `
    SELECT a.*, c.name as category_name,
      (SELECT COUNT(*) FROM assembly_components WHERE assembly_id = a.id) as component_count
    FROM assemblies a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (search) {
    query += ' AND (a.name LIKE ? OR a.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY a.name';
  const assemblies = db.prepare(query).all(...params);
  return NextResponse.json(assemblies);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, category_id, default_labor_rate_id, default_labor_minutes, default_multiplier, components } = body;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO assemblies (name, description, category_id, default_labor_rate_id, default_labor_minutes, default_multiplier) 
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, description || null, category_id || null, default_labor_rate_id || null, default_labor_minutes || 0, default_multiplier || 1.0);

  const assemblyId = result.lastInsertRowid;

  if (components && Array.isArray(components)) {
    const insertComp = db.prepare('INSERT INTO assembly_components (assembly_id, product_id, quantity, notes) VALUES (?, ?, ?, ?)');
    for (const comp of components) {
      insertComp.run(assemblyId, comp.product_id, comp.quantity || 1, comp.notes || null);
    }
  }

  return NextResponse.json({ id: assemblyId }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, description, category_id, default_labor_rate_id, default_labor_minutes, default_multiplier, is_active, components } = body;
  if (!id || !name) return NextResponse.json({ error: 'ID and name required' }, { status: 400 });

  const db = getDb();
  db.prepare(`
    UPDATE assemblies SET name=?, description=?, category_id=?, default_labor_rate_id=?, default_labor_minutes=?, default_multiplier=?, is_active=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, description || null, category_id || null, default_labor_rate_id || null, default_labor_minutes || 0, default_multiplier || 1.0, is_active ?? 1, id);

  if (components && Array.isArray(components)) {
    db.prepare('DELETE FROM assembly_components WHERE assembly_id = ?').run(id);
    const insertComp = db.prepare('INSERT INTO assembly_components (assembly_id, product_id, quantity, notes) VALUES (?, ?, ?, ?)');
    for (const comp of components) {
      insertComp.run(id, comp.product_id, comp.quantity || 1, comp.notes || null);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDb();
  db.prepare('DELETE FROM assemblies WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
