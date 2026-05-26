import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateQuoteNumber, generateShareToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.type === 'url') {
    return handleUrlImport(body.url);
  }

  if (body.type === 'csv') {
    return handleCsvImport(body.data, body.category_id);
  }

  if (body.type === 'confirm') {
    return handleConfirmImport(body.items);
  }

  if (body.type === 'recategorize') {
    return handleRecategorize(body.url);
  }

  if (body.type === 'migrate-hierarchy') {
    return handleMigrateHierarchy();
  }

  if (body.type === 'siteplan-parse') {
    return handleSitePlanParse(body.csv);
  }

  if (body.type === 'siteplan-confirm') {
    return handleSitePlanConfirm(body);
  }

  return NextResponse.json({ error: 'Invalid import type' }, { status: 400 });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      fields.push(field); field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function handleSitePlanParse(csv: string) {
  if (!csv?.trim()) return NextResponse.json({ error: 'CSV data required' }, { status: 400 });

  const lines = csv.trim().split('\n').map(l => l.replace(/\r$/, '').trim()).filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });

  const headers = parseCsvLine(lines[0]);
  const required = ['SKU', 'Quantity', 'MSRP'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Missing required columns: ${missing.join(', ')}. Make sure this is a Verkada Site Planner CSV export.`
    }, { status: 400 });
  }

  const col = (name: string) => headers.indexOf(name);
  const iSku = col('SKU'), iQty = col('Quantity'), iMsrp = col('MSRP');
  const iProject = col('Project Name'), iLocation = col('Location Name'), iPlan = col('Plan Name');

  let projectName = '';
  let locationName = '';
  const plansSet = new Set<string>();
  const skuMap = new Map<string, { quantity: number; msrp: number; plans: Set<string> }>();

  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const sku = f[iSku]?.trim();
    if (!sku) continue;

    if (!projectName && iProject >= 0) projectName = f[iProject]?.trim() || '';
    if (!locationName && iLocation >= 0) locationName = f[iLocation]?.trim() || '';
    const plan = iPlan >= 0 ? (f[iPlan]?.trim() || '') : '';
    if (plan) plansSet.add(plan);

    const qty = parseInt(f[iQty] || '1', 10) || 1;
    const msrp = parseFloat((f[iMsrp] || '0').replace(/[$,]/g, '')) || 0;

    const existing = skuMap.get(sku);
    if (existing) {
      existing.quantity += qty;
      if (plan) existing.plans.add(plan);
    } else {
      skuMap.set(sku, { quantity: qty, msrp, plans: new Set(plan ? [plan] : []) });
    }
  }

  if (skuMap.size === 0) return NextResponse.json({ error: 'No valid SKUs found in CSV' }, { status: 400 });

  const db = getDb();
  const items = Array.from(skuMap.entries()).map(([sku, data]) => {
    const product = db.prepare(
      'SELECT id, name, model_number, unit_price, unit_type FROM products WHERE UPPER(model_number) = UPPER(?) AND is_active = 1 LIMIT 1'
    ).get(sku) as { id: number; name: string; model_number: string; unit_price: number; unit_type: string } | undefined;
    return {
      sku,
      quantity: data.quantity,
      msrp: data.msrp,
      plans: Array.from(data.plans),
      found: !!product,
      product_id: product?.id ?? null,
      product_name: product?.name ?? null,
      unit_price: product?.unit_price ?? data.msrp,
      unit_type: product?.unit_type ?? 'each',
    };
  });

  items.sort((a, b) => (b.found ? 1 : 0) - (a.found ? 1 : 0));

  return NextResponse.json({
    projectName,
    locationName,
    plans: Array.from(plansSet),
    totalRows: lines.length - 1,
    matchedCount: items.filter(i => i.found).length,
    notFoundCount: items.filter(i => !i.found).length,
    items,
  });
}

function handleSitePlanConfirm(body: {
  items: Array<{
    sku: string; product_id: number | null; product_name: string | null;
    quantity: number; unit_price: number; unit_type: string; found: boolean;
  }>;
  job_name: string; customer_name?: string; customer_company?: string;
  customer_email?: string; customer_phone?: string;
}) {
  const { items, job_name, customer_name, customer_company, customer_email, customer_phone } = body;
  if (!job_name?.trim()) return NextResponse.json({ error: 'Job name required' }, { status: 400 });
  if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 });

  const db = getDb();
  const quote_number = generateQuoteNumber(db);
  const share_token = generateShareToken();

  const quoteResult = db.prepare(`
    INSERT INTO quotes (quote_number, job_name, customer_name, customer_company, customer_email, customer_phone, share_token, tax_rate, discount_amount, discount_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'flat')
  `).run(quote_number, job_name.trim(), customer_name || null, customer_company || null, customer_email || null, customer_phone || null, share_token);

  const quoteId = Number(quoteResult.lastInsertRowid);

  const insertItem = db.prepare(`
    INSERT INTO quote_line_items
      (quote_id, sort_order, item_type, product_id, description, quantity, unit_type, unit_price, multiplier, labor_minutes, line_total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, 0, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    items.forEach((item, idx) => {
      let description: string;
      let unitPrice = item.unit_price;
      let unitType = item.unit_type || 'each';

      if (item.product_id) {
        const p = db.prepare('SELECT name, model_number, unit_price, unit_type FROM products WHERE id = ?')
          .get(item.product_id) as { name: string; model_number: string | null; unit_price: number; unit_type: string } | undefined;
        if (p) {
          description = p.name + (p.model_number ? ` (${p.model_number})` : '');
          unitPrice = item.unit_price; // respect user-edited price
          unitType = p.unit_type;
        } else {
          description = item.sku;
        }
      } else {
        description = `${item.sku} — not in catalog`;
      }

      const lineTotal = unitPrice * item.quantity;
      const notes = !item.product_id
        ? `SKU "${item.sku}" was not found in the product catalog. Price sourced from Verkada Site Planner MSRP.`
        : null;

      insertItem.run(
        quoteId, idx + 1,
        item.product_id ? 'product' : 'custom',
        item.product_id,
        description,
        item.quantity,
        unitType,
        unitPrice,
        lineTotal,
        notes
      );
    });
  });
  insertAll();

  const lineItems = db.prepare('SELECT line_total FROM quote_line_items WHERE quote_id = ?').all(quoteId) as Array<{ line_total: number }>;
  const subtotal = lineItems.reduce((s, li) => s + (li.line_total || 0), 0);
  db.prepare('UPDATE quotes SET subtotal=?, tax_amount=0, total=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(subtotal, subtotal, quoteId);

  return NextResponse.json({ success: true, quote_id: quoteId, quote_number });
}

