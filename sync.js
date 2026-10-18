const fs = require('fs');
const path = require('path');

/**
 * ATELIER — Notion Sync Engine
 * Fetches curated products from Notion Database and publishes static JSON snapshots
 * for GitHub Pages & local fallback.
 */

// Simple .env loader for local execution
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const val = v.join('=').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[k.trim()]) {
          process.env[k.trim()] = val;
        }
      }
    }
  }
}

loadEnv();

const token = (process.env.NOTION_TOKEN || '').trim();
const databaseId = (process.env.NOTION_DATABASE_ID || '').replace(/-/g, '').trim();

if (!token || !databaseId) {
  console.error('[Sync] Error: NOTION_TOKEN or NOTION_DATABASE_ID is missing.');
  process.exit(1);
}

const DEFAULT_PALETTE = {
  'helmets': '#0F172A',
  'tools': '#111111',
  'bike storage': '#1A1A1A',
  'bike accessories': '#2C2C2E',
  'home': '#000000',
  'bags': '#000000',
  'other': '#000000'
};

const DEFAULT_EMOJIS = {
  'helmets': '🪖',
  'tools': '🔧',
  'bike storage': '🏍️',
  'bike accessories': '🛡️',
  'home': '🏺',
  'bags': '👜',
  'clothing': '👔',
  'books': '📖',
  'other': '✨'
};

async function fetchAllNotionPages() {
  let results = [];
  let hasMore = true;
  let startCursor = undefined;

  console.log(`[Sync] Querying Notion database: ${databaseId}...`);

  while (hasMore) {
    const payload = { page_size: 100 };
    if (startCursor) payload.start_cursor = startCursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    if (Array.isArray(data.results)) {
      results.push(...data.results);
    }
    hasMore = Boolean(data.has_more);
    startCursor = data.next_cursor;
  }

  return results;
}

async function runSync() {
  try {
    const rawPages = await fetchAllNotionPages();
    console.log(`[Sync] Retrieved ${rawPages.length} records from Notion.`);

    const items = rawPages.map(page => {
      const props = page.properties || {};
      const title = props.Name?.title?.[0]?.plain_text || props.Name?.title?.[0]?.text?.content || 'Untitled Object';
      const price = props.Price?.rich_text?.[0]?.plain_text || (props.Price?.number != null ? `₹${props.Price.number}` : '₹ Check Store');

      let rawPrice = 0;
      if (typeof price === 'string') {
        const cleaned = price.replace(/[^0-9.]/g, '');
        const num = parseFloat(cleaned);
        if (!isNaN(num)) rawPrice = num;
      }

      let store = props['Store ']?.select?.name || props['Store']?.select?.name || 'Other';
      if (store.toLowerCase() === 'amzn') store = 'Amazon';

      const category = (props.Category?.select?.name || 'Other').trim();
      const rawLink = props['Product Link']?.url || props.Link?.url || props['Product link']?.url || '#';

      let image = props.Image?.url || props.Image?.files?.[0]?.file?.url || props.Image?.files?.[0]?.external?.url || '';
      if (!image) {
        image = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80';
      }

      const status = props.Status?.select?.name || 'Wishlist';
      const domain = store.toLowerCase().includes('amazon') || rawLink.includes('amazon') 
        ? 'amazon.in' 
        : (rawLink.startsWith('http') ? new URL(rawLink).hostname : '');

      return {
        id: page.id,
        notionPageId: page.id,
        title,
        secondaryTitle: store !== 'Other' ? `${store} Official Store` : category,
        price,
        rawPrice,
        currency: price.includes('₹') ? 'INR' : (price.includes('$') ? 'USD' : 'INR'),
        image,
        rawLink,
        store,
        domain,
        storeColor: '#111111',
        category,
        status,
        notes: props.Notes?.rich_text?.[0]?.plain_text || '',
        createdAt: page.created_time || new Date().toISOString()
      };
    });

    // Derive Collections
    const uniqueCategories = [];
    items.forEach(it => {
      const cat = (it.category || 'Other').trim();
      if (!uniqueCategories.some(c => c.toLowerCase() === cat.toLowerCase())) {
        uniqueCategories.push(cat);
      }
    });

    const collections = uniqueCategories.map(cat => {
      const key = cat.toLowerCase();
      const slug = key.replace(/[^a-z0-9]+/g, '-');
      const emoji = DEFAULT_EMOJIS[key] || '✨';
      return {
        id: `col-${slug}`,
        name: cat,
        emoji
      };
    });

    // Derive Enriched Shelves
    const shelves = collections.map(col => {
      const colKey = col.name.trim().toLowerCase();
      const matchingProducts = items.filter(it => 
        (it.category || '').trim().toLowerCase() === colKey
      );
      const color = DEFAULT_PALETTE[colKey] || '#111111';

      return {
        id: colKey,
        name: col.name,
        collectionId: col.id,
        collectionName: col.name,
        emoji: col.emoji || DEFAULT_EMOJIS[colKey] || '✨',
        color,
        products: matchingProducts,
        productCount: matchingProducts.length
      };
    });

    const nowIso = new Date().toISOString();

    const shelvesData = {
      success: true,
      count: shelves.length,
      syncStatus: 'live',
      lastSync: nowIso,
      shelves
    };

    const collectionsData = {
      success: true,
      lastSync: nowIso,
      collections
    };

    const itemsData = {
      success: true,
      count: items.length,
      lastSync: nowIso,
      items
    };

    // Save outputs to both data/ and public/data/
    const outDirs = [
      path.join(__dirname, 'data'),
      path.join(__dirname, 'public', 'data')
    ];

    for (const dir of outDirs) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shelves.json'), JSON.stringify(shelvesData, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'collections.json'), JSON.stringify(collectionsData, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(itemsData, null, 2), 'utf8');
    }

    console.log(`[Sync] Successfully generated static snapshots:`);
    console.log(`  - Items: ${items.length}`);
    console.log(`  - Collections: ${collections.length}`);
    console.log(`  - Shelves: ${shelves.length}`);
  } catch (err) {
    console.error('[Sync] Fatal sync error:', err.message);
    process.exit(1);
  }
}

runSync();
