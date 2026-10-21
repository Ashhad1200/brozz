const fs = require('fs/promises');
const path = require('path');

const config = require('../config');
const { prisma } = require('./prisma');
const { saveProduct } = require('../services/adminProducts');

const SEED_IMAGE_DIR = path.join(__dirname, '..', '..', 'seed-images');

const image = (file) => ({ id: file, name: file, src: `/uploads/seed-${file}` });

const stock = (amount) => ({ s: amount, m: amount, l: amount, xl: amount, xxl: amount });

const PRODUCTS = [
  {
    product: {
      model: 'de gira',
      type: 'remera',
      collection: 't-shirts',
      description: 'Heavyweight cotton tour tee with a relaxed fit.',
      fit: 'oversized',
      sku: 'RDG',
      sizes: ['s', 'm', 'l', 'xl'],
      tags: [{ content: 'new' }],
    },
    variants: [
      {
        color: 'blanca',
        currentPrice: 25,
        actualPrice: 25,
        inventory: stock(10),
        images: [
          image('productos-remera-de-gira-blanca-1.jpg'),
          image('productos-remera-de-gira-blanca-2.jpg'),
        ],
      },
    ],
  },
  {
    product: {
      model: 'ojos',
      type: 'remera',
      collection: 't-shirts',
      description: 'Graphic tee printed with the signature eyes artwork.',
      fit: 'regular',
      sku: 'ROJ',
      sizes: ['s', 'm', 'l', 'xl'],
    },
    variants: [
      {
        color: 'negra',
        currentPrice: 20,
        actualPrice: 25,
        inventory: { s: 5, m: 0, l: 3, xl: 2 },
        images: [
          image('productos-remera-ojos-negra-1.jpg'),
          image('productos-remera-ojos-negra-2.jpg'),
        ],
      },
    ],
  },
  {
    product: {
      model: 'de gira',
      type: 'hoodie',
      collection: 'hoodies-sweatshirts',
      description: 'Brushed fleece hoodie from the tour collection.',
      fit: 'oversized',
      sku: 'HDG',
      sizes: ['s', 'm', 'l', 'xl', 'xxl'],
    },
    variants: [
      {
        color: 'negro',
        currentPrice: 45,
        actualPrice: 55,
        inventory: stock(8),
        images: [
          image('productos-hoodie-de-gira-negro-1.jpg'),
          image('productos-hoodie-de-gira-negro-2.jpg'),
        ],
      },
      {
        color: 'blanco',
        currentPrice: 55,
        actualPrice: 55,
        inventory: stock(6),
        images: [
          image('productos-hoodie-de-gira-blanco-1.jpg'),
          image('productos-hoodie-de-gira-blanco-2.jpg'),
        ],
      },
    ],
  },
  {
    product: {
      model: 'flaakko',
      type: 'buzo',
      collection: 'hoodies-sweatshirts',
      description: 'Crewneck sweatshirt with an embroidered logo.',
      fit: 'regular',
      sku: 'BFL',
      sizes: ['s', 'm', 'l', 'xl'],
    },
    variants: [
      {
        color: 'negro',
        currentPrice: 40,
        actualPrice: 40,
        inventory: stock(7),
        images: [
          image('productos-buzo-flaakko-negro-1.jpg'),
          image('productos-buzo-flaakko-negro-2.jpg'),
        ],
      },
    ],
  },
  {
    product: {
      model: 'baires',
      type: 'gorro',
      collection: 'accessories',
      description: 'Ribbed knit beanie.',
      fit: 'regular',
      sku: 'GBA',
      sizes: ['os'],
    },
    variants: [
      {
        color: 'blanco',
        currentPrice: 15,
        actualPrice: 15,
        inventory: { os: 12 },
        images: [
          image('productos-gorro-baires-blanco-1.jpg'),
          image('productos-gorro-baires-blanco-2.jpg'),
        ],
      },
    ],
  },
];

// Copies seed images into the upload directory and inserts the demo catalog.
// Does nothing if the catalog already has products.
const seedProducts = async () => {
  if ((await prisma.product.count()) > 0) {
    return { seeded: 0, message: 'Catalog already has products; nothing seeded.' };
  }

  await fs.mkdir(config.uploadDir, { recursive: true });
  for (const file of await fs.readdir(SEED_IMAGE_DIR)) {
    await fs.copyFile(
      path.join(SEED_IMAGE_DIR, file),
      path.join(config.uploadDir, `seed-${file}`)
    );
  }

  for (const entry of PRODUCTS) {
    const images = entry.variants.flatMap((variant) => variant.images);
    await saveProduct({ ...entry, images });
  }

  return { seeded: PRODUCTS.length, message: `Seeded ${PRODUCTS.length} products.` };
};

if (require.main === module) {
  seedProducts()
    .then(({ message }) => {
      console.log(message);
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedProducts, PRODUCTS };
