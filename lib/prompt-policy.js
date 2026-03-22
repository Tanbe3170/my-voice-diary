// lib/prompt-policy.js
// プロンプト長ポリシーの一元管理
//
// 閾値を集約し、変更時の差分漏れを防止する。

/** composeImagePrompt用の警告閾値（文字数） */
export const PROMPT_WARN_THRESHOLD = 900;

/** DALL-E 3用のハード切り詰め上限（文字数） */
export const DALLE_MAX_PROMPT = 1000;