async function handleUrlImport(url: string) {
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    // Polyfill File for cheerio 1.x on Node 18
    if (typeof globalThis.File === 'undefined') {
      (globalThis as Record<string, unknown>).File = class File extends Blob {
        name: string;
        lastModified: number;
        constructor(chunks: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(chunks, opts);
          this.name = name;
          this.lastModified = opts?.lastModified || Date.now();
        }
      };
    }
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const items: Array<{
      name: string;
      model_number: string;
      price: number;
      category_suggestion: string;
      description: string;
    }> = [];

    // Generic table parsing
    $('table').each((_, table) => {
      const headers: string[] = [];
      $(table).find('thead th, tr:first-child th, tr:first-child td').each((_, th) => {
        headers.push($(th).text().trim().toLowerCase());
      });

      $(table).find('tbody tr, tr').slice(headers.length > 0 ? 0 : 1).each((_, row) => {
        const cells: string[] = [];
        $(row).find('td').each((_, td) => {
          cells.push($(td).text().trim());
        });
        if (cells.length < 2) return;

        const nameIdx = headers.findIndex(h => h.includes('model') || h.includes('name') || h.includes('product'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('msrp') || h.includes('cost'));
        
        const name = cells[nameIdx >= 0 ? nameIdx : 0] || '';
        const priceStr = cells[priceIdx >= 0 ? priceIdx : cells.length - 1] || '0';
        const price = parseFloat(priceStr.replace(/[$,]/g, '')) || 0;
        
        if (name && name.length > 1) {
          items.push({
            name,
            model_number: name.match(/^[A-Z0-9-]+$/i) ? name : '',
            price,
            category_suggestion: '',
            description: cells.filter((_, i) => i !== (nameIdx >= 0 ? nameIdx : 0) && i !== (priceIdx >= 0 ? priceIdx : cells.length - 1)).join(' | '),
          });
        }
      });
    });

    // Strategy 1: Extract embedded JSON product catalog data
    // Sites like Verkada embed full product data as escaped JSON in the page
    if (items.length === 0) {
      const embeddedPattern = /\{\\"category\\":\\"([^\\]*)\\"[^}]*?\\"description\\":\\"([^\\]*)\\"[^}]*?\\"modelName\\":\\"([^\\]*)\\"[^}]*?\\"price\\":(\d+)[^}]*?\\"productFamily\\":\\"([^\\]*)\\"[^}]*?\\"productSKU\\":\\"([^\\]*)\\"/g;
      let embMatch;
      const skuSeen = new Set<string>();
      while ((embMatch = embeddedPattern.exec(html)) !== null) {
        const [, category, description, modelName, priceStr, productFamily, sku] = embMatch;
        if (skuSeen.has(sku)) continue;
        skuSeen.add(sku);
        const price = parseInt(priceStr, 10) || 0;
        const catLabel = productFamily ? `${productFamily} - ${category}` : category;
        items.push({
          name: description || modelName,
          model_number: sku,
          price,
          category_suggestion: catLabel,
          description: description || '',
        });
      }
    }

    // Strategy 2: Find product model names as link/heading text followed by $PRICE USD
    if (items.length === 0) {
      const modelPricePattern = />([A-Z]{2,3}\d{2,3}(?:-[A-Z0-9]{1,5})?(?:-[A-Z0-9]{1,5})?)\s*</g;
      let modelMatch;
      const foundModels = new Map<string, number>();
      while ((modelMatch = modelPricePattern.exec(html)) !== null) {
        const model = modelMatch[1];
        if (foundModels.has(model)) continue;
        const after = html.substring(modelMatch.index + modelMatch[0].length, modelMatch.index + modelMatch[0].length + 3000);
        const priceFound = after.match(/\$([\d,]+)\s*USD/);
        if (priceFound) {
          const price = parseFloat(priceFound[1].replace(/,/g, '')) || 0;
          foundModels.set(model, price);
        }
      }
      foundModels.forEach((price, model) => {
        items.push({ name: model, model_number: model, price, category_suggestion: '', description: '' });
      });
    }

    // Strategy 3: Try JSON-LD structured data
    if (items.length === 0) {
      $('script[type="application/ld+json"]').each((_, script) => {
        const content = $(script).html() || '';
        try {
          const ld = JSON.parse(content);
          const products = Array.isArray(ld) ? ld : ld['@graph'] || [ld];
          for (const p of products) {
            if (p['@type'] === 'Product' || (p.name && p.offers)) {
              items.push({
                name: p.name || '',
                model_number: p.sku || p.mpn || '',
                price: p.offers?.price ? parseFloat(p.offers.price) : 0,
                category_suggestion: p.category || '',
                description: p.description || '',
              });
            }
          }
        } catch { /* ignore */ }
      });
    }

    // Strategy 4: Parse product cards with visible text
    if (items.length === 0) {
      const sections = $('section, [class*="product"], [class*="pricing"], [class*="category"]');
      let currentCategory = '';
      
      sections.each((_, section) => {
        const heading = $(section).find('h1, h2, h3, h4').first().text().trim();
        if (heading) currentCategory = heading;
        
        $(section).find('[class*="product"], [class*="item"], [class*="card"], [class*="row"]').each((_, item) => {
          const text = $(item).text().trim();
          const modelFound = text.match(/\b([A-Z]{2,3}\d{2,4}(?:-[A-Z0-9]+)*)\b/);
          const priceFound = text.match(/\$([\d,]+(?:\.\d{2})?)/);
          
          if (modelFound || priceFound) {
            const nameEl = $(item).find('h3, h4, h5, strong, [class*="name"], [class*="title"]').first();
            items.push({
              name: nameEl.text().trim() || modelFound?.[1] || 'Unknown',
              model_number: modelFound?.[1] || '',
              price: priceFound ? parseFloat(priceFound[1].replace(/,/g, '')) : 0,
              category_suggestion: currentCategory,
              description: '',
            });
          }
        });
      });
    }

    // Clean and deduplicate results
    const noise = /datasheet|pdf|download|spec-sheet|brochure|\.pdf|\.jpg|\.png|\.svg|cookie|analytics|script|stylesheet/i;
    const seen = new Set<string>();
    const unique = items.filter(item => {
      // Skip noise items
      if (noise.test(item.name) || noise.test(item.model_number)) return false;
      if (item.name.length < 3) return false;
      // Case-insensitive dedup on model number (or name if no model)
      const key = (item.model_number || item.name).toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      // Normalize name to uppercase model
      item.name = item.name.toUpperCase().replace(/-DATASHEET$/i, '');
      item.model_number = item.model_number.toUpperCase().replace(/-DATASHEET$/i, '');
      return true;
    });

    return NextResponse.json({ items: unique, source: url });
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch URL: ${(error as Error).message}` }, { status: 500 });
  }
}

function handleCsvImport(data: string, categoryId?: number) {
  if (!data) return NextResponse.json({ error: 'CSV data required' }, { status: 400 });

  const lines = data.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  const items = lines.slice(1).map(line => {
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
    
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('product'));
    const modelIdx = headers.findIndex(h => h.includes('model') || h.includes('sku'));
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('msrp') || h.includes('cost'));
    const descIdx = headers.findIndex(h => h.includes('desc'));
    const catIdx = headers.findIndex(h => h.includes('category') || h.includes('type'));

    return {
      name: values[nameIdx >= 0 ? nameIdx : 0] || '',
      model_number: values[modelIdx >= 0 ? modelIdx : 1] || '',
      price: parseFloat((values[priceIdx >= 0 ? priceIdx : 2] || '0').replace(/[$,]/g, '')) || 0,
      category_suggestion: values[catIdx >= 0 ? catIdx : -1] || '',
      description: values[descIdx >= 0 ? descIdx : -1] || '',
      category_id: categoryId,
    };
  }).filter(item => item.name);

  return NextResponse.json({ items, source: 'csv' });
}

function mapVerkadaToHierarchy(productFamily: string, name: string, model: string): { parent: string; sub: string } | null {
  const fam = productFamily.toLowerCase().trim();
  const nm = name.toLowerCase();
  const mdl = model.toUpperCase().trim();

  const isLicense = nm.includes('license') || mdl.startsWith('VK-') || fam.includes('license') || fam.includes('cmd');
  const isAccessory = mdl.startsWith('ACC-') || fam.includes('accessor') || fam.includes('mount') ||
    fam.includes('bracket') || fam.includes('injector') || fam.includes('power supply') ||
    mdl.startsWith('POE') || nm.includes('mount') || nm.includes('bracket') || nm.includes('injector');

  if (/camera|dome|fisheye|multisensor|ptz|doorbell|license plate|turret|bullet|corridor/.test(fam) ||
      /^(cd|ch|cm|cf|cp|cs|cv)\d/.test(mdl.toLowerCase())) {
    const parent = 'Video Security';
    if (isLicense) return { parent, sub: 'Camera Licenses' };
    if (isAccessory) return { parent, sub: 'Camera Accessories' };
    return { parent, sub: 'Cameras' };
  }
  if (isAccessory && /video|security|surveillance|camera/.test(fam)) {
    return { parent: 'Video Security', sub: 'Camera Accessories' };
  }
  if (/door controller|access control|card reader|keypad|wireless lock|reader|controller/.test(fam) ||
      /^(ac|dl|ds)\d/.test(mdl.toLowerCase())) {
    const parent = 'Access Control';
    if (isLicense) return { parent, sub: 'Access Control Licenses' };
    if (/reader|keypad/.test(fam)) return { parent, sub: 'Card Readers' };
    if (/lock/.test(fam)) return { parent, sub: 'Wireless Locks' };
    return { parent, sub: 'Door Controllers' };
  }
  if (/intercom/.test(fam) || /^ix/.test(mdl.toLowerCase())) {
    const parent = 'Intercom';
    if (isLicense) return { parent, sub: 'Intercom Licenses' };
    return { parent, sub: 'Intercom Hardware' };
  }
  if (/air quality|environmental/.test(fam) || /^(sv|aq)\d/.test(mdl.toLowerCase())) {
    const parent = 'Environmental';
    if (isLicense) return { parent, sub: 'Sensor Licenses' };
    return { parent, sub: 'Air Quality Sensors' };
  }
  if (/alarm/.test(fam) || /^(gv|sp)\d/.test(mdl.toLowerCase())) {
    const parent = 'Alarms';
    if (isLicense) return { parent, sub: 'Alarm Licenses' };
    return { parent, sub: 'Alarm Hardware' };
  }
  if (/workplace|people counting|desk/.test(fam)) {
    const parent = 'Workplace';
    if (isLicense) return { parent, sub: 'Workplace Licenses' };
    return { parent, sub: 'Workplace Hardware' };
  }
  return null;
}

function buildCategoryHelpers(db: ReturnType<typeof getDb>) {
  const categoryCache = new Map<string, number>();
  const existingCats = db.prepare('SELECT id, name, parent_id FROM categories').all() as Array<{ id: number; name: string; parent_id: number | null }>;
  existingCats.forEach(c => {
    if (c.parent_id) {
      categoryCache.set(`__sub__${c.parent_id}__${c.name.toLowerCase()}`, c.id);
    } else {
      categoryCache.set(c.name.toLowerCase(), c.id);
    }
  });

  const insertFlat = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const insertSub = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)');

  function getOrCreateCategory(suggestion: string, name = '', model = ''): number | null {
    if (!suggestion) return null;

    const hierarchy = mapVerkadaToHierarchy(suggestion, name, model);
    if (hierarchy) {
      const parentKey = hierarchy.parent.toLowerCase();
      let parentId: number;
      if (categoryCache.has(parentKey)) {
        parentId = categoryCache.get(parentKey)!;
      } else {
        const r = insertFlat.run(hierarchy.parent);
        parentId = Number(r.lastInsertRowid);
        categoryCache.set(parentKey, parentId);
      }
      const subKey = `__sub__${parentId}__${hierarchy.sub.toLowerCase()}`;
      if (categoryCache.has(subKey)) return categoryCache.get(subKey)!;
      const r = insertSub.run(hierarchy.sub, parentId);
      const subId = Number(r.lastInsertRowid);
      categoryCache.set(subKey, subId);
      return subId;
    }

    // Fallback: flat category from suggestion string
    const catName = suggestion.includes(' - ') ? suggestion.split(' - ')[0].trim() : suggestion.trim();
    if (!catName) return null;
    const key = catName.toLowerCase();
    if (categoryCache.has(key)) return categoryCache.get(key)!;
    const r = insertFlat.run(catName);
    const id = Number(r.lastInsertRowid);
    categoryCache.set(key, id);
    return id;
  }

  function getOrCreateHierarchy(parent: string, sub: string): number {
    const parentKey = parent.toLowerCase();
    let parentId: number;
    if (categoryCache.has(parentKey)) {
      parentId = categoryCache.get(parentKey)!;
    } else {
      const r = insertFlat.run(parent);
      parentId = Number(r.lastInsertRowid);
      categoryCache.set(parentKey, parentId);
    }
    const subKey = `__sub__${parentId}__${sub.toLowerCase()}`;
    if (categoryCache.has(subKey)) return categoryCache.get(subKey)!;
    const r = insertSub.run(sub, parentId);
    const subId = Number(r.lastInsertRowid);
    categoryCache.set(subKey, subId);
    return subId;
  }

  const startCount = existingCats.length;
  const getCategoriesCreated = () => categoryCache.size - startCount;

  return { getOrCreateCategory, getOrCreateHierarchy, getCategoriesCreated };
}

function handleConfirmImport(items: Array<{
  name: string; model_number: string; price: number; category_id?: number;
  category_suggestion?: string;
  description?: string; unit_type?: string; quantity_per_unit?: number;
}>) {
  if (!items || !items.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  const db = getDb();
  const { getOrCreateCategory, getCategoriesCreated } = buildCategoryHelpers(db);

  const insert = db.prepare(`
    INSERT INTO products (name, model_number, unit_price, category_id, description, unit_type, quantity_per_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;

  const importMany = db.transaction((importItems: typeof items) => {
    for (const item of importItems) {
      const catId = item.category_id || getOrCreateCategory(item.category_suggestion || '', item.name, item.model_number || '');
      insert.run(
        item.name, item.model_number || null, item.price || 0,
        catId, item.description || null,
        item.unit_type || 'each', item.quantity_per_unit || 1
      );
      imported++;
    }
  });

  importMany(items);
  const categoriesCreated = getCategoriesCreated();
  return NextResponse.json({ success: true, imported, categoriesCreated });
}

