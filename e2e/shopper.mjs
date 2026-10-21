// End-to-end: browse -> add to bag as guest -> sign up -> checkout -> order in account.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const email = `shopper-${Date.now()}@example.com`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const problems = [];
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
});
// Requests cancelled by navigating away are expected; anything else is not.
page.on('requestfailed', (req) => {
  if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
    problems.push(`request failed: ${req.url()} ${req.failure()?.errorText}`);
  }
});
page.on('response', (res) => {
  if (res.url().includes('/api/') && res.status() >= 500) {
    problems.push(`HTTP ${res.status()} ${res.url()}`);
  }
});

const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    await page.screenshot({ path: `${SHOTS}FAIL-${name.replace(/\W+/g, '_')}.png` });
    console.error(err.message.split('\n').slice(0, 6).join('\n'));
    console.error('Problems so far:', problems);
    await browser.close();
    process.exit(1);
  }
};

// The login/signup form (the footer also has a newsletter form).
const authForm = () => page.locator('form', { has: page.locator('h2') });

const cartCount = () =>
  page.evaluate(async () => {
    const token = localStorage.getItem('brozz.token');
    const res = await fetch('/api/cart', { headers: { Authorization: `Bearer ${token}` } });
    const { items } = await res.json();
    return items.reduce((n, i) => n + i.quantity, 0);
  });

await step('home page renders product cards from Postgres', async () => {
  await page.goto(BASE);
  await page.getByText('New Arrivals').waitFor();
  await page.locator('img[src^="/uploads/"]').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}01-home.png` });
});

await step('collection page lists hoodies', async () => {
  await page.goto(`${BASE}/collections/hoodies-sweatshirts`);
  await page.getByText('de gira hoodie').first().waitFor({ timeout: 15000 });
  await page.getByText('buzo', { exact: false }).first().waitFor();
  await page.screenshot({ path: `${SHOTS}02-collection.png` });
});

await step('product page shows sizes and discounted price', async () => {
  await page.goto(`${BASE}/products/de-gira-hoodie-negro`);
  await page.getByRole('button', { name: 'SELECT SIZE' }).waitFor({ timeout: 15000 });
  await page.getByText('$45.00').first().waitFor();
  await page.getByText('$55.00').first().waitFor();
  await page.screenshot({ path: `${SHOTS}03-product.png` });
});

await step('guest adds size M to the bag', async () => {
  await page.getByText('M', { exact: true }).first().click();
  await page.getByRole('button', { name: 'ADD M TO BAG' }).click();
  await page.waitForFunction(async () => {
    const token = localStorage.getItem('brozz.token');
    const res = await fetch('/api/cart', { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()).items.length === 1;
  });
  if ((await cartCount()) !== 1) throw new Error('cart should have 1 item');
});

await step('cart page shows the item', async () => {
  await page.goto(`${BASE}/cart`);
  await page.getByText('de gira hoodie', { exact: false }).first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}04-cart.png` });
});

await step('checkout as guest redirects to login', async () => {
  await page.goto(`${BASE}/checkout`);
  await page.waitForURL('**/account/login');
});

await step('sign up keeps the guest cart', async () => {
  await page.goto(`${BASE}/account/signup`);
  const inputs = authForm().locator('input');
  await inputs.first().waitFor();
  await inputs.nth(0).fill('Jane');
  await inputs.nth(1).fill('Doe');
  await authForm().locator('input[type="email"]').fill(email);
  await authForm().locator('input[type="password"]').first().fill('Secret123!');
  await page.screenshot({ path: `${SHOTS}05-signup.png` });
  await authForm().locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('signup'), { timeout: 15000 });
  if ((await cartCount()) !== 1) throw new Error('cart lost after signup');
});

await step('checkout: shipping info with a new address', async () => {
  await page.goto(`${BASE}/checkout`);
  await page.locator('input[name="email"]').waitFor({ timeout: 15000 });
  await page.locator('input[name="name"]').fill('Jane');
  await page.locator('input[name="lastName"]').fill('Doe');
  await page.locator('input[name="address"]').fill('1 Main St');
  await page.locator('input[name="city"]').fill('New York');
  await page.locator('input[name="state"]').fill('NY');
  await page.locator('input[name="zipCode"]').fill('10001');
  await page.locator('input[name="phoneNumber"]').fill('5550100');
  await page.screenshot({ path: `${SHOTS}06-shipping-info.png` });
  await page.locator('button[type="submit"]').first().click();
});

await step('checkout: choose expedited shipping', async () => {
  await page.locator('input[value="expedited"]').waitFor({ timeout: 15000 });
  await page.locator('input[value="expedited"]').check({ force: true });
  await page.screenshot({ path: `${SHOTS}07-shipping-option.png` });
  await page.locator('button[type="submit"]').first().click();
});

await step('checkout: pay and land on the account page', async () => {
  await page.getByPlaceholder('Card number').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Card number').fill('4242424242424242');
  await page.getByPlaceholder('Name on card').fill('Jane Doe');
  await page.getByPlaceholder('Expiration Date (MM/YY)').fill('1299');
  await page.getByPlaceholder('Security code').fill('123');
  await page.screenshot({ path: `${SHOTS}08-payment.png` });
  await page.locator('button[form="form"][type="submit"]').click();
  await page.waitForURL('**/account', { timeout: 15000 });
});

await step('account page lists the order and the cart is empty', async () => {
  await page.getByText('Your orders').waitFor({ timeout: 15000 });
  await page.getByText(/Order #/).first().click();
  await page.getByText('4242').first().waitFor();
  await page.screenshot({ path: `${SHOTS}09-order.png` });
  if ((await cartCount()) !== 0) throw new Error('cart not cleared after order');
});

await step('log out, then log back in', async () => {
  await page.goto(`${BASE}/account`);
  await page.getByText(/log ?out/i).first().click();
  await page.waitForFunction(() => !location.pathname.startsWith('/account') || location.pathname.includes('login'));
  await page.goto(`${BASE}/account/login`);
  await authForm().locator('input[type="email"]').fill(email);
  await authForm().locator('input[type="password"]').fill('Secret123!');
  await authForm().locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 15000 });
  await page.goto(`${BASE}/account`);
  await page.getByText('Your orders').waitFor({ timeout: 15000 });
});

await step('wrong password shows an error toast', async () => {
  await page.goto(`${BASE}/account`);
  await page.getByText(/log ?out/i).first().click();
  await page.goto(`${BASE}/account/login`);
  await authForm().locator('input[type="email"]').fill(email);
  await authForm().locator('input[type="password"]').fill('Wrong123!');
  await authForm().locator('button[type="submit"]').click();
  await page.getByText('User/password is incorrect!').waitFor({ timeout: 15000 });
});

await browser.close();
const relevant = problems.filter(
  (p) =>
    !p.includes('Failed to fetch') && // logged for the aborted requests above
    !p.includes('User/password is incorrect!') && // the deliberate bad login
    !p.includes('401')
);
console.log(relevant.length ? `\nProblems:\n${relevant.join('\n')}` : '\nNo console errors or server errors.');
process.exit(relevant.length ? 1 : 0);
