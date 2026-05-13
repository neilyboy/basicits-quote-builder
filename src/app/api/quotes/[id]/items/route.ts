import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { item_type, product_id, assembly_id, labor_rate_id, description, quantity, unit_type, unit_price, multiplier, labor_minutes, labor_rate_override, notes } = body;
  
  const db = getDb();
  const quoteId = Number(params.id);

  let finalDescription = description;
  let finalUnitPrice = unit_price || 0;
  let finalUnitType = unit_type || 'each';
  let finalLaborMinutes = labor_minutes || 0;
  let lineTotal = 0;

  if (item_type === 'product' && product_id) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id) as Record<string, unknown>;
    if (product) {
      finalDescription = finalDescription || `${product.name}${product.model_number ? ` (${product.model_number})` : ''}`;
      finalUnitPrice = finalUnitPrice || (product.unit_price as number);
      finalUnitType = (product.unit_type as string) || 'each';
    }
  }

  if (item_type === 'assembly' && assembly_id) {
    const assembly = db.prepare('SELECT * FROM assemblies WHERE id = ?').get(assembly_id) as Record<string, unknown>;
    if (assembly) {
      finalDescription = finalDescription || (assembly.name as string);
      finalLaborMinutes = finalLaborMinutes || (assembly.default_labor_minutes as number) || 0;

      const components = db.prepare(`
        SELECT ac.quantity, p.unit_price FROM assembly_components ac 
        JOIN products p ON ac.product_id = p.id WHERE ac.assembly_id = ?
      `).all(assembly_id) as Array<Record<string, number>>;
      
      const materialCost = components.reduce((s, c) => s + (c.unit_price * c.quantity), 0);
      
      let laborCost = 0;
      const rateId = labor_rate_id || assembly.default_labor_rate_id;
      if (rateId) {
        const rate = db.prepare('SELECT rate_per_hour FROM labor_rates WHERE id = ?').get(rateId) as Record<string, number>;
        if (rate) laborCost = (rate.rate_per_hour / 60) * finalLaborMinutes;
      }
      
      finalUnitPrice = materialCost + laborCost;
    }
  }

  if (item_type === 'labor' && labor_rate_id) {
    const rate = db.prepare('SELECT * FROM labor_rates WHERE id = ?').get(labor_rate_id) as Record<string, unknown>;
    if (rate) {
      finalDescription = finalDescription || `Labor: ${rate.name}`;
      const effectiveRate = labor_rate_override || (rate.rate_per_hour as number);
      finalUnitPrice = (effectiveRate / 60) * (finalLaborMinutes || 60);
      finalUnitType = 'each';
    }
  }

  const mult = multiplier || 1.0;
  const qty = quantity || 1;
  lineTotal = finalUnitPrice * qty * mult;

  const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM quote_line_items WHERE quote_id = ?').get(quoteId) as { max_order: number | null };
  const sortOrder = (maxOrder?.max_order || 0) + 1;

  const result = db.prepare(`
    INSERT INTO quote_line_items (quote_id, sort_order, item_type, product_id, assembly_id, labor_rate_id, description, quantity, unit_type, unit_price, multiplier, labor_minutes, labor_rate_override, line_total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(quoteId, sortOrder, item_type, product_id || null, assembly_id || null, labor_rate_id || null, finalDescription, qty, finalUnitType, finalUnitPrice, mult, finalLaborMinutes, labor_rate_override || null, lineTotal, notes || null);

  recalcQuoteTotals(db, quoteId);

  const item = db.prepare('SELECT * FROM quote_line_items WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { item_id, quantity, multiplier, unit_price, description, notes, labor_minutes, labor_rate_id, labor_rate_override } = body;
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const db = getDb();
  const quoteId = Number(params.id);

  const existing = db.prepare('SELECT * FROM quote_line_items WHERE id = ? AND quote_id = ?').get(item_id, quoteId) as Record<string, unknown>;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newQty = quantity ?? existing.quantity;
  const newMult = multiplier ?? existing.multiplier;
  const newPrice = unit_price ?? existing.unit_price;
  const newDesc = description ?? existing.description;
  const newNotes = notes !== undefined ? notes : existing.notes;
  const newLaborMin = labor_minutes ?? existing.labor_minutes;
  const newLaborRateId = labor_rate_id !== undefined ? labor_rate_id : existing.labor_rate_id;
  const newLaborOverride = labor_rate_override !== undefined ? labor_rate_override : existing.labor_rate_override;
  const lineTotal = (newPrice as number) * (newQty as number) * (newMult as number);

  db.prepare(`
    UPDATE quote_line_items SET quantity=?, multiplier=?, unit_price=?, description=?, notes=?, labor_minutes=?, labor_rate_id=?, labor_rate_override=?, line_total=? WHERE id=?
  `).run(newQty, newMult, newPrice, newDesc, newNotes, newLaborMin, newLaborRateId, newLaborOverride, lineTotal, item_id);

  recalcQuoteTotals(db, quoteId);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const db = getDb();
  const quoteId = Number(params.id);
  db.prepare('DELETE FROM quote_line_items WHERE id = ? AND quote_id = ?').run(itemId, quoteId);
  recalcQuoteTotals(db, quoteId);
  return NextResponse.json({ success: true });
}

function recalcQuoteTotals(db: ReturnType<typeof getDb>, quoteId: number) {
  const items = db.prepare('SELECT line_total FROM quote_line_items WHERE quote_id = ?').all(quoteId) as Array<{ line_total: number }>;
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
