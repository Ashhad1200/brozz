# React Shopping Cart (frontend)

The storefront and admin UI, built with React 18 and Vite. All data comes from the
Express + PostgreSQL API in [`../server`](../server); see the
[root README](../README.md) for full setup.

Originally based on [jp-quintana/react-shopping-cart](https://github.com/jp-quintana/react-shopping-cart),
a clone of https://alphaleteathletics.com. The Firebase backend has been replaced
by the API.

## Features

- Product grid with filters, sorting and infinite scroll
- Product pages with colors and sizes
- Guest carts that carry over when you sign up or log in
- Stock checks on every cart change and at checkout
- Email/password accounts, profile and address book
- Mock checkout (no card details are stored, only the last four digits) and order history
- Admin: create, edit and delete products and variants, upload images, seed demo data

## Development

```bash
npm install
npm run dev      # http://localhost:5173
```

The API must be running on `http://localhost:8000`. Vite proxies `/api` and
`/uploads` to it, so no extra configuration is needed. To point at a different
API, set `VITE_API_PROXY` (dev proxy target) or `VITE_API_URL` (base URL baked into
the build). See `.env.example`.

```bash
npm run build    # outputs to dist/, which the API serves in production
```

## Where things live

- `src/api/client.js`: fetch wrapper and session token storage
- `src/context/*`: auth, cart, checkout and product state
- `src/hooks/*`: one hook per feature, each calling the API

## Authors

- [@jp-quintana](https://github.com/jp-quintana), original frontend
