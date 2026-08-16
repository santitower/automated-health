# NutriPlan Instacart agent

This local companion uses Playwright to add an approved NutriPlan grocery list to the user’s own Instacart cart. It launches a visible, dedicated Chromium profile, remembers the user’s Instacart login, and stops on the cart page for review. It never submits checkout or payment.

This companion was integrated from [cmedipally7/instacart-agent](https://github.com/cmedipally7/instacart-agent) and adapted for NutriPlan's authenticated, persistent application. The local server, validation, origin restrictions, installers, tests, and cart-review safeguards are maintained here.

The agent listens only on `127.0.0.1:4545`. Browser requests are restricted to the production NutriPlan origin and local development origins. Store URLs, item names, package quantities, request size, and concurrent runs are validated before Playwright is allowed to act.

## One-time setup

Open the installer for the computer from the [`v0.3.0 release`](https://github.com/santitower/automated-health/releases/tag/instacart-agent-v0.3.0). The installer downloads a private Node.js runtime and Playwright Chromium browser, installs the companion, starts it immediately, and configures automatic startup. No Node/npm setup, API keys, or existing browser installation are required.

- macOS: open `NutriPlan-Instacart-Agent-v0.3.0.pkg` and approve the normal macOS installer prompt.
- Windows: open `Install-NutriPlan-Instacart-Agent.cmd`. It performs the installation in the current user account.
- Linux: run the downloaded `install-linux.sh`. It installs a per-user systemd service.

Operating systems do not allow a website to install native software silently, so the one installer approval cannot be removed. Everything after that approval is automatic.

The first store request opens the private Chromium window. Sign into Instacart and set the delivery address there once; the profile is reused on later runs.

## Development

```bash
npm install
npm test
npm run serve
```

Endpoints:

- `GET /health` reports agent availability without opening Chrome.
- `GET /stores` opens/reuses Chrome and lists stores for the active delivery address.
- `POST /add` accepts `{ "storeHref": "/store/aldi/storefront", "items": [{ "query": "oat milk", "quantity": 1 }] }`, adds best-effort top matches, and opens the cart.

To add another trusted frontend, start the agent with an exact comma-separated allowlist:

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.example npm run serve
```

Instacart’s page structure can change, so product matching and selectors remain best-effort. Always review product, size, quantity, price, and dietary suitability in the cart before checkout.
