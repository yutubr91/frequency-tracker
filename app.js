"use strict";
const $ = (id) => document.getElementById(id);
const PROXY_BASE = "/api/proxy";
const MY_WALLET = "VOTRE_ADRESSE_BEP20_ICI"; // 🔴 REMPLACEZ CECI PAR VOTRE VRAIE ADRESSE

let isCreator = false;
let clickCount = 0;
let clickTimer;

async function checkPremiumStatus() {
  const savedWallet = localStorage.getItem("freq_current_wallet");
  if (!savedWallet) return;
  try {
    const res = await fetch(`/api/check-premium?address=${savedWallet}`);
    const data = await res.json();
    if (data.isPremium) console.log("Statut Premium confirmé.");
  } catch (e) { console.warn("Impossible de vérifier le statut Premium."); }
}

document.addEventListener("DOMContentLoaded", () => {
  checkPremiumStatus();
  
  const chatWindow = $("chatWindow");
  const orbBtn = $("orbBtn");
  const chatInput = $("chatInput");

  if (chatWindow) chatWindow.style.display = "none";

  if (orbBtn) {
    orbBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (chatWindow.style.display === "none") {
        chatWindow.style.display = "flex";
        chatInput.focus();
      } else {
        chatWindow.style.display = "none";
      }
    });
  }

  if ($("closeChat")) {
    $("closeChat").addEventListener("click", () => { chatWindow.style.display = "none"; });
  }

  const logo = document.querySelector(".brand-mark");
  if (logo) {
    logo.addEventListener("click", () => {
      clickCount++;
      clearTimeout(clickTimer);
      if (clickCount >= 5) { promptCreatorPassword(); clickCount = 0; } 
      else { clickTimer = setTimeout(() => { clickCount = 0; }, 2000); }
    });
  }
});

async function promptCreatorPassword() {
  if (isCreator) {
    if (confirm("Voulez-vous désactiver le mode Créateur ?")) { isCreator = false; resetCreatorStyle(); }
    return;
  }
  const pass = prompt("🔒 Entrez le code secret Créateur :");
  if (!pass) return;
  try {
    const res = await fetch("/api/check-creator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass }) });
    const data = await res.json();
    if (data.success) { isCreator = true; alert("👑 Code correct !"); applyCreatorStyle(); } 
    else { alert("❌ Erreur : " + (data.error || "Code incorrect.")); }
  } catch (e) { alert("Erreur de vérification avec le serveur."); }
}

function applyCreatorStyle() {
  const proBtn = $("openPricingBtn");
  if (proBtn) { proBtn.innerHTML = "👑 Compte Créateur"; proBtn.style.background = "linear-gradient(110deg, #ffd700, #ff8c00)"; proBtn.style.color = "#000"; proBtn.style.boxShadow = "0 0 15px rgba(255, 215, 0, 0.5)"; }
}
function resetCreatorStyle() {
  const proBtn = $("openPricingBtn");
  if (proBtn) { proBtn.innerHTML = "✨ Passer Pro"; proBtn.style.background = ""; proBtn.style.color = ""; proBtn.style.boxShadow = ""; }
}

const translations = {
  fr: { hero_eyebrow: "TABLEAU DE BORD BEP-20", hero_title: "Ton portefeuille.<br><em>En un coup d'œil.</em>", hero_desc: "Colle une adresse publique et visualise tes soldes.", tracker_title: "Analyser une adresse", tracker_label: "Adresse publique BEP-20", btn_analyze: "Analyser", btn_clear: "Effacer", res_value: "Valeur estimée", res_tokens: "Jetons", res_bep20: "Jetons BEP-20", th_token: "Jeton", th_balance: "Solde", aff_title: "Échangez vos cryptos", aff_desc: "Créez un compte sur Binance.", aff_btn: "S'inscrire ↗", chat_title: "Assistante IA", chat_welcome: "Salut ! Pose-moi une question.", chat_placeholder: "Posez votre question..." },
  en: { hero_eyebrow: "BEP-20 DASHBOARD", hero_title: "Your wallet.<br><em>At a glance.</em>", hero_desc: "Paste a public address and see balances.", tracker_title: "Analyze", tracker_label: "Address", btn_analyze: "Analyze", btn_clear: "Clear", res_value: "Estimated Value", res_tokens: "Tokens", res_bep20: "BEP-20 Tokens", th_token: "Token", th_balance: "Balance", aff_title: "Trade crypto", aff_desc: "Create a Binance account.", aff_btn: "Sign Up ↗", chat_title: "AI Assistant", chat_welcome: "Hi! Ask me anything.", chat_placeholder: "Ask..." },
  es: { hero_eyebrow: "PANEL BEP-20", hero_title: "Tu cartera.<br><em>De un vistazo.</em>", hero_desc: "Pega una dirección pública.", tracker_title: "Analizar", tracker_label: "Dirección", btn_analyze: "Analizar", btn_clear: "Borrar", res_value: "Valor estimado", res_tokens: "Tokens", res_bep20: "Tokens BEP-20", th_token: "Token", th_balance: "Saldo", aff_title: "Cambia cripto", aff_desc: "Crea una cuenta en Binance.", aff_btn: "Registrarse ↗", chat_title: "Asistente IA", chat_welcome: "¡Hola! Pregúntame.", chat_placeholder: "Pregunta..." }
};

let currentLang = localStorage.getItem("freq_lang") || "fr";
function applyLanguage(lang) {
  currentLang = lang; localStorage.setItem("freq_lang", lang); document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { const key = el.getAttribute("data-i18n"); if (translations[lang] && translations[lang][key]) el.innerHTML = translations[lang][key]; });
}
$("langSelect").addEventListener("change", (e) => { applyLanguage(e.target.value); });

