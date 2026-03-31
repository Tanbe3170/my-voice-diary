// lib/image-styles.js
// 画像生成スタイル定義

import { OILPAINTING_STORY_REQUIREMENTS, GENERIC_IMAGE_PROMPT_REQUIREMENTS } from './image-prompt-requirements.js';

export const IMAGE_STYLES = {
  illustration: {
    name: 'フラットイラスト',
    promptPrefix: 'Flat illustration style with bold geometric shapes and thick clean outlines, limited warm color palette of teal blue and earthy brown-red and cream, subtle paper grain texture, clean composition with paleontological accuracy in simplified forms, educational infographic clarity, set in a timeless prehistoric or natural landscape with no modern elements',
    negativePrompt: 'photorealistic, 3D render, photograph, blurry, gradient heavy, modern buildings, cars, roads, power lines, smartphones, contemporary architecture',
    claudeInstruction: '画像プロンプトは、フラットイラスト調（太い輪郭線、幾何学的に単純化された形状、ティール青・茶赤・クリームの限定パレット、古生物学的な正確さ）で映える具体的なワンシーンを英語で記述。現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の自然や素朴な風景を背景にすること。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
    imagePromptRequirement: GENERIC_IMAGE_PROMPT_REQUIREMENTS,
    styleConflicts: ['photorealistic', 'oil painting', 'acrylic'],
  },
  oilpainting: {
    name: 'パレオアート',
    promptPrefix: 'Acrylic paleoart painting style with soft layered brushwork and restrained visible strokes, muted naturalistic earth-tone palette dominated by golden amber and warm ochre with cool blue-grey atmospheric accents, golden-hour directional lighting with atmospheric haze and backlighting, creatures naturally integrated into rich prehistoric ecosystem context showing behavioral interaction, deep atmospheric perspective with foreground botanical detail fading to desaturated cool distant landscape, environmental storytelling through geological and botanical elements, set in an ancient undisturbed wilderness',
    negativePrompt: 'photorealistic, flat, vector, cartoon, digital, clean lines, vibrant saturated colors, modern buildings, cars, roads, power lines, contemporary infrastructure, thick impasto texture',
    claudeInstruction: '画像プロンプトは、パレオアート調の油絵コンセプトアートとして、' +
      'ストーリーの最も劇的な瞬間を1枚の絵で語るシーンを英語で記述。' +
      '【必須要素】' +
      '1. 主人公の具体的な行動と感情表現（何をしている、どう感じている）。' +
      '2. シーンの物語的意味（転換点、対立、発見、成長、危機）。' +
      '3. 構図指定（ローアングル、俯瞰、クローズアップ、前景-中景-背景の配置）。' +
      '4. ライティングと色彩の感情表現（暖色系=希望・安堵、寒色系=危機・孤独、ゴールデンアワー=転換点）。' +
      '5. 環境ストーリーテリング（地質・植生・天候が物語の状況を反映する要素）。' +
      '【画風指定】アクリル画風の柔らかい筆跡、金色・琥珀色・アースカラーの自然色、' +
      '大気遠近法による奥行き、生物は風景の一部として自然に統合。' +
      '現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の原生自然を背景にすること。',
    imagePromptRequirement: OILPAINTING_STORY_REQUIREMENTS,
    styleConflicts: ['kawaii', 'chibi', 'cartoon', 'anime', 'cute chibi'],
  },
  popillust: {
    name: 'ポップイラスト',
    promptPrefix: 'Dynamic pop-art digital illustration with bold thick black outlines and cel-shading, highly saturated vibrant color palette featuring electric yellow and royal purple and emerald green and hot red and sky blue, dark charcoal background with dynamic swirl or radial energy effects, flat color base with clean cel-shaded shadows, smooth digital finish with no paper texture or brush strokes, energetic action poses with expressive faces, characters as the prominent focal point against the dark background, tournament poster composition with dramatic impact, NOT photorealistic NOT oil painting NOT watercolor NOT muted colors NOT earth tones',
    negativePrompt: 'photorealistic, 3D render, oil painting, watercolor, soft brushstrokes, muted colors, earth tones, pastel colors, paper texture, canvas texture, gradient heavy, blurry, modern buildings, cars, roads, power lines, contemporary architecture, minimalist, calm composition, static pose',
    claudeInstruction: '画像プロンプトは、ポップアートイラスト調（太い黒アウトライン、セルシェーディング、高彩度のビビッドカラー（電撃イエロー・ロイヤルパープル・エメラルドグリーン・ホットレッド）、ダークな背景に動的エフェクト、アクションポーズ）で映える具体的なワンシーンを英語で記述。キャラクターはダーク背景の中で際立つよう配置し、躍動感のあるポーズや表情を含めること。現代的な風景は避け、ゲームポスターのような劇的なインパクト構図を心がけること。抽象的な比喩ではなく、日記の中核エピソードを1つのダイナミックな場面として描写すること。',
    imagePromptRequirement: GENERIC_IMAGE_PROMPT_REQUIREMENTS,
    styleConflicts: ['photorealistic', 'oil painting', 'watercolor', 'pastel', 'muted'],
  },
};

export const DEFAULT_STYLE = 'illustration';

/**
 * styleIdからスタイル定義を取得する（フォールバックなし）
 * @param {string} styleId
 * @returns {object|null} スタイル定義。不明なstyleIdはnullを返す
 */
export function getStyle(styleId) {
  if (typeof styleId !== 'string' || !Object.hasOwn(IMAGE_STYLES, styleId)) return null;
  return IMAGE_STYLES[styleId];
}

/**
 * styleIdのバリデーション（ホワイトリスト方式）
 * @param {string} styleId
 * @returns {boolean}
 */
export function isValidStyleId(styleId) {
  return typeof styleId === 'string' && Object.hasOwn(IMAGE_STYLES, styleId);
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

export function getStyleImagePromptRequirement(styleId) {
  const style = getStyle(styleId);
  return style ? style.imagePromptRequirement : GENERIC_IMAGE_PROMPT_REQUIREMENTS;
}

export function getStyleConflicts(styleId) {
  const style = getStyle(styleId);
  return style ? style.styleConflicts : [];
}
