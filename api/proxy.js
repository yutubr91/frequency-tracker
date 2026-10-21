export default async function handler(req, res) {
  // Autoriser votre site à communiquer avec ce moteur
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Turnstile-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const url = new URL('https://api.etherscan.io/v2/api');
    url.searchParams.set('chainid', '56');
    
    // On transmet les paramètres de votre site
    for (const [key, value] of Object.entries(req.query)) {
      url.searchParams.set(key, value);
    }
    
    // On ajoute votre clé secrète Etherscan
    url.searchParams.set('apikey', process.env.ETHERSCAN_API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Erreur du serveur" });
  }
}
