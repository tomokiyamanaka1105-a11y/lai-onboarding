// api/auth.js
// Google IDトークンを検証してユーザー情報を返す

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken が必要です' });

  try {
    // Google のトークン検証エンドポイント
    const verifyRes  = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const verifyJson = await verifyRes.json();

    if (verifyJson.error) {
      return res.status(401).json({ error: 'トークンが無効です', detail: verifyJson.error });
    }

    // クライアントIDの確認
    if (verifyJson.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'クライアントIDが一致しません' });
    }

    return res.status(200).json({
      userId:  verifyJson.sub,   // Google ユーザーID
      email:   verifyJson.email,
      name:    verifyJson.name,
      picture: verifyJson.picture,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
