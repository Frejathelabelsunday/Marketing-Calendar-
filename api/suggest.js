export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { apiKey: clientKey, events = [], categories = {}, currentDate } = req.body;
    const today = currentDate || new Date().toISOString().split("T")[0];

    // Use server-side env var first, fall back to client-provided key
    const apiKey = process.env.OPENAI_API_KEY || clientKey;
    if (!apiKey) return res.status(400).json({ error: "API key is required. Set OPENAI_API_KEY in Vercel environment variables." });

    const existingTitles = events.map((e) => e.title).join(", ");
    const categoryList = Object.entries(categories)
      .map(([k, v]) => `${k}: ${v.label}`)
      .join(", ");

    const prompt = `You are helping a record label's marketing team find upcoming events for their 2026 content calendar.

Their calendar currently includes these events: ${existingTitles}

Available categories: ${categoryList}

Today's date: ${today}

Suggest 5 relevant upcoming events (after ${today}) that are NOT already in the calendar. Focus on:
- Major music releases, album drops, tours
- Award shows (Grammys, BRITs, VMAs, etc.)
- Fashion events (fashion weeks, galas)
- Film/TV premieres and releases
- Sports events (F1, football, basketball, tennis)
- Cultural moments (holidays, awareness months)
- Gaming releases
- Music festivals

The content team creates short-form video edits (phonk edits, fan memes, runway clips, cinematic edits, etc.) so tailor the content ideas to that style.

Return ONLY a JSON array with exactly this format (no other text):
[
  {
    "title": "Event Name",
    "startDate": "2026-MM-DD",
    "endDate": "2026-MM-DD",
    "category": "category_key",
    "contentIdeas": "Brief content ideas for short-form edits"
  }
]

Use only these category keys: music, fashion, film, sports, culture, gaming, festival`;

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that suggests events for a record label marketing calendar. Always respond with only a JSON array, no other text.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      return res.status(apiRes.status).json({
        error: errData?.error?.message || "API request failed",
      });
    }

    const data = await apiRes.json();
    const textContent = data?.choices?.[0]?.message?.content || "[]";
    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    const suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return res.status(200).json({ suggestions });
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
