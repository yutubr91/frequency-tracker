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
    return res.status(500).json({ reply: "Erreur : La clé GEMINI_API_KEY est manquante sur Vercel." });
  }

  const prompts = {
    fr: "Tu es FM-01, une assistante virtuelle intelligente. Réponds de manière concise et précise en français.",
    en: "You are FM-01, a smart virtual assistant. Answer concisely and accurately in English.",
    es: "Eres FM-01, una asistente virtual inteligente. Responde de forma concisa y precisa en español."
  };

  const bodyPayload = JSON.stringify({
    system_instruction: { parts: [{ text: prompts[lang] || prompts['fr'] }] },
    contents: [{ role: "user", parts: [{ text: message }] }]
  });

  const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyPayload });
        
        if (response.status === 503 || response.status === 429) {
          console.warn(`[${model}] Surchargé (${response.status}). Tentative ${attempt}/2...`);
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || `Erreur ${response.status}`);

        if (data.candidates && data.candidates[0].content) {
          return res.status(200).json({ reply: data.candidates[0].content.parts[0].text });
        }
      } catch (err) {
        lastError = err;
        console.error(`[${model}] Erreur : ${err.message}`);
      }
    }
  }

  return res.status(500).json({ reply: "Tous les serveurs IA sont actuellement surchargés. Veuillez réessayer dans quelques instants." });
}