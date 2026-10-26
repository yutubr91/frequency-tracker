export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || "unknown";
  const key = `ratelimit:creator:${ip}`;

  try {
    const checkRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${key}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    const checkData = await checkRes.json();
    if (parseInt(checkData.result) >= 5) return res.status(429).json({ error: "Trop de tentatives." });

    if (req.body.password === process.env.CREATOR_SECRET) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${key}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
      return res.status(200).json({ success: true });
    } else {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/incr/${key}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/expire/${key}/900`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
      return res.status(401).json({ success: false, error: "Code invalide" });
    }
  } catch (error) { return res.status(500).json({ error: "Erreur serveur." }); }
}