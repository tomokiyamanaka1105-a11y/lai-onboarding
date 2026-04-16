// api/advisor.js - AIアドバイザーチャットエンドポイント

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, clientId } = req.body;
  const GAS_API_URL = process.env.GAS_API_URL;

  // GASからデータ取得
  let contextData = '';
  try {
    const response = await fetch(`${GAS_API_URL}?clientId=${clientId || 'C001'}&type=all`);
    const json     = await response.json();

    if (json.success && json.data) {
      const data = json.data;
      data.accounts.forEach(account => {
        contextData += `\n【${account.accountName}のデータ】\n`;

        // 日次データサマリー
        if (account.dailyHistory?.length > 0) {
          const latest = account.dailyHistory[account.dailyHistory.length - 1];
          const oldest = account.dailyHistory[0];
          const totalReach = account.dailyHistory.reduce((s, d) => s + (Number(d.reach) || 0), 0);
          const followerGain = (Number(latest.followerCount) || 0) - (Number(oldest.followerCount) || 0);
          contextData += `現在のフォロワー数: ${latest.followerCount}人\n`;
          contextData += `直近${account.dailyHistory.length}日間の総リーチ: ${totalReach}人\n`;
          contextData += `フォロワー増減（期間中）: ${followerGain >= 0 ? '+' : ''}${followerGain}人\n`;
        }

        // 投稿データ
        if (account.posts?.length > 0) {
          contextData += `分析投稿数: ${account.posts.length}件\n`;

          // 形式別集計
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

          // 上位3投稿
          const topPosts = [...account.posts]
            .sort((a, b) => (Number(b.reach) || 0) - (Number(a.reach) || 0))
            .slice(0, 3);
          contextData += `リーチ上位投稿:\n`;
          topPosts.forEach((p, i) => {
            const ts = p.timestamp ? String(p.timestamp).substring(0, 10) : '';
            contextData += `  ${i+1}位: ${p.mediaType} リーチ${p.reach}人 「${String(p.caption || '').substring(0, 30)}」(${ts})\n`;
          });
        }

        // 週次レポート
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

  const SYSTEM_PROMPT = `あなたはL-A-Iの専属AIマーケティングコンサルタントです。
以下のInstagramアカウントの実データを参照して、具体的なアドバイスをしてください。

=== 現在のアカウントデータ ===
${contextData}
=== データ終わり ===

## 回答スタイル
- データを必ず引用して根拠のある回答をする
- 抽象的な一般論は避け、このアカウントの数値を使って具体的に回答する
- 改善提案は「何を・いつ・どのように」まで具体化する
- 複数アカウントの比較も積極的に行う
- 日本語で回答する
- 簡潔に、でも根拠は必ず示す`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages:   messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'API Error' });
    }

    return res.status(200).json({ content: data.content[0].text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
