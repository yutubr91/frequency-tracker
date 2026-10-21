"use strict";

const $ = (id) => document.getElementById(id);

// ⚠️ REMPLACEZ PAR L'URL DE VOTRE WORKER CLOUDFLARE
const PROXY_BASE = "https://frequency-tracker-api.YOUR-SUBDOMAIN.workers.dev";
const SW_HASH_ENDPOINT = PROXY_BASE + "/sw-hash";

const TOKENS = [
  { symbol: "USDT", name: "Tether USD",      address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { symbol: "USDC", name: "USD Coin",        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  { symbol: "BUSD", name: "Binance USD",     address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
  { symbol: "CAKE", name: "PancakeSwap",     address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
  { symbol: "BTCB", name: "Bitcoin BEP-20",  address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
  { symbol: "ETH",  name: "Ethereum BEP-20", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
];
const PRICES = Object.freeze({ USDT: 1, USDC: 1, BUSD: 1, CAKE: 2.5, BTCB: 60000, ETH: 3000, BNB: 550 });
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_RECENT = 5;
const LS_KEY = "freq_recent_addrs";

function formatAmount(raw, decimals, symbol) {
  const n = Number(raw) / Math.pow(10, decimals);
  if (!isFinite(n) || n === 0) return "0 " + symbol;
  if (n < 0.000001) return "< 0.000001 " + symbol;
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 6 }) + " " + symbol;
}

function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.children) opts.children.forEach(c => c && node.appendChild(c));
  return node;
}

const safeStorage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
function rememberAddress(addr) {
  const list = safeStorage.get(LS_KEY).filter(a => typeof a === "string" && ADDRESS_RE.test(a));
  safeStorage.set(LS_KEY, [addr, ...list.filter(a => a !== addr)].slice(0, MAX_RECENT));
}

function getTurnstileToken() {
  try { return window.turnstile?.getResponse() || ""; } catch { return ""; }
}

async function apiGet(params) {
  const url = new URL(PROXY_BASE);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const headers = {};
  const tok = getTurnstileToken();
  if (tok) headers["X-Turnstile-Token"] = tok;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(url.toString(), { method: "GET", headers, signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } finally { clearTimeout(t); }

  if (res.status === 429) {
    const ra = res.headers.get("Retry-After") || "60";
    throw new Error(`Trop de requêtes. Réessayez dans ${ra}s.`);
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.detail === "turnstile-timeout" || body.detail === "turnstile-error") {
      throw new Error("Le service de vérification est momentanément indisponible. Réessayez dans une minute.");
    }
    if (body.error === "Turnstile token required") {
      throw new Error("Vérification de sécurité manquante. Rechargez la page.");
    }
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.status === "0" && !/No .* found/i.test(data.message || "")) throw new Error(data.message || "Erreur API");
  return data;
}

const fetchNativeBalance = (address) => apiGet({ module: "account", action: "balance", address, tag: "latest" }).then(d => d.result || "0");
const fetchTokenBalance = (address, contract) => apiGet({ module: "account", action: "tokenbalance", contractaddress: contract, address, tag: "latest" }).then(d => d.result || "0");
const fetchTokenTransfers = (address) => apiGet({ module: "account", action: "tokentx", address, startblock: 0, endblock: 99999999, page: 1, offset: 10, sort: "desc" }).then(d => d.result || []);

async function analyzeAddress(address) {
  $("statusMessage").textContent = "Analyse en cours…";
  if (!window.turnstile || !getTurnstileToken()) {
    $("statusMessage").textContent = "Vérification de sécurité indisponible. Désactivez votre bloqueur de publicité ou rechargez la page.";
    return;
  }
  try {
    const bnbRaw = await fetchNativeBalance(address);
    const bnbAmount = Number(bnbRaw) / 1e18;
    $("bnbBalance").textContent = formatAmount(bnbRaw, 18, "BNB");
    let totalUsd = bnbAmount * (PRICES.BNB || 0);

    const detected = [];
    for (const t of TOKENS) {
      await new Promise(r => setTimeout(r, 220));
      const raw = await fetchTokenBalance(address, t.address);
      const amount = Number(raw) / Math.pow(10, t.decimals);
      if (amount > 0) { totalUsd += amount * (PRICES[t.symbol] || 0); detected.push({ ...t, raw, amount }); }
    }
    await new Promise(r => setTimeout(r, 220));
    const transfers = await fetchTokenTransfers(address);

    renderResults(address, totalUsd, detected, transfers);
    rememberAddress(address);
    $("statusMessage").textContent = "Analyse terminée. Données publiques on-chain.";
    if (window.turnstile) window.turnstile.reset();
  } catch (e) {
    const msg = e.name === "AbortError" ? "Délai dépassé. Réessayez." : "Erreur : " + e.message;
    $("statusMessage").textContent = msg;
    if (window.turnstile) window.turnstile.reset();
  }
}

function renderAddressFull(address) {
  const wrap = $("addressShort");
  wrap.textContent = "";
  const span = el("span", { className: "addr-full", text: address });
  span.setAttribute("title", address);
  wrap.appendChild(span);
}

function renderResults(address, totalUsd, tokens, transfers) {
  $("resultsGrid").hidden = false;
  $("tokensSection").hidden = false;
  $("txSection").hidden = false;

  const totalNode = $("totalUsd");
  totalNode.textContent = "";
  totalNode.appendChild(document.createTextNode(totalUsd.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " "));
  totalNode.appendChild(el("small", { text: "USD" }));

  renderAddressFull(address);
  $("tokenCount").textContent = String(tokens.length);
  $("txCount").textContent = String(transfers.length);
  $("lastUpdate").textContent = "Mis à jour " + new Date().toLocaleTimeString("fr-FR");

  const tbody = $("tokenRows");
  tbody.textContent = "";
  if (tokens.length === 0) {
    const tr = el("tr");
    tr.appendChild(el("td", { text: "Aucun jeton parmi la liste suivie.", className: "muted", attrs: { colspan: "3" } }));
    tbody.appendChild(tr);
  } else {
    for (const t of tokens) {
      const tr = el("tr");
      const td = el("td");
      td.appendChild(el("strong", { text: t.symbol }));
      td.appendChild(el("br"));
      td.appendChild(el("span", { text: t.name, className: "muted small" }));
      tr.appendChild(td);
      tr.appendChild(el("td", { text: formatAmount(t.raw, t.decimals, t.symbol) }));
      tr.appendChild(el("td", { text: t.address, className: "muted small addr-full" }));
      tbody.appendChild(tr);
    }
  }

  const txList = $("txList");
  txList.textContent = "";
  if (transfers.length === 0) {
    txList.appendChild(el("p", { text: "Aucune transaction BEP-20 récente.", className: "muted" }));
  } else {
    for (const tx of transfers) {
      const decimals = Number(tx.tokenDecimal) || 18;
      const value = Number(tx.value) / Math.pow(10, decimals);
      const isRecv = (tx.to || "").toLowerCase() === address.toLowerCase();
      const dir = isRecv ? "▼ reçu" : "▲ envoyé";
      const date = new Date(Number(tx.timeStamp) * 1000).toLocaleString("fr-FR");
      const sym = typeof tx.tokenSymbol === "string" ? tx.tokenSymbol.slice(0, 16) : "?";
      const hash = typeof tx.hash === "string" ? tx.hash : "—";
      
      const row = el("div", { className: "transaction-row" });
      const left = el("span");
      left.appendChild(document.createTextNode(`${dir} ${value.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${sym}`));
      left.appendChild(el("br"));
      left.appendChild(el("small", { text: date }));
      row.appendChild(left);
      row.appendChild(el("strong", { text: hash, className: "muted small tx-hash" }));
      txList.appendChild(row);
    }
  }
}

$("analyzeBtn").addEventListener("click", () => {
  const addr = $("addressInput").value.trim();
  if (!ADDRESS_RE.test(addr)) {
    $("statusMessage").textContent = "Adresse EVM invalide (42 caractères, commence par 0x).";
    return;
  }
  analyzeAddress(addr);
});

$("clearBtn").addEventListener("click", () => {
  $("addressInput").value = "";
  $("statusMessage").textContent = "";
  $("resultsGrid").hidden = true;
  $("tokensSection").hidden = true;
  $("txSection").hidden = true;
  if (window.turnstile) window.turnstile.reset();
});

$("addressInput").addEventListener("keydown", e => { if (e.key === "Enter") $("analyzeBtn").click(); });

let installPrompt;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("installBtn").hidden = false; });
$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").hidden = true;
});

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyServiceWorkerIntegrity() {
  try {
    const res = await fetch(SW_HASH_ENDPOINT, { credentials: "omit" });
    if (!res.ok) return;
    const { hash: expected } = await res.json();
    if (!expected) return;
    const swRes = await fetch("./sw.js", { cache: "no-store" });
    const swText = await swRes.text();
    const actual = await sha256Hex(swText);
    if (actual !== expected) {
      console.error("Service Worker integrity mismatch!");
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      }
    }
  } catch (e) {
    console.warn("SW integrity check skipped:", e.message);
  }
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 1) {
        for (const r of regs) if (r.scope !== reg.scope) await r.unregister();
      }
      verifyServiceWorkerIntegrity();
      setInterval(verifyServiceWorkerIntegrity, 6 * 60 * 60 * 1000);
    } catch (e) { console.warn("SW registration failed:", e.message); }
  });
}