# Home Link Botswana (prototype)
Static front end (GitHub Pages) + Supabase (PostgreSQL, Auth, Storage).

- `index.html` home, `login.html` log in / register, `app.html` + `app.js` role dashboards (tenant, provider, administrator)
- `config.js` Supabase URL and publishable key (public by design)
- `database/schema.sql` full database, security rules and storage buckets (run once in the Supabase SQL Editor)

## Make an administrator
Register on the site, then in Supabase SQL Editor run:
`update public.users set role = 'admin' where email = 'YOUR_EMAIL';`

## Notes
Security is enforced by row-level security in the database, not by the page. Never put the secret/service_role key in these files.
