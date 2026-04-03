// lib/prompt-policy.js
// プロンプト長ポリシーの一元管理
//
// 閾値を集約し、変更時の差分漏れを防止する。

/** composeImagePrompt用の警告閾値（文字数） */
export const PROMPT_WARN_THRESHOLD = 900;

/** image_prompt入力の上限（文字数）— composeImagePrompt / API入力検証の双方で参照 */
export const IMAGE_PROMPT_HARD_LIMIT = 500;

/** DALL-E 3用のハード切り詰め上限（文字数） */
export const DALLE_MAX_PROMPT = 1000;
