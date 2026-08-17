"use client";

import { useState } from "react";
import {
  buildInstacartCart,
  disconnectInstacartBrowser,
  loadInstacartStores,
  pauseInstacartBrowser,
  startInstacartBrowser,
} from "./instacart-sandbox-actions";
import type { GroceryHandoff } from "./planner";

type AgentStatus =
  | "idle"
  | "starting"
  | "browser-open"
  | "loading-stores"
  | "ready"
  | "adding"
  | "done"
  | "pausing"
  | "error";
type InstacartStore = { href: string; name: string };
type InstacartResult = { query: string; added: boolean; matchedName?: string; reason?: string; quantity?: number };
type CartSummary = { requested: number; added: number; skipped: number };

export default function InstacartAgentPanel({ items }: { items: GroceryHandoff["items"] }) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [liveUrl, setLiveUrl] = useState("");
  const [stores, setStores] = useState<InstacartStore[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [results, setResults] = useState<InstacartResult[]>([]);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [error, setError] = useState("");

  async function startBrowser() {
    setStatus("starting");
    setError("");
    setResults([]);
    setSummary(null);

    const browserWindow = window.open("about:blank", "nutriplan-instacart");
    if (browserWindow) {
      browserWindow.document.title = "Starting private Instacart browser";
      browserWindow.document.body.textContent = "NutriPlan is starting your private Instacart browser…";
    }

    const response = await startInstacartBrowser();
    if (!response.ok) {
      browserWindow?.close();
      setStatus("error");
      setError(response.error);
      return;
    }

    setLiveUrl(response.data.liveUrl);
    setStatus("browser-open");
    if (browserWindow) {
      browserWindow.opener = null;
      browserWindow.location.replace(response.data.liveUrl);
    }
  }

  function openLiveBrowser() {
    if (liveUrl) window.open(liveUrl, "nutriplan-instacart", "noopener,noreferrer");
  }

  async function loadStores() {
    setStatus("loading-stores");
    setError("");
    setResults([]);
    setSummary(null);
    const response = await loadInstacartStores();
    if (!response.ok) {
      setStatus("error");
      setError(response.error);
      return;
    }
    if (!response.data.stores.length) {
      setStatus("error");
      setError("No stores were found. Set your delivery address in the private Instacart browser, then try again.");
      return;
    }
    setStores(response.data.stores);
    setSelectedStore(response.data.stores[0].href);
    setStatus("ready");
  }

  async function buildCart() {
    if (!selectedStore || !items.length) return;
    setStatus("adding");
    setError("");
    setResults([]);
    setSummary(null);
    const response = await buildInstacartCart({
      storeHref: selectedStore,
      items: items.map((item) => ({ query: item.name, quantity: 1 })),
    });
    if (!response.ok) {
      setStatus("error");
      setError(response.error);
      return;
    }
    setResults(response.data.results);
    setSummary(response.data.summary);
    setStatus("done");
    openLiveBrowser();
  }

  async function pauseBrowser() {
    setStatus("pausing");
    const response = await pauseInstacartBrowser();
    if (!response.ok) {
      setStatus("error");
      setError(response.error);
      return;
    }
    setStatus("idle");
    setLiveUrl("");
  }

  async function disconnectBrowser() {
    if (!window.confirm("Disconnect Instacart and erase its saved browser session? You will need to sign in again next time.")) return;
    setStatus("pausing");
    const response = await disconnectInstacartBrowser();
    if (!response.ok) {
      setStatus("error");
      setError(response.error);
      return;
    }
    setStatus("idle");
    setLiveUrl("");
    setStores([]);
    setSelectedStore("");
    setResults([]);
    setSummary(null);
  }

  const active = Boolean(liveUrl) && status !== "idle";
  const statusLabel = status === "starting"
    ? "Starting"
    : status === "loading-stores" || status === "adding" || status === "pausing"
      ? "Working"
      : active
        ? "Private browser ready"
        : "Not started";

  return (
    <section className="instacart-agent" aria-labelledby="instacart-agent-title">
      <div className="agent-heading">
        <div>
          <span className="eyebrow">PRIVATE PLAYWRIGHT BROWSER</span>
          <h3 id="instacart-agent-title">Build this cart in Instacart</h3>
        </div>
        <span className={`agent-state ${active ? "connected" : status}`}>
          <i />{statusLabel}
        </span>
      </div>

      {status === "idle" && (
        <div className="agent-setup">
          <strong>Nothing installs on this computer</strong>
          <p>NutriPlan starts an isolated Playwright browser only when you need it. Its encrypted viewer uses a rotating key, pauses after five minutes, and keeps a saved Instacart session for no more than 24 hours.</p>
          <button className="agent-primary" type="button" onClick={startBrowser}>
            Start private Instacart browser →
          </button>
        </div>
      )}

      {status === "starting" && (
        <div className="agent-working" role="status"><i /><span><strong>Preparing Playwright and Chromium…</strong><small>The first free session can take about a minute. Later sessions resume faster.</small></span></div>
      )}

      {status === "browser-open" && (
        <div className="agent-session">
          <strong>Sign in with your Instacart email and password</strong>
          <p>Avoid Google or Apple sign-in so this browser never accesses a broader account. NutriPlan does not store or log what you type, and password saving is disabled. Set your delivery address there too.</p>
          <div className="agent-actions">
            <button className="agent-secondary" type="button" onClick={openLiveBrowser}>Reopen private browser ↗</button>
            <button className="agent-primary" type="button" onClick={loadStores}>I’m signed in · find my stores →</button>
          </div>
        </div>
      )}

      {status === "loading-stores" && (
        <div className="agent-working" role="status"><i /><span><strong>Reading stores for your delivery address…</strong><small>Keep the private browser open if Instacart asks you to confirm anything.</small></span></div>
      )}

      {(status === "ready" || status === "adding" || status === "done") && (
        <div className="agent-cart-controls">
          <label>
            <span>Store for this cart</span>
            <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)} disabled={status === "adding"}>
              {stores.map((store) => <option key={store.href} value={store.href}>{store.name}</option>)}
            </select>
          </label>
          <button className="agent-primary" type="button" onClick={buildCart} disabled={!selectedStore || !items.length || status === "adding"}>
            {status === "adding" ? `Adding ${items.length} items…` : status === "done" ? "Rebuild cart" : `Add ${items.length} items to cart →`}
          </button>
          {liveUrl && <button className="agent-secondary" type="button" onClick={openLiveBrowser}>Open private browser ↗</button>}
        </div>
      )}

      {status === "adding" && (
        <div className="agent-working" role="status"><i /><span><strong>Building your cart item by item…</strong><small>NutriPlan will stop at the Instacart cart for your review.</small></span></div>
      )}

      {summary && (
        <div className="agent-summary" role="status">
          <strong>{summary.added} of {summary.requested} matched</strong>
          <span>{summary.skipped ? `${summary.skipped} need your review` : "Cart ready for review"}</span>
        </div>
      )}

      {results.length > 0 && (
        <ul className="agent-results" aria-label="Instacart matching results">
          {results.map((result, index) => (
            <li key={`${result.query}-${index}`} className={result.added ? "added" : "skipped"}>
              <span>{result.added ? "✓" : "!"}</span>
              <div><strong>{result.query}</strong><small>{result.added ? result.matchedName ?? "Added" : result.reason ?? "Needs manual review"}</small></div>
            </li>
          ))}
        </ul>
      )}

      {status === "done" && (
        <div className="agent-actions">
          <button className="agent-secondary" type="button" onClick={openLiveBrowser}>Review cart in Instacart ↗</button>
          <button className="agent-secondary" type="button" onClick={pauseBrowser}>Pause and save session</button>
        </div>
      )}

      {status === "pausing" && (
        <div className="agent-working" role="status"><i /><span><strong>Saving and pausing your browser…</strong><small>Your Instacart session will resume next time.</small></span></div>
      )}

      {status === "error" && (
        <div className="agent-error" role="alert">
          <p>{error}</p>
          <div className="agent-actions">
            {liveUrl && <button type="button" onClick={openLiveBrowser}>Open private browser</button>}
            {liveUrl && <button type="button" onClick={loadStores}>Try finding stores again</button>}
            {!liveUrl && <button type="button" onClick={startBrowser}>Try starting again</button>}
          </div>
        </div>
      )}

      {liveUrl && status !== "pausing" && (
        <button className="agent-disconnect" type="button" onClick={disconnectBrowser}>Disconnect and erase Instacart session</button>
      )}
      <small className="agent-disclaimer">Playwright runs in an isolated, access-controlled browser and pauses automatically. Disconnect and erase when you are finished. Always review product, size, quantity, price, and dietary fit. NutriPlan never checks out or enters payment.</small>
    </section>
  );
}
