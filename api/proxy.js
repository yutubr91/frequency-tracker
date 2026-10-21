export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const { module, action, address, contractaddress, offset } = req.query;
    let rpcPayload;

    if (module === 'account' && action === 'balance') {
      rpcPayload = {
        jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1
      };
    } else if (module === 'account' && action === 'tokenbalance') {
      const data = `0x70a08231000000000000000000000000${address.slice(2)}`;
      rpcPayload = {
        jsonrpc: '2.0', method: 'eth_call', params: [{ to: contractaddress, data: data }, 'latest'], id: 1
      };
    } else if (module === 'account' && action === 'tokentx') {
      // Historique des transactions via l'API de MegaNode
      const url = `https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}/nr_getAssetTransfers?fromAddress=${address}&toAddress=${address}&category=20&maxCount=0x${parseInt(offset || 10).toString(16)}&order=desc`;
      const response = await fetch(url);
      const data = await response.json();
      return res.status(200).json({ status: "1", message: "OK", result: data.result || [] });
    } else {
      return res.status(400).json({ error: "Requête non supportée" });
    }

    const response = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcPayload)
    });
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    return res.status(200).json({ status: "1", message: "OK", result: data.result });

  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur : " + error.message });
  }
}
