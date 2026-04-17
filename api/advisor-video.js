// api/advisor-video.js
// 動画分析: Gemini File API で動画分析 → Claude で日本語アドバイス生成

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!req.body) {
    return res.status(400).json({ error: 'リクエストボディが空です' });
  }

  const { fileUri, videoMimeType, clientId, prompt } = req.body;
  const GAS_API_URL       = process.env.GAS_API_URL;
  const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  // ── Step 1: GASから過去データを取得 ──
  let contextData = '';
  try {
    const gasRes  = await fetch(`${GAS_API_URL}?clientId=${clientId || 'C001'}&type=all`);
    const gasJson = await gasRes.json();
    if (gasJson.success && gasJson.data) {
      gasJson.data.accounts.forEach(account => {
        contextData += `\n【${account.accountName}の過去データ】\n`;
        if (account.dailyHistory?.length > 0) {
          const latest = account.dailyHistory[account.dailyHistory.length - 1];
          contextData += `フォロワー数: ${latest.followerCount}人\n`;
        }
        if (account.posts?.length > 0) {
          const byType = {};
          account.posts.forEach(p => {
            const t = p.mediaType || '不明';
            if (!byType[t]) byType[t] = { count: 0, totalReach: 0 };
            byType[t].count++;
            byType[t].totalReach += Number(p.reach) || 0;
          });
          Object.entries(byType).forEach(([type, d]) => {
            const avg = d.count > 0 ? Math.round(d.totalReach / d.count) : 0;
            contextData += `${type}: 平均リーチ${avg}人（${d.count}件）\n`;
          });
          const topPosts = [...account.posts]
            .sort((a, b) => (Number(b.reach) || 0) - (Number(a.reach) || 0))
            .slice(0, 3);
          contextData += `リーチ上位投稿:\n`;
          topPosts.forEach((p, i) => {
            contextData += `  ${i+1}位: ${p.mediaType} リーチ${p.reach}人 「${String(p.caption||'').substring(0,30)}」\n`;
          });
        }
      });
    }
  } catch (e) {
    contextData = 'データ取得失敗';
  }

  // ── Step 2: Gemini で動画分析（File API経由）──
  let geminiAnalysis = '';
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                file_data: {
                  mime_type: videoMimeType || 'video/mp4',
                  file_uri: fileUri,
                },
              },
              {
                text: `この動画を詳しく分析してください。以下の点を日本語で簡潔に報告してください:

1. 動画の内容・シーン（何が映っているか、どんな動きがあるか、時系列で）
2. Instagram投稿として見た場合の視覚的な強み・弱み
3. 冒頭3秒のフック（視聴者の注意を引けているか）
4. 動画の流れ・テンポ（飽きさせない構成か）
5. 音声・BGM（あれば）の印象
6. テキストやキャプションの視認性（あれば）
7. 総合的な改善提案（具体的に）

客観的な事実を中心に箇条書きで報告してください。`,
              },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const geminiJson = await geminiRes.json();
    geminiAnalysis = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(geminiJson);
  } catch (e) {
    geminiAnalysis = `Gemini分析エラー: ${e.message}`;
  }

  // ── Step 3: Claude で日本語アドバイスを生成 ──
  const userPrompt = prompt || '投稿として評価・改善点・キャプション案・ハッシュタグを提案してください。';

  const claudeSystem = `あなたはL-A-Iの専属AIマーケティングコンサルタントです。
Gemini AIが動画を全フレーム分析した結果と、過去のInstagramアカウントデータを元に、
具体的で実用的なアドバイスを日本語で生成してください。

=== 過去のアカウントデータ ===
${contextData}
=== データ終わり ===

=== Geminiによる動画分析結果 ===
${geminiAnalysis}
=== 分析終わり ===

## 回答スタイル
- 動画分析結果と過去データを必ず組み合わせて回答する
- 「過去のリール動画の平均リーチXX人と比べて...」のように具体的に比較する
- 改善提案は「何を・どこを・どう変える」まで具体化する
- 自然で読みやすい日本語で書く`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: claudeSystem,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const claudeJson = await claudeRes.json();
    const content    = claudeJson?.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: `Claude API Error: ${JSON.stringify(claudeJson?.error || claudeJson)}`, geminiAnalysis });
    }

    return res.status(200).json({ content, geminiAnalysis });

  } catch (e) {
    return res.status(500).json({ error: e.message, geminiAnalysis });
  }
}
