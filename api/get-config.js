export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  return res.status(200).json({
    geminiApiKey: process.env.GEMINI_API_KEY,
  });
}
