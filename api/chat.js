async function isRateLimited(ip) {
  const key = `ratelimit:chat:${ip}`;
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/incr/${key}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    const data = await res.json();
    if (data.result === 1) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/expire/${key}/60`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    }
    return data.result > 10;
  } catch (e) { return false; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || "unknown";
  if (await isRateLimited(ip)) return res.status(429).json({ reply: "Doucement ! Attendez 1 minute." });

  const { message, lang } = req.body;
  if (!message) return res.status(400).json({ error: "Message vide" });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ reply: "Erreur : La clé GEMINI_API_KEY est manquante." });
  }

  const prompts = {
    fr: "Tu es FM-01, l'assistante virtuelle de l'application 'FREQUENCY TRACKER'. Cette application analyse les portefeuilles crypto BEP-20 sur la BNB Smart Chain. Réponds en français, de manière concise et amicale.",
    en: "You are FM-01, assistant of 'FREQUENCY TRACKER' for BEP-20 crypto portfolios on BNB Chain. Answer in English, concisely.",
    es: "Eres FM-01, asistente de 'FREQUENCY TRACKER' para carteras BEP-20. Responde en español de forma concisa."
  };

  const bodyPayload = JSON.stringify({
    system_instruction: { parts: [{ text: prompts[lang] || prompts['fr'] }] },
    contents: [{ role: "user", parts: [{ text: message }] }]
  });

  // Noms de modèles officiels Google
  const models = ["gemini-1.5-flash", "gemini-1.5-pro"]; 
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyPayload });
      const data = await response.json();

      if (response.ok && data.candidates && data.candidates[0].content) {
        return res.status(200).json({ reply: data.candidates[0].content.parts[0].text });
      }
    } catch (err) {
      console.error(`Erreur ${model}:`, err.message);
    }
  }

  return res.status(500).json({ reply: "Erreur de connexion avec l'Intelligence Artificielle." });
}