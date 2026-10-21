// End-to-end: newsletter, profile edit and address book against the API.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const email = `account-${Date.now()}@example.com`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const problems = [];
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to fetch')) {
    problems.push(`console: ${msg.text()}`);
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
    await page.screenshot({ path: `${SHOTS}FAIL-account-${name.replace(/\W+/g, '_')}.png` });
    console.error(err.message.split('\n').slice(0, 6).join('\n'));
    console.error('Problems so far:', problems);
    await browser.close();
    process.exit(1);
  }
};

const api = (path) =>
  page.evaluate(async (p) => {
    const token = localStorage.getItem('brozz.token');
    const res = await fetch(`/api${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  }, path);

await step('newsletter signup from the footer', async () => {
  await page.goto(BASE);
  await page.getByPlaceholder('Your email address').fill(email);
  await page.getByPlaceholder('Your email address').press('Enter');
  await page.getByText('Thanks for joining!').waitFor({ timeout: 15000 });
});

await step('sign up', async () => {
  await page.goto(`${BASE}/account/signup`);
  const form = page.locator('form', { has: page.locator('h2') });
  await form.locator('input').nth(0).fill('Sam');
  await form.locator('input').nth(1).fill('Lee');
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').first().fill('Secret123!');
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('signup'), { timeout: 15000 });
});

await step('edit profile name and phone', async () => {
  await page.goto(`${BASE}/account`);
  await page.getByRole('button', { name: /edit info/i }).click();
  await page.getByPlaceholder('Name', { exact: true }).fill('Samantha');
  await page.locator('form input').nth(2).fill('5551234');
  await page.locator('button[form="form"][type="submit"]').click();
  await page.getByText('Samantha Lee').first().waitFor({ timeout: 15000 });
  const { user } = await api('/auth/me');
  if (user.name !== 'Samantha' || user.phoneNumber !== '5551234') {
    throw new Error(`profile not saved: ${JSON.stringify(user)}`);
  }
});

const addAddress = async (street, primary) => {
  await page.getByRole('button', { name: /add new address/i }).click();
  await page.getByText('Add Address:').waitFor();
  const form = page.locator('form#form');
  await form.getByPlaceholder('Name', { exact: true }).fill('Sam');
  await form.getByPlaceholder('Last Name').fill('Lee');
  await form.locator('input[type="tel"]').fill('5550000');
  await form.getByPlaceholder('Address').fill(street);
  await form.getByPlaceholder('City').fill('Austin');
  await form.getByPlaceholder('State').fill('TX');
  await form.getByPlaceholder('Zip Code').fill('73301');
  if (primary) await form.locator('input[type="checkbox"]').check();
  await page.locator('button[form="form"][type="submit"]').click();
  await page.getByText(street).first().waitFor({ timeout: 15000 });
};

await step('add two addresses, the second one as primary', async () => {
  await page.goto(`${BASE}/account/addresses`);
  await page.getByText('No addresses added yet').waitFor({ timeout: 15000 });
  await addAddress('10 First Ave', false);
  await addAddress('20 Second Ave', true);
  const { user } = await api('/auth/me');
  const order = user.addresses.map((a) => [a.address, a.isMain]);
  if (JSON.stringify(order) !== JSON.stringify([['20 Second Ave', true], ['10 First Ave', false]])) {
    throw new Error(`unexpected address order ${JSON.stringify(order)}`);
  }
  await page.screenshot({ path: `${SHOTS}13-addresses.png` });
});

await step('delete the primary address promotes the other one', async () => {
  const primaryCard = page.locator('div', { hasText: 'Primary address' }).filter({ hasText: '20 Second Ave' }).last();
  await primaryCard.locator('svg').last().click();
  await page.waitForFunction(() => !document.body.innerText.includes('20 Second Ave'), null, { timeout: 15000 });
  const { user } = await api('/auth/me');
  if (user.addresses.length !== 1 || !user.addresses[0].isMain) {
    throw new Error(`unexpected addresses ${JSON.stringify(user.addresses)}`);
  }
});

await browser.close();
console.log(problems.length ? `\nProblems:\n${problems.join('\n')}` : '\nNo console errors or failed API calls.');
process.exit(problems.length ? 1 : 0);
