const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const SETTINGS_FILE = path.join(__dirname, 'data', 'shelf-settings.json');

app.use(cors());
app.use(express.json());

// Serve static assets from root and public directories for local dev and GitHub Pages compatibility
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Minimalist Luxury Gallery Palette
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

/**
 * Helper: Zero-dependency local .env loader
 */
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          const val = vals.join('=').trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      });
    } catch (e) {}
  }
}

/**
 * Retrieve Notion Credentials securely from Environment Variables and local .env.
 * Never commit secrets or hardcoded tokens to source control.
 */
function getNotionConfig() {
  loadEnvFile();

  let token = (process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '').trim();
  let databaseId = (process.env.NOTION_DATABASE_ID || '').replace(/-/g, '').trim();

  return {
    token,
    databaseId,
    isConfigured: Boolean(token && databaseId)
  };
}

function getShelfSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (err) {}
  return {};
}

function saveShelfSettings(settings) {
  try {
    const dataDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Shelf] Error saving settings:', err.message);
    return false;
  }
}

// In-Memory Live Cache (3 second TTL to avoid excessive Notion rate limiting while keeping data live)
let liveCache = {
  items: null,
  collections: null,
  lastFetchTime: 0,
  syncStatus: 'idle',
  lastError: null
};
const CACHE_TTL_MS = 3000;

/**
 * Fetch live data directly from Notion database.
 * Strictly avoids any stale/static disk fallbacks. If there is no live data or configuration, returns empty.
 */
async function syncLiveNotion(force = false) {
  const now = Date.now();
  if (!force && liveCache.items && (now - liveCache.lastFetchTime < CACHE_TTL_MS)) {
    return {
      items: liveCache.items,
      collections: liveCache.collections,
      fromCache: true
    };
  }

  const { token, databaseId, isConfigured } = getNotionConfig();

  if (!isConfigured) {
    liveCache.syncStatus = 'unconfigured';
    liveCache.items = [];
    liveCache.collections = [];
    liveCache.lastFetchTime = now;
    return {
      items: [],
      collections: [],
      fromCache: false,
      unconfigured: true
    };
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Notion API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.results)) {
      throw new Error('Invalid response structure from Notion database query');
    }

    // Convert Notion database records into shelf product objects
    const liveItems = data.results.map(page => {
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
      const domain = store.toLowerCase().includes('amazon') || rawLink.includes('amazon') ? 'amazon.in' : (rawLink.startsWith('http') ? new URL(rawLink).hostname : '');

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

    // Derive collections dynamically strictly from live categories (no stale disk fallback)
    const uniqueCategories = [];
    liveItems.forEach(it => {
      const cat = (it.category || 'Other').trim();
      if (!uniqueCategories.some(c => c.toLowerCase() === cat.toLowerCase())) {
        uniqueCategories.push(cat);
      }
    });

    const liveCollections = uniqueCategories.map(cat => {
      const key = cat.toLowerCase();
      const slug = key.replace(/[^a-z0-9]+/g, '-');
      const emoji = DEFAULT_EMOJIS[key] || '✨';
      return {
        id: `col-${slug}`,
        name: cat,
        emoji
      };
    });

    liveCache = {
      items: liveItems,
      collections: liveCollections,
      lastFetchTime: Date.now(),
      syncStatus: 'live',
      lastError: null
    };

    console.log(`[Shelf] Notion live sync complete: ${liveItems.length} items across ${liveCollections.length} collections.`);
    return {
      items: liveItems,
      collections: liveCollections,
      fromCache: false
    };

  } catch (err) {
    console.error('[Shelf] Notion live sync error:', err.message);
    liveCache.syncStatus = 'error';
    liveCache.lastError = err.message;
    liveCache.items = [];
    liveCache.collections = [];

    // Never fallback to stale disk data; return clean empty state
    return {
      items: [],
      collections: [],
      fromCache: false,
      error: err.message
    };
  }
}

