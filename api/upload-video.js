export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const { videoBase64, mimeType, fileName } = req.body;
  const buffer = Buffer.from(videoBase64, 'base64');

  try {
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': buffer.length,
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: fileName || 'video' } }),
      }
    );

    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) return res.status(500).json({ error: 'Upload URL取得失敗' });

    const uploadRes  = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Type': mimeType,
      },
      body: buffer,
    });

    const uploadJson = await uploadRes.json();
    const fileUri    = uploadJson?.file?.uri;
    const name       = uploadJson?.file?.name;

    if (!fileUri) return res.status(500).json({ error: 'fileUri取得失敗', detail: uploadJson });

    let state = uploadJson?.file?.state;
    let attempts = 0;
    while (state === 'PROCESSING' && attempts < 15) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GEMINI_API_KEY}`);
      const j = await s.json();
      state = j?.state;
      attempts++;
    }

    return res.status(200).json({ fileUri, state });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
