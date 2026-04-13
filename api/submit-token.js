// api/submit-token.js
// トークン送付フォームの処理
// 受け取ったトークンを管理者にメールで通知する

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, igUsername, igUserId, token } = req.body;

  // バリデーション
  if (!name || !email || !igUserId || !token) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  if (!token.startsWith('EAA')) {
    return res.status(400).json({ error: 'トークンの形式が正しくありません' });
  }

  // 管理者にメール通知（SendGrid または Resend を使用）
  // ここでは console.log で代替（実装時にメールサービスを追加）
  console.log('=== 新規トークン送付 ===');
  console.log(`名前: ${name}`);
  console.log(`メール: ${email}`);
  console.log(`IGユーザー名: ${igUsername}`);
  console.log(`IG_USER_ID: ${igUserId}`);
  console.log(`トークン: ${token.substring(0, 20)}...`);
  console.log('=====================');

  // TODO: メール送信実装
  // Resend API を使った実装例:
  /*
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'noreply@l-ai.jp',
    to: process.env.ADMIN_EMAIL,
    subject: `【L-A-I】新規トークン送付: ${name}`,
    text: `
名前: ${name}
メール: ${email}
IGユーザー名: ${igUsername}
IG_USER_ID: ${igUserId}
トークン: ${token}
    `.trim(),
  });
  */

  return res.status(200).json({ success: true });
}
