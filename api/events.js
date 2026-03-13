import Redis from "ioredis";

const REDIS_KEY = "mcal_events";

function getRedis() {
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const redis = getRedis();

  try {
    await redis.connect();

    if (req.method === "GET") {
      const data = await redis.get(REDIS_KEY);
      const events = data ? JSON.parse(data) : [];
      return res.status(200).json({ events });
    }

    if (req.method === "POST") {
      const { events } = req.body;
      if (!Array.isArray(events)) {
        return res.status(400).json({ error: "Events must be an array" });
      }
      await redis.set(REDIS_KEY, JSON.stringify(events));
      return res.status(200).json({ ok: true, count: events.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: `Database error: ${err.message}` });
  } finally {
    redis.disconnect();
  }
}
