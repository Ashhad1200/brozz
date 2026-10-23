# Database backup

`brozz-catalog.sql` is a `pg_dump` of the schema plus the catalog data (products,
variants, skus, migration history). Users, addresses, carts, orders and newsletter
rows are deliberately left out.

Product images are not in the dump. They live in `server/uploads/` (gitignored);
`npm run import-pairo` in `server/` downloads them again.

Restore into an empty database:

```bash
psql "$DATABASE_URL" -f db-backup/brozz-catalog.sql
cd server && npm run create-admin -- you@example.com 'YourPassw0rd!'
```
