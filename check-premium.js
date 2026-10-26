export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { address } = req.query;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "Adresse invalide." });

  try {
    const redisRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/premium:${address.toLowerCase()}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    const redisData = await redisRes.json();
    return res.status(200).json({ isPremium: redisData.result === "true" });
  } catch (error) { return res.status(500).json({ error: "Erreur serveur." }); }
}