const fs = require('fs/promises');
const path = require('path');

const config = require('../config');
const { prisma, toNumber } = require('../db/prisma');
const { badRequest, notFound, conflict } = require('../lib/errors');
const {
  cleanString,
  isUuid,
  toNonNegativeInt,
  toNonNegativeNumber,
} = require('../lib/validate');
const { slugify, colorSlug } = require('../lib/slug');

const PRODUCT_COLLECTIONS = ['t-shirts', 'hoodies-sweatshirts', 'accessories'];
const SIZE_CODES = { s: 'SM', m: 'MD', l: 'LG', xl: 'XL', xxl: 'XX', os: 'OS' };

const readImage = (image) => {
  if (!image || typeof image.src !== 'string' || !image.src) {
    throw badRequest('Every image needs a src');
  }
  return {
    id: String(image.id || image.name || image.src),
    name: String(image.name || path.basename(image.src)),
    src: image.src,
  };
};

const readProductInput = ({ product = {}, variants, images = [] }) => {
  const collection = cleanString(product.collection, 'Collection');
  if (!PRODUCT_COLLECTIONS.includes(collection)) {
    throw badRequest(`Collection must be one of: ${PRODUCT_COLLECTIONS.join(', ')}`);
  }

  const sizes = Array.isArray(product.sizes)
    ? [...new Set(product.sizes.map((size) => String(size).toLowerCase()))]
    : [];
  if (sizes.length === 0) throw badRequest('Select at least one size');
  for (const size of sizes) {
    if (!SIZE_CODES[size]) throw badRequest(`Unknown size "${size}"`);
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw badRequest('Add at least one variant');
  }

  const seenColors = new Set();
  const cleanVariants = variants.map((variant, index) => {
    const label = `Variant ${index + 1}`;
    const color = cleanString(variant.color, `${label} color`, { max: 40 }).toLowerCase();
    if (!colorSlug(color)) throw badRequest(`${label} color is not valid`);
    if (seenColors.has(colorSlug(color))) {
      throw badRequest(`Two variants share the color "${color}"`);
    }
    seenColors.add(colorSlug(color));

    const price = toNonNegativeNumber(variant.currentPrice, `${label} current price`);
    const actualPrice = toNonNegativeNumber(variant.actualPrice, `${label} actual price`);
    if (price > actualPrice) {
      throw badRequest(`${label} current price can't be higher than its actual price`);
    }

    const variantImages = Array.isArray(variant.images)
      ? variant.images.map(readImage)
      : [];
    if (variantImages.length === 0) {
      throw badRequest(`${label} needs at least one image`);
    }

    const inventory = {};
    for (const size of sizes) {
      inventory[size] = toNonNegativeInt(
        variant.inventory?.[size] ?? 0,
        `${label} ${size.toUpperCase()} stock`
      );
    }

    return {
      id: isUuid(variant.id) ? variant.id : null,
      color,
      colorDisplay: cleanString(variant.colorDisplay, `${label} display color`, {
        required: false,
        max: 40,
      })?.toLowerCase() || null,
      price,
      actualPrice,
      images: variantImages,
      inventory,
    };
  });

  return {
    model: cleanString(product.model, 'Model', { max: 100 }).toLowerCase(),
    type: cleanString(product.type, 'Type', { max: 100 }).toLowerCase(),
    collection,
    description: cleanString(product.description, 'Description', { max: 2000 }),
    fit: cleanString(product.fit, 'Fit', { required: false, max: 40 })?.toLowerCase() || null,
    baseSku: cleanString(product.sku, 'Base SKU', { max: 20 })
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
    tags: Array.isArray(product.tags)
      ? product.tags
          .map((tag) => String(tag?.content ?? tag).trim().toLowerCase())
          .filter(Boolean)
          .map((content) => ({ content }))
      : [],
    sizes,
    images: images.map(readImage),
    variants: cleanVariants,
  };
};

const skuCode = (baseSku, color, size) => {
  const words = color.split(' ');
  const colorCode =
    words.length > 1
      ? words[0].slice(0, 1) + words[1].slice(0, 2)
      : color.slice(0, 3);
  return `${baseSku}-${colorCode}-${SIZE_CODES[size]}`.toUpperCase();
};

// Picks a slug no other product uses: "hoodie-de-gira", then "hoodie-de-gira-2"...
const uniqueSlug = async (tx, base, productId) => {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await tx.product.findFirst({
      where: { slug, ...(productId ? { NOT: { id: productId } } : {}) },
      select: { id: true },
    });
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
};

