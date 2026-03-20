// lib/image-styles.js
// 画像生成スタイル定義

export const IMAGE_STYLES = {
  illustration: {
    name: 'フラットイラスト',
    promptPrefix: 'Flat illustration style with bold thick outlines, simple geometric shapes, limited warm color palette, subtle grain texture, clean composition, modern graphic design aesthetic, no photorealism',
    negativePrompt: 'photorealistic, 3D render, photograph, blurry, gradient heavy',
    claudeInstruction: '画像プロンプトは、フラットイラスト調（太い輪郭線、シンプルな形状、限定カラーパレット）で映える具体的なワンシーンを英語で記述。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
  },
  oilpainting: {
    name: '油絵',
    promptPrefix: 'Oil painting style with visible thick impasto brushstrokes, rich saturated colors, oil on canvas texture, warm dramatic lighting, painterly quality, artistic composition',
    negativePrompt: 'photorealistic, flat, vector, cartoon, digital, clean lines',
    claudeInstruction: '画像プロンプトは、油絵調（厚塗りの筆跡、濃厚な色彩、キャンバス質感）で映える具体的なワンシーンを英語で記述。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
  },
};

export const DEFAULT_STYLE = 'illustration';

/**
 * styleIdからスタイル定義を取得する（フォールバックなし）
 * @param {string} styleId
 * @returns {object|null} スタイル定義。不明なstyleIdはnullを返す
 */
export function getStyle(styleId) {
  return IMAGE_STYLES[styleId] || null;
}

/**
 * styleIdのバリデーション（ホワイトリスト方式）
 * @param {string} styleId
 * @returns {boolean}
 */
export function isValidStyleId(styleId) {
  return typeof styleId === 'string' && styleId in IMAGE_STYLES;
}

export function getStylePromptPrefix(styleId) {
  const style = getStyle(styleId);
  return style ? style.promptPrefix : null;
}

export function getStyleNegativePrompt(styleId) {
  const style = getStyle(styleId);
  return style ? style.negativePrompt : null;
}

export function getStyleClaudeInstruction(styleId) {
  const style = getStyle(styleId);
  return style ? style.claudeInstruction : null;
}
