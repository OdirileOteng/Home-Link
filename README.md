# Home Link Botswana (prototype)

Static web prototype for the Home Link system design: home page, login/register, and a separate interface for tenants, providers (landlords/agents) and administrators.

## Run locally
Open a terminal in this folder and run `python3 -m http.server 8000`, then visit http://localhost:8000.

## Publish on GitHub Pages
1. Create a new repository on GitHub (e.g. `home-link`).
2. Upload all files in this folder (Add file > Upload files), or use git.
3. Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. Your site appears at `https://<your-username>.github.io/home-link/`.

## Demo accounts
tenant@homelink.test / Tenant123!, provider@homelink.test / Provider123!, agent@homelink.test / Agent123! (unverified), admin@homelink.test / Admin123!

## Important limitation
Accounts and data are stored in the browser (localStorage), so they are not shared between devices and login is NOT secure. It demonstrates the role-based flows only. For the real system, replace `auth.js` and the storage calls in `app.html` with a backend that implements `home_link_schema.sql` (MySQL), with server-side password hashing, role checks and private storage for verification documents.
