const ALLOWED_TOKENS = [
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"  // CAKE
];
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

async function isRateLimited(ip) {
  const key = `ratelimit:proxy:${ip}`;
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    const count = data.result;
    
    if (count === 1) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/expire/${key}/60`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      });
    }
    return count > 40;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || "unknown";
  if (await isRateLimited(ip)) return res.status(429).json({ error: "Trop de requêtes. Attendez 1 minute." });

  try {
    const { module, action, address, contractaddress, offset } = req.query;
    let rpcPayload;

    if (!address || !ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: "Format d'adresse invalide." });
    }

    if (contractaddress) {
      if (!ALLOWED_TOKENS.includes(contractaddress.toLowerCase())) {
        return res.status(400).json({ error: "Ce contrat de jeton n'est pas autorisé." });
      }
    }

    let safeOffset = 10;
    if (offset) {
      const parsedOffset = parseInt(offset);
      if (isNaN(parsedOffset) || parsedOffset < 1 || parsedOffset > 100) {
        return res.status(400).json({ error: "Paramètre offset invalide." });
      }
      safeOffset = parsedOffset;
    }

    if (module === 'account' && action === 'balance') {
      rpcPayload = { jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 };
    } else if (module === 'account' && action === 'tokenbalance') {
      const data = `0x70a08231000000000000000000000000${address.slice(2)}`;
      rpcPayload = { jsonrpc: '2.0', method: 'eth_call', params: [{ to: contractaddress, data: data }, 'latest'], id: 1 };
    } else if (module === 'account' && action === 'tokentx') {
      const maxCountHex = "0x" + safeOffset.toString(16);
      const rpcPayloadTx = { jsonrpc: '2.0', method: 'nr_getAssetTransfers', params: [{ fromAddress: address, category: ["20"], maxCount: maxCountHex, order: "desc" }], id: 1 };
      
      const response = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcPayloadTx)
      });
      const data = await response.json();
      if (data.error || !data.result || !data.result.transfers) return res.status(200).json({ status: "1", message: "OK", result: [] });
      return res.status(200).json({ status: "1", message: "OK", result: data.result.transfers });
    } else {
      return res.status(400).json({ error: "Requête non supportée" });
    }

    const response = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcPayload)
    });
    const data = await response.json();
    return res.status(200).json({ status: "1", message: "OK", result: data.result || "0" });
  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
}