const themeToggle = $("themeToggle");
const htmlElement = document.documentElement;
const savedTheme = localStorage.getItem("freq_theme") || "dark";
htmlElement.setAttribute("data-theme", savedTheme);
themeToggle.textContent = savedTheme === "dark" ? "🌙" : "☀️";
themeToggle.addEventListener("click", () => {
  const newTheme = htmlElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  htmlElement.setAttribute("data-theme", newTheme); localStorage.setItem("freq_theme", newTheme);
  themeToggle.textContent = newTheme === "dark" ? "🌙" : "☀️";
});

window.addEventListener("load", () => {
  if (isCreator) applyCreatorStyle();
  setTimeout(() => { const s = $("splash-screen"); if(s) { s.classList.add("hidden"); setTimeout(()=>s.remove(), 600); } }, 2800);
});

function addMessage(text, sender) {
  const chatMessages = $("chatMessages");
  const div = document.createElement("div"); div.className = `msg ${sender}`; div.textContent = text;
  chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
  const chatInput = $("chatInput");
  const chatMessages = $("chatMessages");
  const text = chatInput.value.trim(); if (!text) return;
  
  addMessage(text, "user"); chatInput.value = "";
  const loadingDiv = document.createElement("div"); loadingDiv.className = "msg bot"; loadingDiv.textContent = "..."; chatMessages.appendChild(loadingDiv); chatMessages.scrollTop = chatMessages.scrollHeight;
  
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, lang: currentLang }) });
    const data = await res.json();
    chatMessages.removeChild(loadingDiv);
    if (!res.ok) addMessage(`Erreur ${res.status} : ${data.reply || data.error || "Le serveur a planté"}`, "bot");
    else addMessage(data.reply || "Erreur de format", "bot");
  } catch (e) { 
    chatMessages.removeChild(loadingDiv); addMessage("Erreur réseau (Vercel ne répond pas).", "bot"); 
  }
}
$("sendChat").addEventListener("click", sendChatMessage); $("chatInput").addEventListener("keypress", (e) => { if (e.key === "Enter") sendChatMessage(); });

const pricingModal = $("pricingModal");
$("openPricingBtn").addEventListener("click", () => { pricingModal.hidden = false; });
$("closePricingBtn").addEventListener("click", () => { pricingModal.hidden = true; });
pricingModal.addEventListener("click", (e) => { if (e.target === pricingModal) pricingModal.hidden = true; });

