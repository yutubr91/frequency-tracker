export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { txHash, userWallet } = req.body; 
  const MY_WALLET = process.env.MY_WALLET_BEP20; 
  const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
  const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  if (!txHash || !userWallet) return res.status(400).json({ error: "Données manquantes." });
  if (!ADDRESS_RE.test(userWallet)) return res.status(400).json({ error: "Adresse utilisateur invalide." });
  if (!TX_HASH_RE.test(txHash)) return res.status(400).json({ error: "Format de Hash invalide." });

  try {
    const redisUrl = `${process.env.UPSTASH_REDIS_REST_URL}/set/${txHash.toLowerCase()}/true?EX=2592000&NX=true`;
    const redisSet = await fetch(redisUrl, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const redisData = await redisSet.json();
    
    if (redisData.result === null) {
      return res.status(400).json({ error: "Ce paiement a déjà été utilisé." });
    }

    const rpcPayloadReceipt = { jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [txHash], id: 1 };
    const responseReceipt = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcPayloadReceipt)
    });
    const dataReceipt = await responseReceipt.json();

    if (!dataReceipt.result || dataReceipt.result.status !== "0x1") {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${txHash.toLowerCase()}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      });
      return res.status(400).json({ error: "Cette transaction a échoué." });
    }

    const rpcPayloadTx = { jsonrpc: '2.0', method: 'eth_getTransactionByHash', params: [txHash], id: 1 };
    const responseTx = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcPayloadTx)
    });
    const dataTx = await responseTx.json();

    if (!dataTx.result) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${txHash.toLowerCase()}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      });
      return res.status(404).json({ error: "Transaction introuvable." });
    }

    const tx = dataTx.result;
    
    if (tx.to.toLowerCase() !== MY_WALLET.toLowerCase()) {
      return res.status(400).json({ error: "Mauvaise adresse de destination." });
    }

    if (tx.from.toLowerCase() !== userWallet.toLowerCase()) {
       return res.status(400).json({ error: "Cette transaction ne provient pas de votre portefeuille." });
    }

    const valueInBnb = parseInt(tx.value, 16) / 1e18;
    if (valueInBnb < 0.005) { 
      return res.status(400).json({ error: "Montant trop faible." });
    }

    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/premium:${userWallet.toLowerCase()}/true`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });

    return res.status(200).json({ success: true, message: "Paiement validé !" });
  } catch (error) {
    return res.status(500).json({ error: "Erreur de vérification." });
  }
}