"use client";

import { useEffect, useState } from "react";
import type { GroceryHandoff } from "./planner";

type AgentStatus = "checking" | "offline" | "online" | "loading-stores" | "ready" | "adding" | "done" | "error";
type InstacartStore = { href: string; name: string };
type InstacartResult = { query: string; added: boolean; matchedName?: string; reason?: string; quantity?: number };
type CartSummary = { requested: number; added: number; skipped: number };

const AGENT_URL = process.env.NEXT_PUBLIC_INSTACART_AGENT_URL ?? "http://127.0.0.1:4545";
const AGENT_DOWNLOAD_URL = "https://github.com/santitower/automated-health/releases/download/instacart-agent-v0.2.0/NutriPlan-Instacart-Agent-v0.2.0.zip";
const AGENT_SETUP_URL = "https://github.com/santitower/automated-health/tree/master/instacart-agent#one-time-setup";

export default function InstacartAgentPanel({ items }: { items: GroceryHandoff["items"] }) {
  const [status, setStatus] = useState<AgentStatus>("checking");
  const [stores, setStores] = useState<InstacartStore[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [results, setResults] = useState<InstacartResult[]>([]);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestAgent<{ ok: boolean }>("/health", undefined, 1800)
      .then(() => { if (!cancelled) setStatus("online"); })
      .catch(() => { if (!cancelled) setStatus("offline"); });
    return () => { cancelled = true; };
  }, []);

  async function checkConnection() {
    setStatus("checking");
    setError("");
    try {
      await requestAgent("/health", undefined, 2500);
      setStatus("online");
    } catch {
      setStatus("offline");
      setError("The local agent is not running yet. Install or start it on this computer, then retry.");
    }
  }

  async function loadStores() {
    setStatus("loading-stores");
    setError("");
    setResults([]);
    setSummary(null);
    try {
      const data = await requestAgent<{ stores: InstacartStore[] }>("/stores", undefined, 120000);
      if (!data.stores.length) {
        setStatus("error");
        setError("No stores were found. Sign into Instacart and set your delivery address in the Chrome window, then try again.");
        return;
      }
      setStores(data.stores);
      setSelectedStore(data.stores[0].href);
      setStatus("ready");
    } catch (agentError) {
      setStatus("error");
      setError(messageFrom(agentError));
    }
  }

  async function buildCart() {
    if (!selectedStore || !items.length) return;
    setStatus("adding");
    setError("");
    setResults([]);
    setSummary(null);
    try {
      const data = await requestAgent<{ results: InstacartResult[]; summary: CartSummary }>("/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeHref: selectedStore,
          items: items.map((item) => ({ query: item.name, quantity: 1 })),
        }),
      }, 10 * 60 * 1000);
      setResults(data.results);
      setSummary(data.summary);
      setStatus("done");
    } catch (agentError) {
      setStatus("error");
      setError(messageFrom(agentError));
    }
  }

  const connected = status !== "checking" && status !== "offline";

  return (
    <section className="instacart-agent" aria-labelledby="instacart-agent-title">
      <div className="agent-heading">
        <div>
          <span className="eyebrow">LOCAL PLAYWRIGHT AGENT</span>
          <h3 id="instacart-agent-title">Build this cart in Instacart</h3>
        </div>
        <span className={`agent-state ${connected ? "connected" : status}`}>
          <i />{status === "checking" ? "Checking" : connected ? "Connected" : "Not running"}
        </span>
      </div>

      {status === "offline" && (
        <div className="agent-setup">
          <strong>One-time setup on this computer</strong>
          <p>Download and unzip the companion, then run the installer for this computer. It starts automatically at login and keeps your Instacart login in its own local Chrome profile.</p>
          <div>
            <a href={AGENT_DOWNLOAD_URL}>Download local agent ↓</a>
            <a href={AGENT_SETUP_URL} target="_blank" rel="noreferrer">Setup help ↗</a>
            <button type="button" onClick={checkConnection}>I started it · retry</button>
          </div>
        </div>
      )}

      {status === "online" && (
        <button className="agent-primary" type="button" onClick={loadStores}>
          Open Instacart and find my stores →
        </button>
      )}

      {status === "loading-stores" && (
        <div className="agent-working" role="status"><i /><span><strong>Opening your Instacart Chrome…</strong><small>Sign in or confirm your delivery address there if prompted.</small></span></div>
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
        </div>
      )}

      {status === "adding" && (
        <div className="agent-working" role="status"><i /><span><strong>Building your cart item by item…</strong><small>Keep the Chrome window open. NutriPlan will stop at cart review.</small></span></div>
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

      {status === "error" && (
        <div className="agent-error" role="alert"><p>{error}</p><button type="button" onClick={checkConnection}>Check agent again</button></div>
      )}

      {error && status === "offline" && <p className="agent-inline-error" role="alert">{error}</p>}
      <small className="agent-disclaimer">Best-effort product matching only. Review product, size, quantity, price, and dietary fit in Instacart before checkout. The agent never checks out or enters payment.</small>
    </section>
  );
}

async function requestAgent<T>(path: string, init?: RequestInit, timeout = 30000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      cache: "no-store",
      mode: "cors",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The local agent responded ${response.status}.`);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The local agent took too long to respond. Check its Chrome window and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("The local Instacart agent could not be reached on this computer.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The local Instacart agent could not complete this request.";
}
