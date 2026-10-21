// End-to-end: admin logs in, creates a product with an uploaded image, sees it
// in the storefront, edits it, then deletes it.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const IMAGE = new URL('../server/seed-images/productos-remera-ojos-negra-1.jpg', import.meta.url).pathname;
const MODEL = `e2e${Date.now() % 100000}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const problems = [];
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to fetch')) {
    problems.push(`console: ${msg.text()}`);
  }
});
page.on('requestfailed', (req) => {
  if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
    problems.push(`request failed: ${req.url()}`);
  }
});
page.on('response', (res) => {
  if (res.url().includes('/api/') && res.status() >= 400) {
    problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
  }
});

const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    await page.screenshot({ path: `${SHOTS}FAIL-admin-${name.replace(/\W+/g, '_')}.png`, fullPage: true });
    console.error(err.message.split('\n').slice(0, 6).join('\n'));
    console.error('Problems so far:', problems);
    await browser.close();
    process.exit(1);
  }
};

const authForm = () => page.locator('form', { has: page.locator('h2') });
const label = (text) => page.locator('label', { hasText: text });

await step('customers are kept out of /admin', async () => {
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(`${BASE}/`);
});

await step('admin logs in and sees the Admin link', async () => {
  await page.goto(`${BASE}/account/login`);
  await authForm().locator('input[type="email"]').fill(process.env.E2E_ADMIN_EMAIL || 'admin@brozz.test');
  await authForm().locator('input[type="password"]').fill(process.env.E2E_ADMIN_PASSWORD || 'Admin123!');
  await authForm().locator('button[type="submit"]').click();
  await page.getByRole('link', { name: 'Admin' }).waitFor({ timeout: 15000 });
});

await step('admin panel seed button reports an existing catalog', async () => {
  await page.goto(`${BASE}/admin`);
  await page.getByText('Seed Data').click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByText('Catalog already has products; nothing seeded.').waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: 'Add Product' }).waitFor();
});

await step('admin product list shows seeded variants', async () => {
  await page.goto(`${BASE}/admin/products`);
  await page.getByText('Admin Products/Variants').waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: 'Edit' }).first().waitFor({ timeout: 15000 });
  const cards = await page.getByRole('link', { name: 'Edit' }).count();
  if (cards < 6) throw new Error(`expected at least 6 variant cards, got ${cards}`);
  await page.screenshot({ path: `${SHOTS}10-admin-list.png` });
});

await step('fill the new product form and upload an image', async () => {
  await page.goto(`${BASE}/admin/products/add`);
  await page.locator('input[type="file"]').setInputFiles(IMAGE);
  await page.getByText('1 File Has Been Uploaded').waitFor({ timeout: 15000 });
  await page.locator('img[src^="/uploads/"]').first().waitFor();

  await label('Model:').locator('input').fill(MODEL);
  await label('Type:').locator('input').fill('tee');
  await label('Collection:').locator('select').selectOption('t-shirts');
  await label('Description:').locator('textarea').fill('Made by the end-to-end test.');
  await label('SKU:').locator('input').fill(`T${MODEL.slice(3)}`);
  await page.locator('input[type="checkbox"][value="s"]').check();
  await page.locator('input[type="checkbox"][value="m"]').check();
});

await step('add a variant with prices, stock and the image', async () => {
  await page.getByRole('button', { name: /Add Variant/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const row = page.locator('tbody tr').first();
  await row.locator('td').nth(2).locator('input').fill('verde');
  const numbers = page.locator('tbody input[type="number"]');
  await numbers.nth(0).fill('18');
  await numbers.nth(1).fill('24');
  await numbers.nth(2).fill('4');
  await numbers.nth(3).fill('2');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('li', { hasText: 'productos-remera-ojos-negra-1.jpg' }).first().click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('1 File selected').waitFor();

  await page.screenshot({ path: `${SHOTS}11-admin-variant.png`, fullPage: true });
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
});

await step('create the product and return to the list', async () => {
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('**/admin/products', { timeout: 15000 });
  await page.getByText(`${MODEL} tee`, { exact: false }).first().waitFor({ timeout: 15000 });
});

await step('new product appears in the t-shirts collection and its page works', async () => {
  await page.goto(`${BASE}/collections/t-shirts`);
  await page.getByText(`${MODEL} tee`, { exact: false }).first().waitFor({ timeout: 15000 });
  await page.goto(`${BASE}/products/${MODEL}-tee-verde`);
  await page.getByText('$18.00').first().waitFor({ timeout: 15000 });
  await page.getByText('$24.00').first().waitFor();
  await page.screenshot({ path: `${SHOTS}12-new-product.png` });
});

await step('edit the product price', async () => {
  await page.goto(`${BASE}/admin/products`);
  const card = page.locator('div', { hasText: `${MODEL} tee` }).filter({ has: page.getByRole('link', { name: 'Edit' }) }).last();
  await card.getByRole('link', { name: 'Edit' }).click();
  await page.waitForURL('**/admin/products/*');
  await page.getByText('Edit Product').waitFor({ timeout: 15000 });
  if ((await label('Model:').locator('input').inputValue()) !== MODEL) {
    throw new Error('edit form not initialised from the API');
  }

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('tbody input[type="number"]').nth(0).fill('12');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForURL('**/admin/products', { timeout: 15000 });

  await page.goto(`${BASE}/products/${MODEL}-tee-verde`);
  await page.getByText('$12.00').first().waitFor({ timeout: 15000 });
});

await step('delete the product from the admin list', async () => {
  await page.goto(`${BASE}/admin/products`);
  const card = page.locator('div', { hasText: `${MODEL} tee` }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForFunction(
    (model) => !document.body.innerText.toLowerCase().includes(`${model} tee`),
    MODEL,
    { timeout: 15000 }
  );
  const res = await page.request.get(`${BASE}/api/products/slug/${MODEL}-tee-verde`);
  if (res.status() !== 404) throw new Error(`product still served: ${res.status()}`);
});

await browser.close();
const relevant = problems.filter((p) => !p.includes('HTTP 401'));
console.log(relevant.length ? `\nProblems:\n${relevant.join('\n')}` : '\nNo console errors or failed API calls.');
process.exit(relevant.length ? 1 : 0);
