# NutriPlan Instacart agent

This companion uses Playwright to add an approved NutriPlan grocery list to the user’s own Instacart cart. It launches a visible, dedicated Chromium profile, remembers the user’s Instacart login, and stops on the cart page for review. It never submits checkout or payment.

This companion was integrated from [cmedipally7/instacart-agent](https://github.com/cmedipally7/instacart-agent) and adapted for NutriPlan's authenticated, persistent application. The server, validation, tests, and cart-review safeguards are maintained here.

In production, NutriPlan creates one persistent Vercel Sandbox per authenticated user and runs this agent inside it. The sandbox exposes a password-protected noVNC browser for the user’s Instacart login and cart review. Its controller still listens only on `127.0.0.1:4545`, so only NutriPlan’s server-side sandbox commands can reach it. Store URLs, item names, package quantities, request size, and concurrent runs are validated before Playwright is allowed to act.

No software is installed on the user’s computer. The sandbox pauses automatically and preserves its private Chromium profile for the next run. Disconnecting Instacart from NutriPlan deletes that sandbox and the saved profile.

The older local installers remain in the repository for development and comparison, but NutriPlan no longer presents them as the production setup path.

## Development

```bash
npm install
npm test
npm run serve
```

Endpoints:

- `GET /health` reports agent availability without opening Chrome.
- `POST /open` opens/reuses Chrome and navigates to Instacart for login or review.
- `GET /stores` opens/reuses Chrome and lists stores for the active delivery address.
- `POST /add` accepts `{ "storeHref": "/store/aldi/storefront", "items": [{ "query": "oat milk", "quantity": 1 }] }`, adds best-effort top matches, and opens the cart.

To add another trusted frontend, start the agent with an exact comma-separated allowlist:

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.example npm run serve
```

Instacart’s page structure can change, so product matching and selectors remain best-effort. Always review product, size, quantity, price, and dietary suitability in the cart before checkout.
