// lib/image-styles.js
// 画像生成スタイル定義

export const IMAGE_STYLES = {
  illustration: {
    name: 'フラットイラスト',
    promptPrefix: 'Flat illustration style with bold geometric shapes and thick clean outlines, limited warm color palette of teal blue and earthy brown-red and cream, subtle paper grain texture, clean composition with paleontological accuracy in simplified forms, educational infographic clarity, set in a timeless prehistoric or natural landscape with no modern elements',
    negativePrompt: 'photorealistic, 3D render, photograph, blurry, gradient heavy, modern buildings, cars, roads, power lines, smartphones, contemporary architecture',
    claudeInstruction: '画像プロンプトは、フラットイラスト調（太い輪郭線、幾何学的に単純化された形状、ティール青・茶赤・クリームの限定パレット、古生物学的な正確さ）で映える具体的なワンシーンを英語で記述。現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の自然や素朴な風景を背景にすること。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
  },
  oilpainting: {
    name: 'パレオアート',
    promptPrefix: 'Acrylic paleoart painting style with soft layered brushwork and restrained visible strokes, muted naturalistic earth-tone palette dominated by golden amber and warm ochre with cool blue-grey atmospheric accents, golden-hour directional lighting with atmospheric haze and backlighting, creatures naturally integrated into rich prehistoric ecosystem context showing behavioral interaction, deep atmospheric perspective with foreground botanical detail fading to desaturated cool distant landscape, environmental storytelling through geological and botanical elements, set in an ancient undisturbed wilderness',
    negativePrompt: 'photorealistic, flat, vector, cartoon, digital, clean lines, vibrant saturated colors, modern buildings, cars, roads, power lines, contemporary infrastructure, thick impasto texture',
    claudeInstruction: '画像プロンプトは、パレオアート調（アクリル画風の柔らかい筆跡、金色・琥珀色・アースカラーの落ち着いた自然色、ゴールデンアワーの劇的な照明、大気遠近法による奥行き）で映える具体的なワンシーンを英語で記述。生物は風景の一部として自然に統合し、行動的な文脈（捕食、移動、群れの交流）を含めること。現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の原生自然を背景にすること。抽象的な比喩ではなく、日記の中核エピソードを環境ストーリーテリング（地質・植生の詳細）を含む1つの場面として描写すること。',
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
