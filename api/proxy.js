export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const { module, action, address, contractaddress } = req.query;
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
      // NodeReal exige une requête POST spécifique pour l'historique
      const rpcPayloadTx = {
        jsonrpc: '2.0',
        method: 'nr_getAssetTransfers',
        params: [{
          fromAddress: address,
          category: ["20"], // Code pour les jetons BEP-20
          maxCount: "0xa",  // On demande les 10 dernières
          order: "desc"
        }],
        id: 1
      };
      try {
        const response = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcPayloadTx)
        });
        const data = await response.json();
        
        // Si l'API renvoie une erreur, on renvoie un tableau vide au lieu de planter
        if (data.error || !data.result || !data.result.transfers) {
          return res.status(200).json({ status: "1", message: "OK", result: [] });
        }
        
        // On formate les données pour qu'elles correspondent à ce qu'attend votre site
        const transfers = data.result.transfers.map(t => ({
          hash: t.hash,
          timeStamp: Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000),
          from: t.from,
          to: t.to,
          value: t.rawContract.value,
          tokenDecimal: parseInt(t.rawContract.decimal || '0x12', 16),
          tokenSymbol: t.asset || 'TOKEN'
        }));
        
        return res.status(200).json({ status: "1", message: "OK", result: transfers });
      } catch (e) {
        // En cas de problème réseau, on renvoie aussi un tableau vide
        return res.status(200).json({ status: "1", message: "OK", result: [] });
      }
    } else {
      return res.status(400).json({ error: "Requête non supportée" });
    }

    // Appel générique pour le BNB et les jetons
    const response = await fetch(`https://bsc-mainnet.nodereal.io/v1/${process.env.MEGANODE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcPayload)
    });
    const data = await response.json();

    if (data.error) {
      // Si un jeton spécifique échoue, on renvoie "0" pour ne pas bloquer les autres
      if (module === 'account' && action === 'tokenbalance') {
        return res.status(200).json({ status: "1", message: "OK", result: "0" });
      }
      throw new Error(data.error.message);
    }
    
    return res.status(200).json({ status: "1", message: "OK", result: data.result });

  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur : " + error.message });
  }
}