const paymentModal = $("paymentModal");
window.openPayment = function(planName, priceInEuro) {
  const bnbAmount = (priceInEuro / 550).toFixed(4); 
  $("cryptoAmount").textContent = `${bnbAmount} BNB`;
  $("walletAddress").value = MY_WALLET;
  $("qrCodeImg").src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${MY_WALLET}`;
  const currentAddr = $("addressInput").value.trim();
  if (currentAddr.length === 42) $("userWalletInput").value = currentAddr;
  pricingModal.hidden = true; paymentModal.hidden = false;
};

$("closePaymentBtn").addEventListener("click", () => { paymentModal.hidden = true; });
$("copyAddressBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("walletAddress").value);
  $("copyAddressBtn").textContent = "Copié !";
  setTimeout(() => { $("copyAddressBtn").textContent = "Copier"; }, 2000);
});

window.verifyPayment = async function() {
  const txHash = $("txHashInput").value.trim();
  const userWallet = $("userWalletInput").value.trim();
  if (txHash.length < 60) return alert("Hash invalide.");
  if (userWallet.length !== 42) return alert("Adresse de portefeuille invalide.");

  const btn = $("confirmPaymentBtn");
  btn.textContent = "Vérification..."; btn.disabled = true;
  try {
    const res = await fetch("/api/verify-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash, userWallet }) });
    const data = await res.json();
    if (data.success) { alert("🎉 Paiement validé !"); localStorage.setItem("freq_current_wallet", userWallet); paymentModal.hidden = true; } 
    else { alert("❌ Erreur : " + (data.error || "Paiement invalide.")); }
  } catch (e) { alert("Erreur de connexion au serveur."); } 
  finally { btn.textContent = "Vérifier le paiement"; btn.disabled = false; }
};

async function apiGet(params) {
  const url = new URL(PROXY_BASE, window.location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const res = await fetch(url.toString(), { credentials: "omit" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

const TOKENS = [
  { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  { symbol: "BUSD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
  { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 }
];
const PRICES = { USDT: 1, USDC: 1, BUSD: 1, CAKE: 2.5, BNB: 550 };
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function formatAmount(raw, decimals, symbol) {
  const n = Number(raw) / Math.pow(10, decimals); if (!isFinite(n) || n === 0) return "0 " + symbol;
  return n.toLocaleString(currentLang, { maximumFractionDigits: 6 }) + " " + symbol;
}

async function analyzeAddress(address) {
  $("statusMessage").textContent = "Analyse en cours…";
  try {
    const bnbRes = await apiGet({ module: "account", action: "balance", address });
    const bnbRaw = bnbRes.result || "0"; const bnbAmount = Number(bnbRaw) / 1e18;
    $("bnbBalance").textContent = formatAmount(bnbRaw, 18, "BNB"); let totalUsd = bnbAmount * PRICES.BNB; const detected = [];
    for (const t of TOKENS) {
      await new Promise(r => setTimeout(r, 200)); const res = await apiGet({ module: "account", action: "tokenbalance", contractaddress: t.address, address });
      const raw = res.result || "0"; const amount = Number(raw) / Math.pow(10, t.decimals);
      if (amount > 0) { totalUsd += amount * (PRICES[t.symbol] || 0); detected.push({ ...t, raw, amount }); }
    }
    renderResults(totalUsd, detected); $("statusMessage").textContent = "Analyse terminée.";
  } catch (e) { $("statusMessage").textContent = "Erreur : " + e.message; }
}

function renderResults(totalUsd, tokens) {
  $("resultsGrid").hidden = false; $("tokensSection").hidden = false; $("affiliateBanner").hidden = false;
  $("totalUsd").innerHTML = totalUsd.toLocaleString(currentLang, { maximumFractionDigits: 2 }) + " <small>USD</small>"; $("tokenCount").textContent = String(tokens.length);
  const tbody = $("tokenRows"); tbody.innerHTML = "";
  if (tokens.length === 0) { tbody.innerHTML = `<tr><td colspan="2" class="muted">Aucun jeton.</td></tr>`; } 
  else { tokens.forEach(t => { 
    const tr = document.createElement("tr");
    const td1 = document.createElement("td"); const strong = document.createElement("strong"); strong.textContent = t.symbol; td1.appendChild(strong);
    const td2 = document.createElement("td"); td2.textContent = formatAmount(t.raw, t.decimals, t.symbol);
    tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr); 
  }); }
}

$("analyzeBtn").addEventListener("click", () => { const addr = $("addressInput").value.trim(); if (!ADDRESS_RE.test(addr)) { $("statusMessage").textContent = "Adresse invalide."; return; } analyzeAddress(addr); });
$("clearBtn").addEventListener("click", () => { $("addressInput").value = ""; $("statusMessage").textContent = ""; $("resultsGrid").hidden = true; $("tokensSection").hidden = true; $("affiliateBanner").hidden = true; });

applyLanguage(currentLang); $("langSelect").value = currentLang;