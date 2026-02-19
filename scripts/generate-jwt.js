#!/usr/bin/env node
// scripts/generate-jwt.js
// 管理者用JWT生成CLIスクリプト
//
// 使用方法:
//   node scripts/generate-jwt.js [有効期間時間数(デフォルト:24)]
//
// 環境変数:
//   JWT_SECRET - JWT署名用シークレット（必須）

import { signJwt } from '../api/lib/jwt.js';

const arg = process.argv[2];
let hours = 24;
if (arg !== undefined) {
  // 厳密な整数パース（"12abc" や "1e2" を拒否）
  if (!/^\d+$/.test(arg)) {
    console.error('エラー: 有効期間は1〜168（時間）の正の整数で指定してください');
    process.exit(1);
  }
  hours = Number(arg);
}

// 有効期間の範囲検証（1〜168時間 = 最大7日間）
if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
  console.error('エラー: 有効期間は1〜168（時間）の整数で指定してください');
  process.exit(1);
}

const secret = process.env.JWT_SECRET;

if (!secret) {
  console.error('エラー: JWT_SECRET環境変数が設定されていません');
  console.error('設定例: export JWT_SECRET="$(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")"');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: 'diary-admin',
  iat: now,
  exp: now + hours * 3600
};

const token = signJwt(payload, secret);

console.log(`\nJWT生成完了（有効期間: ${hours}時間）\n`);
console.log(token);
console.log(`\n有効期限: ${new Date((now + hours * 3600) * 1000).toLocaleString('ja-JP')}\n`);