const syncVariants = async (tx, productId, input) => {
  const existing = await tx.variant.findMany({
    where: { productId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row) => row.id));
  const keptIds = [];

  for (const [position, variant] of input.variants.entries()) {
    const data = {
      color: variant.color,
      colorDisplay: variant.colorDisplay,
      price: variant.price,
      actualPrice: variant.actualPrice,
      images: variant.images,
      position,
    };

    const variantId =
      variant.id && existingIds.has(variant.id)
        ? (await tx.variant.update({ where: { id: variant.id }, data })).id
        : (await tx.variant.create({ data: { ...data, productId } })).id;
    keptIds.push(variantId);

    // Drop SKUs for sizes that were removed, then upsert the rest by size so
    // SKU ids (and the carts pointing at them) survive edits.
    await tx.sku.deleteMany({
      where: { variantId, size: { notIn: input.sizes } },
    });

    for (const [sizePosition, size] of input.sizes.entries()) {
      const code = skuCode(input.baseSku, variant.color, size);
      const quantity = variant.inventory[size];

      const taken = await tx.sku.findFirst({
        where: { sku: code, NOT: { variantId, size } },
        select: { id: true },
      });
      if (taken) {
        throw conflict(
          `SKU ${code} is already used by another product. Choose a different base SKU.`
        );
      }

      const current = await tx.sku.findFirst({
        where: { variantId, size },
        select: { id: true },
      });
      if (current) {
        await tx.sku.update({
          where: { id: current.id },
          data: { sku: code, quantity, position: sizePosition },
        });
      } else {
        await tx.sku.create({
          data: { productId, variantId, sku: code, size, quantity, position: sizePosition },
        });
      }
    }
  }

  await tx.variant.deleteMany({
    where: { productId, id: { notIn: keptIds } },
  });
};

// Removes uploaded files that no product or variant references any more.
const removeUnusedUploads = async (images) => {
  for (const image of images) {
    if (!image.src.startsWith('/uploads/')) continue;
    const reference = { array_contains: [{ src: image.src }] };
    const [inProducts, inVariants] = await Promise.all([
      prisma.product.count({ where: { images: reference } }),
      prisma.variant.count({ where: { images: reference } }),
    ]);
    if (inProducts + inVariants === 0) {
      const file = path.join(config.uploadDir, path.basename(image.src));
      await fs.rm(file, { force: true });
    }
  }
};

const saveProduct = async (body, productId = null) => {
  const input = readProductInput(body);

  let previousImages = [];
  const id = await prisma.$transaction(async (tx) => {
    const data = {
      slug: await uniqueSlug(tx, slugify(`${input.model} ${input.type}`), productId),
      model: input.model,
      type: input.type,
      collection: input.collection,
      description: input.description,
      fit: input.fit,
      baseSku: input.baseSku,
      sizes: input.sizes,
      tags: input.tags,
      images: input.images,
    };

    let savedId = productId;
    if (productId) {
      // Lock the product so concurrent edits apply one after the other.
      const [current] = await tx.$queryRaw`
        SELECT images FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      if (!current) throw notFound('Product not found');
      previousImages = current.images;

      await tx.product.update({ where: { id: productId }, data });
    } else {
      savedId = (await tx.product.create({ data })).id;
    }

    await syncVariants(tx, savedId, input);
    return savedId;
  });

  const keptSrcs = new Set(input.images.map((image) => image.src));
  await removeUnusedUploads(
    previousImages.filter((image) => !keptSrcs.has(image.src))
  );

  return id;
};

// The shape the admin edit form is initialised from.
const getProductForEdit = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { skus: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!product) throw notFound('Product not found');

  const sizesInput = { s: false, m: false, l: false, xl: false, xxl: false };
  for (const size of product.sizes) sizesInput[size] = true;

  return {
    id: product.id,
    slug: product.slug,
    model: product.model,
    type: product.type,
    collection: product.collection,
    description: product.description,
    fit: product.fit,
    baseSku: product.baseSku,
    tags: product.tags,
    sizes: product.sizes,
    sizesInput,
    images: product.images,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      color: variant.color,
      colorDisplay: variant.colorDisplay || '',
      currentPrice: toNumber(variant.price),
      actualPrice: toNumber(variant.actualPrice),
      images: variant.images,
      inventory: Object.fromEntries(
        variant.skus.map((sku) => [sku.size, sku.quantity])
      ),
    })),
  };
};

const deleteProduct = async (productId) => {
  const deleted = await prisma.product.deleteMany({ where: { id: productId } });
  if (deleted.count === 0) throw notFound('Product not found');
};

const deleteProductAndUploads = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { images: true },
  });
  if (!product) throw notFound('Product not found');
  await deleteProduct(productId);
  await removeUnusedUploads(product.images);
};

// Deletes one variant; deleting the last variant deletes the whole product.
const deleteVariant = async (productId, variantId) => {
  const productDeleted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.variant.deleteMany({
      where: { id: variantId, productId },
    });
    if (count === 0) throw notFound('Variant not found');

    return (await tx.variant.count({ where: { productId } })) === 0;
  });

  if (productDeleted) await deleteProductAndUploads(productId);
  return { productDeleted };
};

module.exports = {
  PRODUCT_COLLECTIONS,
  saveProduct,
  getProductForEdit,
  deleteProduct: deleteProductAndUploads,
  deleteVariant,
  removeUnusedUploads,
};
