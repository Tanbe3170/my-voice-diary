// lib/image-prompt-requirements.js
// image_prompt生成要件の共通定数（claudeInstruction / JSON_OUTPUT_SCHEMA 双方から参照）

export const OILPAINTING_STORY_REQUIREMENTS =
  'この日記のストーリーの最も劇的・印象的な瞬間を、パレオアート油絵の1シーンとして英語で描写するプロンプト（AI画像生成用）。' +
  '主人公の具体的な行動・感情、シーンの物語的意味（転換点・対立・発見）、構図（カメラアングル）、' +
  'ライティング（色温度と感情の対応）、環境ディテール（地質・植生・天候）を必ず含めること。';

export const GENERIC_IMAGE_PROMPT_REQUIREMENTS =
  'この日記の中核エピソードを1つの具体的な場面として描写する英語プロンプト（AI画像生成用）。' +
  '抽象的な比喩や概念図ではなく、読者が画像を見ただけで日記の内容がわかるような印象的なワンシーンを詳細に記述する。' +
  '被写体の行動・表情・場所・時間帯・周辺のディテールを具体的に含めること。';
