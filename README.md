# Hangies

A clothing store: a React storefront with an admin area, backed by an Express API
and PostgreSQL.

| Folder | What it is |
|---|---|
| [`react-shopping-cart/`](react-shopping-cart) | Frontend: React 18 + Vite |
| [`server/`](server) | API: Node.js + Express + PostgreSQL via Prisma ORM |
| [`e2e/`](e2e) | Browser tests (Playwright) that drive the real UI |
| `Backend/` | Legacy MongoDB API. Nothing uses it; kept for reference. |

## Quick start

You need Node.js 18+ and PostgreSQL 13+.

**1. Create a database**

```bash
createuser -P brozz          # choose a password
createdb -O brozz brozz
createdb -O brozz brozz_test # only needed to run the API tests
```

**2. Configure and start the API**

```bash
cd server
cp .env.example .env         # set DATABASE_URL and a long random JWT_SECRET
npm install                  # also generates the Prisma client
npm run seed                 # applies migrations, loads the demo catalog
npm run create-admin -- you@example.com 'YourPassw0rd!'
npm run dev                  # http://localhost:8000
```

**3. Start the frontend**

```bash
cd react-shopping-cart
npm install
npm run dev                  # http://localhost:5173
```

Log in with the admin account to see the **Admin** link in the header.

## Production

Build the frontend, then run the API. It serves the built app and the API from one
port:

```bash
cd react-shopping-cart && npm run build
cd ../server && NODE_ENV=production npm start
```

Set `CORS_ORIGINS` if the frontend is served from a different origin. Uploaded images
are written to `server/uploads/`, so keep that directory on persistent storage.

## Tests

```bash
cd server && npm test        # API integration tests (uses TEST_DATABASE_URL, wipes it)

# Browser tests: with the API and frontend running and an admin account created
cd e2e && npm install && npx playwright install chromium
E2E_ADMIN_EMAIL=you@example.com E2E_ADMIN_PASSWORD='YourPassw0rd!' npm test
```

The browser suite runs through:
- **Shopper:** browse, add to bag as a guest, sign up, check out, see the order, log out and back in.
- **Account:** newsletter, profile edit, address book.
- **Admin:** create a product with an uploaded image, see it in the store, edit it, delete it.

## How it works

**Sessions.** Every visitor gets a JWT. Guests are anonymous user rows, so they can
hold a cart. Signing up upgrades the guest in place, and logging in merges the guest
cart into the account.

**Stock.** Cart changes lock the SKU row (`SELECT … FOR UPDATE`). Placing an order
re-checks every line inside one transaction, so stock can't be oversold. If stock ran
out, the cart is trimmed and the shopper is told.

**Prices and shipping** are computed on the server. The client never sends a total.

**Payments are mocked.** The card is checked for shape and expiry, and only the
cardholder name and last four digits are stored.

### Database (Prisma)

The schema lives in [`server/prisma/schema.prisma`](server/prisma/schema.prisma), and
migrations live in `server/prisma/migrations/`. `npm start`, `npm run dev` and
`npm run seed` apply pending migrations automatically (`prisma migrate deploy`).

Tables: `users`, `addresses`, `products`, `variants`, `skus` (stock per size),
`cart_items`, `checkout_sessions`, `orders` (items and addresses are snapshotted),
`newsletter_subscribers`.

| Task | Command (in `server/`) |
|---|---|
| Change the schema | edit `schema.prisma`, then `npm run db:migrate -- --name what_changed` |
| Apply migrations (deploy) | `npm run db:deploy` |
| Browse data | `npm run db:studio` |

Prisma's query builder handles almost everything. The exceptions are the stock
checks in cart and checkout, which use `$queryRaw` with `SELECT … FOR UPDATE`
inside `prisma.$transaction`, because Prisma has no row-lock API. The CHECK
constraints (no negative stock or prices) are added by hand in the first migration,
since Prisma's schema language can't express them.

### API

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/guest` · `/signup` · `/login` | none / guest |
| GET | `/api/auth/me` | any session |
| PUT | `/api/auth/password` | account |
| GET | `/api/products?collection=&sort=&direction=&offset=&limit=` | none |
| GET | `/api/products/slug/:slug-:color` | none |
| GET, DELETE | `/api/cart` · POST `/api/cart/items` · POST `/api/cart/items/:skuId/decrement` · DELETE `/api/cart/items/:skuId` · POST `/api/cart/check` | any session |
| PATCH | `/api/account/profile` · POST/PUT/DELETE `/api/account/addresses[/:id]` | account |
| GET | `/api/checkout` · PUT `/api/checkout/shipping-info` · PUT `/api/checkout/shipping-option` | account |
| GET, POST | `/api/orders` | account |
| POST | `/api/newsletter` | none |
| * | `/api/admin/products[/:id[/variants/:variantId]]` · `/api/admin/uploads` · POST `/api/admin/seed` | admin |
