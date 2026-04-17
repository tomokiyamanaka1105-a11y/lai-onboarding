// api/advisor.js - AIアドバイザーチャットエンドポイント（ストリーミング対応）

// キャッシュ対象の静的指示部分（リクエスト間で変わらない）
const STATIC_INSTRUCTIONS = `あなたはL-A-Iの専属AIマーケティングコンサルタントです。

## 回答スタイル
- データを必ず引用して根拠のある回答をする
- 抽象的な一般論は避け、このアカウントの実際の数値を使って具体的に回答する
- 目標・方針が設定されている場合は、それを踏まえたアドバイスをする
- 改善提案は「何を・いつ・どのように」まで具体化する
- 日本語で自然に回答する
- 簡潔に、でも根拠は必ず示す`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, clientId, igUserId, accountProfile } = req.body;
  const GAS_API_URL = process.env.GAS_API_URL;

  // ── GASからデータ取得 ──
  let contextData = '';
  try {
    const response = await fetch(`${GAS_API_URL}?clientId=${clientId || 'C001'}&type=all`);
    const json     = await response.json();

    if (json.success && json.data) {
      const accounts = igUserId
        ? json.data.accounts.filter(a => a.igUserId === igUserId)
        : json.data.accounts;

      accounts.forEach(account => {
        contextData += `\n【${account.accountName}のデータ】\n`;

        if (account.dailyHistory?.length > 0) {
          const latest = account.dailyHistory[account.dailyHistory.length - 1];
          const oldest = account.dailyHistory[0];
          const totalReach = account.dailyHistory.reduce((s, d) => s + (Number(d.reach) || 0), 0);
          const followerGain = (Number(latest.followerCount) || 0) - (Number(oldest.followerCount) || 0);
          contextData += `現在のフォロワー数: ${latest.followerCount}人\n`;
          contextData += `直近${account.dailyHistory.length}日間の総リーチ: ${totalReach}人\n`;
          contextData += `フォロワー増減（期間中）: ${followerGain >= 0 ? '+' : ''}${followerGain}人\n`;
        }

        if (account.posts?.length > 0) {
          contextData += `分析投稿数: ${account.posts.length}件\n`;
          const byType = {};
          account.posts.forEach(p => {
            const t = p.mediaType || '不明';
            if (!byType[t]) byType[t] = { count: 0, totalReach: 0, totalEng: 0 };
            byType[t].count++;
            byType[t].totalReach += Number(p.reach) || 0;
            byType[t].totalEng   += (Number(p.likeCount) || 0) + (Number(p.commentCount) || 0) + (Number(p.saved) || 0);
          });
          Object.entries(byType).forEach(([type, d]) => {
            const avgReach = d.count > 0 ? Math.round(d.totalReach / d.count) : 0;
            const engRate  = d.totalReach > 0 ? Math.round(d.totalEng / d.totalReach * 10000) / 100 : 0;
            contextData += `${type}: ${d.count}件 平均リーチ${avgReach}人 エンゲージ率${engRate}%\n`;
          });
          const topPosts = [...account.posts]
            .sort((a, b) => (Number(b.reach) || 0) - (Number(a.reach) || 0))
            .slice(0, 3);
          contextData += `リーチ上位投稿:\n`;
          topPosts.forEach((p, i) => {
            const ts = p.timestamp ? String(p.timestamp).substring(0, 10) : '';
            contextData += `  ${i+1}位: ${p.mediaType} リーチ${p.reach}人 「${String(p.caption || '').substring(0, 40)}」(${ts})\n`;
          });
        }

        if (account.adInsights?.length > 0) {
          const totalSpend         = account.adInsights.reduce((s, a) => s + (Number(a.spend) || 0), 0);
          const totalAdReach       = account.adInsights.reduce((s, a) => s + (Number(a.reach) || 0), 0);
          const totalAdImpressions = account.adInsights.reduce((s, a) => s + (Number(a.impressions) || 0), 0);
          const totalAdPlays       = account.adInsights.reduce((s, a) => s + (Number(a.plays) || 0), 0);
          const totalAdClicks      = account.adInsights.reduce((s, a) => s + (Number(a.clicks) || 0), 0);
          contextData += "\n広告実績（累計）:\n";
          contextData += "  総広告費: ¥" + totalSpend.toLocaleString() + "\n";
          contextData += "  広告リーチ: " + totalAdReach.toLocaleString() + "人\n";
          contextData += "  広告インプレッション: " + totalAdImpressions.toLocaleString() + "回\n";
          contextData += "  広告動画再生: " + totalAdPlays.toLocaleString() + "回\n";
          contextData += "  広告クリック: " + totalAdClicks.toLocaleString() + "回\n";
          const topAds = [...account.adInsights].sort((a, b) => (Number(b.reach)||0)-(Number(a.reach)||0)).slice(0,3);
          contextData += "  リーチ上位広告:\n";
          topAds.forEach((a, i) => { contextData += "    "+(i+1)+"位: リーチ"+a.reach+"人 ¥"+a.spend+" 「"+String(a.adName).substring(0,30)+"」\n"; });
        }

        if (account.weeklyReports?.length > 0) {
          contextData += `週次レポート（直近）:\n`;
          account.weeklyReports.forEach(w => {
            contextData += `  ${w.weekLabel}: リーチ${w.totalReach}人 フォロワー${w.followerDelta >= 0 ? '+' : ''}${w.followerDelta}人 投稿${w.postCount}件\n`;
          });
        }
      });
    }
  } catch (e) {
    contextData = 'データ取得に失敗しました。';
  }

  // ── アカウントプロファイル（目標・方針）──
  let profileContext = '';
  if (accountProfile) {
    profileContext = `
=== このアカウントの目標・方針 ===
フォロワー目標: ${accountProfile.followerGoal || '未設定'}
達成期限: ${accountProfile.deadline || '未設定'}
メインターゲット: ${accountProfile.target || '未設定'}
投稿頻度目標: ${accountProfile.postFrequency || '未設定'}
重視する指標: ${accountProfile.kpi || '未設定'}
コンテンツ方針: ${accountProfile.contentPolicy || '未設定'}
備考・メモ: ${accountProfile.memo || 'なし'}
最終更新: ${accountProfile.updatedAt || '不明'}
=== プロファイル終わり ===
`;
  }

  const isSingleAccount = !!igUserId;
  const dynamicContext = `${isSingleAccount
    ? '以下の特定アカウントのデータのみを参照して回答してください。他のアカウントのデータは参照しないでください。'
    : '複数アカウントを横断して分析してください。'}
${isSingleAccount ? '- 他のアカウントとの比較は求められた時のみ行う' : '- 各アカウントを比較して全体最適を提案する'}

=== 現在のアカウントデータ ===
${contextData}
=== データ終わり ===${profileContext}`;

  try {
    // ストリーミングリクエスト
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        stream:     true,
        system: [
          // 静的指示をキャッシュ（全リクエスト共通）
          { type: 'text', text: STATIC_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
          // 動的データはキャッシュしない（リクエストごとに変わる）
          { type: 'text', text: dynamicContext },
        ],
        messages: messages,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json();
      return res.status(500).json({ error: err.error?.message || 'API Error' });
    }

    // SSEストリームをクライアントへ中継
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader  = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
          } else if (event.type === 'message_stop') {
            res.write('data: [DONE]\n\n');
          }
        } catch (_) {}
      }
    }

    res.end();

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}
