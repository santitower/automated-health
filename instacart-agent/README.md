# NutriPlan Instacart agent

This local companion uses Playwright to add an approved NutriPlan grocery list to the user’s own Instacart cart. It launches a visible, dedicated Google Chrome profile, remembers the user’s Instacart login, and stops on the cart page for review. It never submits checkout or payment.

This companion was integrated from [cmedipally7/instacart-agent](https://github.com/cmedipally7/instacart-agent) and adapted for NutriPlan's authenticated, persistent application. The local server, validation, origin restrictions, installers, tests, and cart-review safeguards are maintained here.

The agent listens only on `127.0.0.1:4545`. Browser requests are restricted to the production NutriPlan origin and local development origins. Store URLs, item names, package quantities, request size, and concurrent runs are validated before Playwright is allowed to act.

## One-time setup

Download and unzip [`NutriPlan-Instacart-Agent-v0.2.0.zip`](https://github.com/santitower/automated-health/releases/download/instacart-agent-v0.2.0/NutriPlan-Instacart-Agent-v0.2.0.zip). Google Chrome and Node.js 22 or newer are required.

- macOS: open `Install NutriPlan Instacart Agent.command`. It installs a per-user LaunchAgent and starts automatically at login.
- Windows: right-click `Install-NutriPlanInstacartAgent.ps1`, choose **Run with PowerShell**, and approve the prompt. It adds a minimized per-user startup launcher.
- Linux: run `bash install-linux.sh`. It installs a per-user systemd service.

For a temporary macOS session without auto-start, open `Start NutriPlan Instacart Agent.command` and keep its Terminal window open.

The first store request opens Chrome. Sign into Instacart and set the delivery address in that dedicated window once; the profile is reused on later runs.

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