function handleMigrateHierarchy() {
  const FLAT_TO_HIERARCHY: Record<string, { parent: string; base: string; licenseSub: string; accessorySub: string }> = {
    'camera':               { parent: 'Video Security',  base: 'Cameras',           licenseSub: 'Camera Licenses',           accessorySub: 'Camera Accessories' },
    'intercom':             { parent: 'Intercom',        base: 'Intercom Hardware', licenseSub: 'Intercom Licenses',         accessorySub: 'Intercom Accessories' },
    'access control':       { parent: 'Access Control',  base: 'Door Controllers',  licenseSub: 'Access Control Licenses',   accessorySub: 'Access Control Accessories' },
    'platform accessories': { parent: 'Video Security',  base: 'Camera Accessories',licenseSub: 'Camera Accessories',        accessorySub: 'Camera Accessories' },
    'sensor':               { parent: 'Environmental',   base: 'Air Quality Sensors',licenseSub: 'Sensor Licenses',          accessorySub: 'Sensor Accessories' },
    'alarm':                { parent: 'Alarms',          base: 'Alarm Hardware',    licenseSub: 'Alarm Licenses',            accessorySub: 'Alarm Accessories' },
    'workplace':            { parent: 'Workplace',       base: 'Workplace Hardware',licenseSub: 'Workplace Licenses',        accessorySub: 'Workplace Accessories' },
  };

  const db = getDb();
  const { getOrCreateHierarchy, getCategoriesCreated } = buildCategoryHelpers(db);

  const products = db.prepare(`
    SELECT p.id, p.name, p.model_number, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE c.parent_id IS NULL AND c.name IS NOT NULL
  `).all() as Array<{ id: number; name: string; model_number: string | null; category_name: string }>;

  const updateStmt = db.prepare('UPDATE products SET category_id = ? WHERE id = ?');
  let updated = 0;
  let skipped = 0;

  const migrate = db.transaction(() => {
    for (const product of products) {
      const mapping = FLAT_TO_HIERARCHY[product.category_name.toLowerCase()];
      if (!mapping) { skipped++; continue; }

      const nm = product.name.toLowerCase();
      const mdl = (product.model_number || '').toUpperCase();
      const isLicense = nm.includes('license') || mdl.startsWith('VK-');
      const isAccessory = mdl.startsWith('ACC-') || nm.includes(' mount') || nm.includes('bracket') || nm.includes('injector') || nm.startsWith('poe ');

      const sub = isLicense ? mapping.licenseSub : isAccessory ? mapping.accessorySub : mapping.base;
      const catId = getOrCreateHierarchy(mapping.parent, sub);
      updateStmt.run(catId, product.id);
      updated++;
    }
  });
  migrate();

  return NextResponse.json({ success: true, updated, skipped, categoriesCreated: getCategoriesCreated() });
}

