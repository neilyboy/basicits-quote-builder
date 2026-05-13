import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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

  return NextResponse.json({ error: 'Invalid import type' }, { status: 400 });
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

function handleConfirmImport(items: Array<{
  name: string; model_number: string; price: number; category_id?: number;
  category_suggestion?: string;
  description?: string; unit_type?: string; quantity_per_unit?: number;
}>) {
  if (!items || !items.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  const db = getDb();

  // Auto-create categories from category_suggestion if no category_id provided
  const categoryCache = new Map<string, number>();
  const existingCats = db.prepare('SELECT id, name FROM categories').all() as Array<{ id: number; name: string }>;
  existingCats.forEach(c => categoryCache.set(c.name.toLowerCase(), c.id));

  const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');

  function getOrCreateCategory(suggestion: string): number | null {
    if (!suggestion) return null;
    // Use the product family (first part before " - ") as the category name
    const catName = suggestion.includes(' - ') ? suggestion.split(' - ')[0].trim() : suggestion.trim();
    if (!catName) return null;

    const key = catName.toLowerCase();
    if (categoryCache.has(key)) return categoryCache.get(key)!;

    const result = insertCat.run(catName);
    const id = Number(result.lastInsertRowid);
    categoryCache.set(key, id);
    return id;
  }

  const insert = db.prepare(`
    INSERT INTO products (name, model_number, unit_price, category_id, description, unit_type, quantity_per_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let categoriesCreated = 0;
  const startCatCount = existingCats.length;

  const importMany = db.transaction((importItems: typeof items) => {
    for (const item of importItems) {
      const catId = item.category_id || getOrCreateCategory(item.category_suggestion || '');
      insert.run(
        item.name, item.model_number || null, item.price || 0,
        catId, item.description || null,
        item.unit_type || 'each', item.quantity_per_unit || 1
      );
      imported++;
    }
  });

  importMany(items);
  categoriesCreated = categoryCache.size - startCatCount;
  return NextResponse.json({ success: true, imported, categoriesCreated });
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

    // Get or create categories
    const categoryCache = new Map<string, number>();
    const existingCats = db.prepare('SELECT id, name FROM categories').all() as Array<{ id: number; name: string }>;
    existingCats.forEach(c => categoryCache.set(c.name.toLowerCase(), c.id));

    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const getOrCreateCat = (name: string): number => {
      const key = name.toLowerCase();
      if (categoryCache.has(key)) return categoryCache.get(key)!;
      const result = insertCat.run(name);
      const id = Number(result.lastInsertRowid);
      categoryCache.set(key, id);
      return id;
    };

    // Get all products and update their categories
    const products = db.prepare('SELECT id, model_number, name FROM products').all() as Array<{ id: number; model_number: string | null; name: string }>;
    const updateStmt = db.prepare('UPDATE products SET category_id = ? WHERE id = ?');

    let updated = 0;
    let categoriesCreated = 0;
    const startCatCount = existingCats.length;

    const updateMany = db.transaction(() => {
      for (const product of products) {
        const sku = (product.model_number || product.name || '').toUpperCase();
        const family = skuToCategory.get(sku);
        if (family) {
          const catId = getOrCreateCat(family);
          updateStmt.run(catId, product.id);
          updated++;
        }
      }
    });
    updateMany();

    categoriesCreated = categoryCache.size - startCatCount;
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
