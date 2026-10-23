// Usage: npm run import-pairo [-- --limit 10]
// Imports the catalog published at https://pairolifestyle.com (names, prices,
// descriptions, sizes and images) into the "jackets" collection. Images are
// downloaded into the upload directory. Safe to re-run: products whose base SKU
// already exists are skipped.
const fs = require('fs/promises');
const path = require('path');

const config = require('../config');
const { prisma } = require('./prisma');
const { saveProduct } = require('../services/adminProducts');
const { slugify } = require('../lib/slug');

const SOURCE = 'https://pairolifestyle.com';
const DELAY_MS = 250;
const HEADERS = { 'User-Agent': 'brozz-catalog-import/1.0' };

const SIZE_ORDER = ['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl', '4xl'];
const SIZE_ALIASES = { small: 's', medium: 'm', large: 'l', '2xl': 'xxl' };
const PRODUCT_TYPES = ['jacket', 'coat', 'vest', 'pants', 'pant', 'skirt', 'blazer', 'hoodie'];
const DEFAULT_STOCK = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const get = async (url, attempts = 3) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (attempt >= attempts) throw new Error(`${url}: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
};

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#39;/g, "'");

// "<h2>Spec</h2><ul><li><p>Material: Wool</p></li></ul>" -> "Spec\nMaterial: Wool"
const htmlToText = (html) =>
  decodeEntities(
    html
      .replace(/<\/(p|li|h[1-6]|div|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

const truncate = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf('\n'), max - 200)).trim();
};

const parseFeed = (xml) => {
  const items = new Map();
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = item.match(/<g:link>([^<]+)<\/g:link>/)?.[1];
    const mpn = item.match(/<g:mpn>([^<]+)<\/g:mpn>/)?.[1];
    const description = item.match(/<g:description>([\s\S]*?)<\/g:description>/)?.[1];
    if (link) {
      items.set(link.split('/').pop(), { mpn, description: description && decodeEntities(description) });
    }
  }
  return items;
};

// The product page embeds schema.org JSON-LD with the full HTML description.
const fetchDescription = async (slug, fallback) => {
  try {
    const html = await (await get(`${SOURCE}/product/${slug}`)).text();
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(json);
      const nodes = data['@graph'] || (Array.isArray(data) ? data : [data]);
      const product = nodes.find((node) => node['@type'] === 'Product' && node.description);
      if (product) return htmlToText(product.description);
    }
  } catch (err) {
    console.warn(`  description fallback for ${slug}: ${err.message}`);
  }
  return fallback ? decodeEntities(fallback) : '';
};

const normalizeSize = (label) => {
  const key = String(label).toLowerCase().replace(/\s+/g, '');
  const size = SIZE_ALIASES[key] || key;
  return SIZE_ORDER.includes(size) ? size : null;
};

const readSizes = (source) => {
  const values = source.attributes?.find((attribute) => attribute.type === 'size')?.values || [];
  const sizes = [...new Set(values.map((value) => normalizeSize(value.label)).filter(Boolean))];
  if (sizes.length === 0) return { sizes: ['os'], inventory: { os: DEFAULT_STOCK } };

  sizes.sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  const inventory = {};
  for (const size of sizes) {
    const stocks = (source.variantCombinations || [])
      .filter((combo) => normalizeSize(combo.title) === size)
      .map((combo) => Number(combo.stock))
      .filter(Number.isFinite);
    inventory[size] = stocks.length > 0 ? Math.max(...stocks) : DEFAULT_STOCK;
  }
  return { sizes, inventory };
};

const readColor = (description) => {
  const color = description
    .match(/colou?r:\s*([^\n]+)/i)?.[1]
    ?.replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();
  if (!color || color.length > 40 || /image|shown|picture|photo/.test(color)) return 'as shown';
  return color;
};

const readType = (name) => {
  const words = name.toLowerCase().split(/\s+/).reverse();
  return words.find((word) => PRODUCT_TYPES.includes(word)) || 'jacket';
};

// Cards show "<model> <type>", so drop a type word the name already ends with.
const readModel = (name, type) => {
  const suffix = new RegExp(`\\s+${type}$`, 'i');
  const model = name.replace(suffix, '').trim();
  return model || name;
};

const downloadImage = async (imagePath) => {
  const file = `pairo-${path.basename(new URL(imagePath, SOURCE).pathname)}`;
  const target = path.join(config.uploadDir, file);
  try {
    await fs.access(target);
  } catch {
    const response = await get(imagePath.startsWith('http') ? imagePath : `${SOURCE}${imagePath}`);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
    await sleep(DELAY_MS);
  }
  return { id: file, name: file, src: `/uploads/${file}` };
};

const importProduct = async (source, feedItem, index) => {
  const baseSku = (feedItem?.mpn || `PLS${String(index + 1).padStart(4, '0')}`)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
  if (await prisma.product.findFirst({ where: { baseSku }, select: { id: true } })) {
    return 'skipped';
  }

  const description = truncate(
    await fetchDescription(source.slug, feedItem?.description),
    2000
  );
  const images = [];
  for (const imagePath of source.images) images.push(await downloadImage(imagePath));
  if (images.length === 0) throw new Error('no images');

  const { sizes, inventory } = readSizes(source);
  const price = Number(source.price);
  const type = readType(source.name);
  const savedId = await saveProduct({
    product: {
      model: readModel(source.name, type),
      type,
      collection: 'jackets',
      description: description || source.name,
      sku: baseSku,
      sizes,
      tags: (source.categories || [])
        .map((category) => category.name)
        .filter((name) => name && name.toLowerCase() !== 'new arrival'),
    },
    variants: [
      {
        color: readColor(description),
        currentPrice: price,
        actualPrice: Math.max(Number(source.compareAtPrice) || price, price),
        inventory,
        images,
      },
    ],
    images,
  });

  // Keep the source URL slug instead of "<name> <type>".
  const slug = slugify(source.slug);
  const taken = await prisma.product.findFirst({
    where: { slug, NOT: { id: savedId } },
    select: { id: true },
  });
  if (!taken) await prisma.product.update({ where: { id: savedId }, data: { slug } });
  return 'imported';
};

const run = async () => {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  await fs.mkdir(config.uploadDir, { recursive: true });
  const listing = await (await get(`${SOURCE}/api/products`)).json();
  const feed = parseFeed(await (await get(`${SOURCE}/feed.xml`)).text());
  const products = listing.all.filter((product) => product.status === 'Published').slice(0, limit);
  console.log(`Found ${products.length} products`);

  const counts = { imported: 0, skipped: 0, failed: 0 };
  for (const [index, source] of products.entries()) {
    try {
      const result = await importProduct(source, feed.get(source.slug), index);
      counts[result]++;
      console.log(`[${index + 1}/${products.length}] ${result}: ${source.name}`);
    } catch (err) {
      counts.failed++;
      console.error(`[${index + 1}/${products.length}] FAILED ${source.name}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`Done. imported=${counts.imported} skipped=${counts.skipped} failed=${counts.failed}`);
};

run()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
