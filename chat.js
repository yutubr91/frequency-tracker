async function isRateLimited(ip) {
  const key = `ratelimit:chat:${ip}`;
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    const count = data.result;
    
    if (count === 1) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/expire/${key}/60`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      });
    }
    return count > 10;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || "unknown";
  if (await isRateLimited(ip)) return res.status(429).json({ reply: "Doucement ! Attendez 1 minute." });

  const { message, lang } = req.body;
  if (!message || message.length > 500) return res.status(400).json({ error: "Message invalide" });

  const prompts = {
    fr: "Tu es FM-01, une belle assistante virtuelle 3D, intelligente, amicale et féminine. Tu aides les utilisateurs de cette application de suivi crypto. Réponds toujours en français, de manière concise.",
    en: "You are FM-01, a beautiful 3D virtual assistant, smart, friendly and feminine. You help users of this crypto portfolio tracker app. Always answer in English, concisely.",
    es: "Eres FM-01, una hermosa asistente virtual 3D, inteligente, amigable y femenina. Ayudas a los usuarios de esta aplicación de seguimiento de criptomonedas. Responde siempre en español, de forma concisa."
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        systemInstruction: { parts: [{ text: prompts[lang] || prompts['fr'] }] }
      })
    });
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0].content) {
      const reply = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ reply });
    } else {
      return res.status(500).json({ reply: "Désolée, je n'ai pas pu générer de réponse." });
    }
  } catch (error) {
    return res.status(500).json({ error: "Assistant indisponible." });
  }
}