export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { txHash, userWallet } = req.body; 
  const MY_WALLET = process.env.MY_WALLET_BEP20; 
  const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
  const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  if (!txHash || !userWallet || !ADDRESS_RE.test(userWallet) || !TX_HASH_RE.test(txHash)) {
    return res.status(400).json({ error: "Données invalides." });
  }

  try {
    const redisUrl = `${process.env.UPSTASH_REDIS_REST_URL}/set/${txHash.toLowerCase()}/true?EX=2592000&NX=true`;
    const redisSet = await fetch(redisUrl, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    const redisData = await redisSet.json();
    
    if (redisData.result === null) return res.status(400).json({ error: "Paiement déjà utilisé." });

    const rpcReceipt = { jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [txHash], id: 1 };
    const resReceipt = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcReceipt) });
    const dataReceipt = await resReceipt.json();

    if (!dataReceipt.result || dataReceipt.result.status !== "0x1") {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${txHash.toLowerCase()}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
      return res.status(400).json({ error: "Transaction échouée." });
    }

    const rpcTx = { jsonrpc: '2.0', method: 'eth_getTransactionByHash', params: [txHash], id: 1 };
    const resTx = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcTx) });
    const dataTx = await resTx.json();

    const tx = dataTx.result;
    if (!tx || tx.to.toLowerCase() !== MY_WALLET.toLowerCase() || tx.from.toLowerCase() !== userWallet.toLowerCase() || (parseInt(tx.value, 16) / 1e18) < 0.005) {
      return res.status(400).json({ error: "Transaction invalide (mauvaise adresse ou montant trop faible)." });
    }

    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/premium:${userWallet.toLowerCase()}/true`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Erreur de vérification." });
  }
}