async function handleRecategorize(url: string) {
  // Re-fetch the URL, extract product data with categories, then update existing products
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    // Extract SKU -> category mapping from embedded JSON
    const embeddedPattern = /\{\\"category\\":\\"([^\\]*)\\"[^}]*?\\"description\\":\\"([^\\]*)\\"[^}]*?\\"modelName\\":\\"([^\\]*)\\"[^}]*?\\"price\\":(\d+)[^}]*?\\"productFamily\\":\\"([^\\]*)\\"[^}]*?\\"productSKU\\":\\"([^\\]*)\\"/g;
    let match;
    const skuToCategory = new Map<string, string>();
    while ((match = embeddedPattern.exec(html)) !== null) {
      const [, , , , , productFamily, sku] = match;
      if (sku && productFamily) {
        skuToCategory.set(sku.toUpperCase(), productFamily);
      }
    }

    if (skuToCategory.size === 0) {
      return NextResponse.json({ error: 'Could not extract category data from URL' }, { status: 400 });
    }

    const db = getDb();
    const { getOrCreateCategory, getCategoriesCreated } = buildCategoryHelpers(db);

    // Get all products and update their categories
    const products = db.prepare('SELECT id, model_number, name FROM products').all() as Array<{ id: number; model_number: string | null; name: string }>;
    const updateStmt = db.prepare('UPDATE products SET category_id = ? WHERE id = ?');

    let updated = 0;

    const updateMany = db.transaction(() => {
      for (const product of products) {
        const sku = (product.model_number || product.name || '').toUpperCase();
        const family = skuToCategory.get(sku);
        if (family) {
          const catId = getOrCreateCategory(family, product.name, product.model_number || '');
          updateStmt.run(catId, product.id);
          updated++;
        }
      }
    });
    updateMany();

    const categoriesCreated = getCategoriesCreated();
    return NextResponse.json({
      success: true,
      updated,
      categoriesCreated,
      totalProducts: products.length,
      skusFound: skuToCategory.size,
    });
  } catch (error) {
    return NextResponse.json({ error: `Failed: ${(error as Error).message}` }, { status: 500 });
  }
}
