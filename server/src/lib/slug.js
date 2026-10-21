// "Hoodie De Gira" -> "hoodie-de-gira"
const slugify = (value) =>
  value
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Product URLs are "<product-slug>-<color-slug>" and the frontend splits on the
// last dash, so a color slug must never contain one: "light blue" -> "lightblue".
const colorSlug = (color) => slugify(color).replace(/-/g, '');

module.exports = { slugify, colorSlug };
