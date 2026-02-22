#!/usr/bin/env node
// scripts/refresh-threads-token.js
// Threads長期アクセストークンのリフレッシュツール
//
// 使い方:
//   THREADS_ACCESS_TOKEN=zzz node scripts/refresh-threads-token.js
//   THREADS_ACCESS_TOKEN=zzz node scripts/refresh-threads-token.js --show-token
//
// 60日有効の長期トークンをリフレッシュし、新しいトークンを表示する。
// 新トークンはVercelダッシュボードで手動更新すること。
//
// 注意: トークンは期限切れ前にリフレッシュする必要がある（推奨: 50日以内）。
// セキュリティ: デフォルトではトークンをマスク表示。--show-token で全文表示。

const CURRENT_TOKEN = process.env.THREADS_ACCESS_TOKEN;

if (!CURRENT_TOKEN) {
  console.error('必要な環境変数が未設定です。');
  console.error('使い方:');
  console.error('  THREADS_ACCESS_TOKEN=zzz node scripts/refresh-threads-token.js');
  process.exit(1);
}

// --show-token フラグで全文表示を許可
const showFullToken = process.argv.includes('--show-token');

/**
 * トークンをマスク表示（先頭6文字 + ... + 末尾4文字）
 * @param {string} token
 * @returns {string}
 */
function maskToken(token) {
  if (token.length <= 14) return '***masked***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

async function refreshToken() {
  console.log('Threads長期トークンをリフレッシュ中...\n');

  // Threads APIはGETメソッド + クエリパラメータを要求
  const params = new URLSearchParams({
    grant_type: 'th_refresh_token',
    access_token: CURRENT_TOKEN,
  });

  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?${params.toString()}`,
    { signal: AbortSignal.timeout(15000) }
  );
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('トークンリフレッシュ失敗:');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const newToken = data.access_token;
  const expiresIn = data.expires_in;

  if (!newToken) {
    console.error('新しいトークンが取得できませんでした。');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  // 有効期限を日数で計算
  const expireDays = expiresIn ? Math.floor(expiresIn / 86400) : '不明';

  console.log('新しいトークンが取得されました！');
  console.log(`有効期限: 約${expireDays}日`);
  console.log('');

  if (showFullToken) {
    console.log('=== 新しいトークン ===');
    console.log(newToken);
    console.log('======================');
  } else {
    console.log(`トークン（マスク表示）: ${maskToken(newToken)}`);
    console.log('');
    console.log('全文を表示するには --show-token フラグを付けて再実行してください:');
    console.log('  THREADS_ACCESS_TOKEN=zzz node scripts/refresh-threads-token.js --show-token');
  }

  console.log('');
  console.log('次の手順:');
  console.log('1. Vercelダッシュボード → Settings → Environment Variables');
  console.log('2. THREADS_ACCESS_TOKEN を新しいトークンに更新');
  console.log('3. Redeploy（環境変数の変更を反映）');
}

refreshToken().catch(error => {
  console.error('予期せぬエラー:', error.message);
  process.exit(1);
});
