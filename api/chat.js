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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || "unknown";
  if (await isRateLimited(ip)) return res.status(429).json({ reply: "Doucement ! Attendez 1 minute." });

  const { message, lang } = req.body;
  if (!message) return res.status(400).json({ error: "Message vide" });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ reply: "Erreur : La clé GEMINI_API_KEY est manquante sur Vercel." });
  }

  const prompts = {
    fr: "Tu es FM-01, une belle assistante virtuelle. Réponds de manière concise en français.",
    en: "You are FM-01, a beautiful virtual assistant. Answer concisely in English.",
    es: "Eres FM-01, una hermosa asistente virtual. Responde de forma concisa en español."
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompts[lang] || prompts['fr'] }] },
        contents: [{ role: "user", parts: [{ text: message }] }]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ reply: "Erreur Google : " + (data.error?.message || "Clé invalide") });
    }

    if (data.candidates && data.candidates[0].content) {
      return res.status(200).json({ reply: data.candidates[0].content.parts[0].text });
    } else {
      return res.status(500).json({ reply: "Format de réponse invalide." });
    }
  } catch (error) {
    return res.status(500).json({ reply: "Erreur serveur : " + error.message });
  }
}