// Helper: Get shelves combining collections & products
async function getEnrichedShelves(forceRefresh = false) {
  const { items, collections } = await syncLiveNotion(forceRefresh);
  const settings = getShelfSettings();

  return collections.map(col => {
    const colKey = col.name.trim().toLowerCase();
    const matchingProducts = items.filter(it => 
      (it.category || '').trim().toLowerCase() === colKey
    );
    const color = settings[colKey]?.color || DEFAULT_PALETTE[colKey] || '#111111';

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
}

// -----------------------------------------------------------------------------
// API Endpoints
// -----------------------------------------------------------------------------

// Force Sync / Refresh with Notion
app.post('/api/sync', async (req, res) => {
  const result = await syncLiveNotion(true);
  res.json({
    success: !result.error,
    itemsCount: result.items.length,
    collectionsCount: result.collections.length,
    syncStatus: liveCache.syncStatus,
    lastFetchTime: new Date(liveCache.lastFetchTime).toISOString(),
    error: result.error || null
  });
});

// Image Proxy with CORS
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Image URL required');
  try {
    const fetchRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!fetchRes.ok) return res.status(fetchRes.status).send('Failed to fetch image');
    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await fetchRes.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
});

// 1. Get Collections (Live from Notion)
app.get('/api/collections', async (req, res) => {
  const force = req.query.refresh === 'true';
  const { collections } = await syncLiveNotion(force);
  res.json({ success: true, collections });
});

// 2. Get All Shelves (Live from Notion)
app.get('/api/shelves', async (req, res) => {
  const force = req.query.refresh === 'true';
  const shelves = await getEnrichedShelves(force);
  res.json({
    success: true,
    count: shelves.length,
    syncStatus: liveCache.syncStatus,
    lastSync: new Date(liveCache.lastFetchTime).toISOString(),
    shelves
  });
});

// 3. Get Single Shelf by ID / Collection Name
app.get('/api/shelves/:id', async (req, res) => {
  const { id } = req.params;
  const targetKey = id.trim().toLowerCase();
  const shelves = await getEnrichedShelves(req.query.refresh === 'true');

  const shelf = shelves.find(s => 
    s.id === targetKey || 
    s.name.trim().toLowerCase() === targetKey ||
    (s.collectionId || '').trim().toLowerCase() === targetKey
  );

  if (!shelf) {
    return res.status(404).json({ error: 'Shelf not found' });
  }

  res.json({
    success: true,
    shelf
  });
});

// 4. Update Shelf Color / Visual Display
app.put('/api/shelves/:id', (req, res) => {
  const { id } = req.params;
  const { color } = req.body;
  const colKey = id.trim().toLowerCase();

  const settings = getShelfSettings();
  settings[colKey] = {
    ...(settings[colKey] || {}),
    color: color || '#111111',
    updatedAt: new Date().toISOString()
  };

  saveShelfSettings(settings);
  res.json({ success: true, settings: settings[colKey] });
});

// 5. Get All Raw Items (Live from Notion)
app.get('/api/items', async (req, res) => {
  const force = req.query.refresh === 'true';
  const { items } = await syncLiveNotion(force);
  res.json({
    success: true,
    count: items.length,
    syncStatus: liveCache.syncStatus,
    items
  });
});

// SPA fallback for routing
app.use((req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  const publicIndex = path.join(__dirname, 'public', 'index.html');

  if (fs.existsSync(rootIndex)) {
    return res.type('html').send(fs.readFileSync(rootIndex, 'utf8'));
  }
  if (fs.existsSync(publicIndex)) {
    return res.type('html').send(fs.readFileSync(publicIndex, 'utf8'));
  }
  res.status(404).send('Not Found');
});

// Start Server and trigger initial live sync if configured
app.listen(PORT, async () => {
  const config = getNotionConfig();
  console.log(`====================================================`);
  console.log(` ATELIER — Curated Storefront Showcase`);
  console.log(` Server live at: http://localhost:${PORT}`);
  if (config.isConfigured) {
    console.log(` Notion Sync: Configured via Environment Variables`);
    await syncLiveNotion(true);
  } else {
    console.log(` Notion Sync: Inactive (Set NOTION_TOKEN & NOTION_DATABASE_ID for live sync)`);
  }
  console.log(`====================================================`);
});
