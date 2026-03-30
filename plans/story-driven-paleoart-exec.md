# ExecPlan: パレオアートモード ストーリー反映改善

> **元計画書:** `plans/story-driven-paleoart.md`（根本原因分析・方針立案）
> **本計画書:** 実装者向けExecPlan（codex-review対象）
> **作成日:** 2026-03-30

---

## 概要

パレオアート（oilpainting）モードで日記を作成した際、**ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない**問題を修正する。

### 根本原因（3点）

1. **`claudeInstruction`がスタイル指示に偏り、ストーリー要素を要求していない**（`lib/image-styles.js:16`）
2. **`JSON_OUTPUT_SCHEMA`の`image_prompt`定義が全スタイル共通で汎用的すぎる**（`api/create-diary.js:35-36`）
3. **`composeImagePrompt`でストーリー要素がスタイル・キャラクター属性に埋もれる**（`lib/character.js:265-276`）

### 方針Cの判断: **不採用**

新スタイル`oilpainting-story`の追加は不採用とする。
- 理由: A-1/A-2はoilpaintingモード内で完結、B-1は全スタイルに影響するが改善方向の変更
- メンテナンスコスト増大（promptPrefix/claudeInstruction/negativePromptの重複管理）
- フロントエンドUI・バリデーション・imageTokenへの影響が不要に広がる
- A/B比較は変更前後の手動比較で十分

---

## 現状のデータフロー

```
[ユーザー入力] 日記テキスト + styleId
  ↓
[create-diary.js] buildPrompt()
  ├─ JSON_OUTPUT_SCHEMA(today) → image_prompt定義（全スタイル共通）
  ├─ getStyleClaudeInstruction(styleId) → スタイル固有指示
  └─ Claude API → JSON出力（image_prompt: max 500文字）
  ↓
[generate-image.js] composeImagePrompt(image_prompt, character, styleId)
  ├─ [1] resolved.basePrompt          ← キャラクター基本描写
  ├─ [2] eyeDescriptor                ← 目の詳細
  ├─ [3] Scene: ${diaryImagePrompt}   ← ★ストーリーはここだけ
  ├─ [4] Art style: ${promptPrefix}   ← 長いスタイル記述
  ├─ [5] Style details                ← スタイル修飾子
  ├─ [6] Important details            ← 一貫性キーワード
  └─ [7] Color/Rendering/Atmosphere   ← CRAFT 5軸
  ↓
[image-backend.js] generateImageWithFallback()
  ├─ Gemini NB2（制限なし）
  ├─ Gemini NBpro（制限なし）
  └─ DALL-E 3（1000文字ハード制限）
```

### プロンプト長制約

| 段階 | 上限 | 参照 |
|------|------|------|
| Claude API出力 `image_prompt` | 500文字 | `create-diary.js:561` |
| `composeImagePrompt` 合成後 | 3800文字（slice） | `character.js:285` |
| 警告閾値 | 900文字 | `prompt-policy.js:7` |
| DALL-E 3 投入 | 1000文字（ハード切り詰め） | `image-backend.js:110-112` |

---

## 実装ステップ

### Phase 1: Claude指示の強化（A-1, A-2）

> 画像生成AI投入前の**image_prompt生成段階**を改善。他スタイルへの副作用なし。

#### Step 1-1: oilpaintingの`claudeInstruction`強化

**ファイル:** `lib/image-styles.js`
**変更箇所:** L16（oilpainting.claudeInstruction）
**リスク:** 低（oilpaintingモードのみに影響）

**変更内容:**

現在の値（スタイル指示のみ）:
```
画像プロンプトは、パレオアート調（アクリル画風の柔らかい筆跡、金色・琥珀色・
アースカラー...）で映える具体的なワンシーンを英語で記述。生物は風景の一部として
自然に統合し、行動的な文脈（捕食、移動、群れの交流）を含めること...
```

変更後（ストーリー駆動要素を追加）:
```javascript
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
```

**ポイント:**
- 「具体的なワンシーン」→「ストーリーの最も劇的な瞬間を1枚の絵で語るシーン」
- 【必須要素】5項目を追加（行動・感情、物語的意味、構図、ライティング、環境）
- 画風指定は末尾にまとめて保持

---

#### Step 1-2: `JSON_OUTPUT_SCHEMA`のスタイル別分岐

**ファイル:** `api/create-diary.js`
**変更箇所:** L26-37（JSON_OUTPUT_SCHEMA）、L39/59/91/127（build関数シグネチャ）、L449（呼び出し）
**リスク:** 低〜中（全モードのプロンプト構築に関わるが、分岐ロジックのため既存動作を保持）

**(a) `JSON_OUTPUT_SCHEMA`に`styleId`パラメータ追加（L26）:**

```javascript
const JSON_OUTPUT_SCHEMA = (today, styleId) => {
  const imagePromptInstruction = styleId === 'oilpainting'
    ? 'この日記のストーリーの最も劇的・印象的な瞬間を、パレオアート油絵の1シーンとして英語で描写するプロンプト（AI画像生成用）。主人公の具体的な行動・感情、シーンの物語的意味（転換点・対立・発見）、構図（カメラアングル）、ライティング（色温度と感情の対応）、環境ディテール（地質・植生・天候）を必ず含めること。'
    : 'この日記の中核エピソードを1つの具体的な場面として描写する英語プロンプト（AI画像生成用）。抽象的な比喩や概念図ではなく、読者が画像を見ただけで日記の内容がわかるような印象的なワンシーンを詳細に記述する。被写体の行動・表情・場所・時間帯・周辺のディテールを具体的に含めること。';

  return `以下のJSON形式で出力してください。...
  // 既存のテンプレートだが、image_promptフィールドの値を imagePromptInstruction に置換
  `;
};
```

**(b) 各build関数にstyleIdを伝播:**

| 関数 | 行 | 変更 |
|------|-----|------|
| `buildNormalPrompt` | L39 | 引数に`styleId`追加、`JSON_OUTPUT_SCHEMA(today)` → `JSON_OUTPUT_SCHEMA(today, styleId)` |
| `buildDinoStoryPrompt` | L59 | 同上 |
| `buildDinoResearchPrompt` | L91 | 同上 |
| `buildPrompt` | L127 | 引数に`styleId`追加、各build関数に伝播 |

**(c) 呼び出し箇所（L449）:**

```javascript
// 変更前
let claudePrompt = buildPrompt(effectiveMode, rawText, today, ..., styleInstruction);
// 変更後
let claudePrompt = buildPrompt(effectiveMode, rawText, today, ..., styleInstruction, styleId);
```

---

### Phase 2: プロンプト合成の優先順位変更（B-1）

> **全スタイルに影響する変更。** Phase 1の動作確認後に実施を推奨。

#### Step 2-1: `composeImagePrompt`の配列順序変更

**ファイル:** `lib/character.js`
**変更箇所:** L265-276（composed配列）
**リスク:** 中（全スタイルの画像生成に影響）

**変更内容（Scene行を配列先頭に移動するだけ）:**

```javascript
// 変更前
const composed = [
  resolved.basePrompt,                                    // [1] キャラクター
  resolved.eyeDescriptor ? `Eye detail ...` : null,       // [2] 目
  `Scene: ${diaryImagePrompt}`,                           // [3] ストーリー ←ここ
  style ? `Art style: ${style.promptPrefix}` : null,      // [4] スタイル
  ...
];

// 変更後
const composed = [
  `Scene: ${diaryImagePrompt}`,                           // [1] ★ストーリー最優先
  resolved.basePrompt,                                    // [2] キャラクター
  resolved.eyeDescriptor ? `Eye detail ...` : null,       // [3] 目
  style ? `Art style: ${style.promptPrefix}` : null,      // [4] スタイル
  ...
];
```

**影響分析:**
- **oilpainting:** 最も恩恵が大きい。Phase 1で強化されたストーリーリッチなimage_promptが先頭に来る
- **illustration:** フラットイラストではスタイル指示が強いため影響限定的
- **popillust:** ポップアートの強い視覚スタイルが維持される
- **character=null:** L248-258の別パスを通るため**影響なし**

**ロールバック:** Scene行を元の位置（basePrompt, eyeDescriptorの後）に戻すだけで完全復元可能

---

### Phase 3: テスト追加・既存テスト修正

#### Step 3-1: `image-styles.test.js` — oilpainting claudeInstruction検証

**ファイル:** `tests/image-styles.test.js`
**依存:** Step 1-1

```javascript
it('oilpaintingのclaudeInstructionにストーリー駆動の【必須要素】が含まれること', () => {
  const inst = getStyleClaudeInstruction('oilpainting');
  expect(inst).toContain('【必須要素】');
  expect(inst).toContain('行動と感情');
  expect(inst).toContain('物語的意味');
  expect(inst).toContain('構図');
  expect(inst).toContain('ライティング');
  expect(inst).toContain('環境ストーリーテリング');
});
```

#### Step 3-2: `create-diary` スタイル別分岐テスト

**ファイル:** `tests/create-diary-ratelimit.test.js` または新規 `tests/create-diary-schema.test.js`
**依存:** Step 1-2

**方針:** `JSON_OUTPUT_SCHEMA`を`export const`にしてnamed exportとして直接テスト。Vercelはdefault exportの`handler`をエントリポイントとするためnamed export追加は安全。

```javascript
import { JSON_OUTPUT_SCHEMA } from '../api/create-diary.js';

describe('JSON_OUTPUT_SCHEMA - スタイル別image_prompt分岐', () => {
  it('oilpainting: ストーリー駆動の指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'oilpainting');
    expect(schema).toContain('最も劇的・印象的な瞬間');
    expect(schema).toContain('物語的意味');
  });

  it('illustration: 従来の汎用指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'illustration');
    expect(schema).toContain('中核エピソード');
    expect(schema).not.toContain('物語的意味');
  });

  it('popillust: 従来の汎用指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'popillust');
    expect(schema).toContain('中核エピソード');
  });
});
```

#### Step 3-3: `character.test.js` — プロンプト順序検証

**ファイル:** `tests/character.test.js`
**依存:** Step 2-1

```javascript
it('Sceneがプロンプトの先頭付近に配置されること（ストーリー優先）', () => {
  const character = createValidCharacter();
  const result = composeImagePrompt('A dramatic survival scene', character, 'oilpainting');
  const sceneIndex = result.prompt.indexOf('Scene:');
  const basePromptIndex = result.prompt.indexOf(character.imgGen.basePrompt.substring(0, 20));
  expect(sceneIndex).toBeLessThan(basePromptIndex);
});

it('Scene要素がArt style要素より前に来ること', () => {
  const character = createValidCharacter();
  const result = composeImagePrompt('A tense hunting scene', character, 'oilpainting');
  const sceneIndex = result.prompt.indexOf('Scene:');
  const artStyleIndex = result.prompt.indexOf('Art style:');
  expect(sceneIndex).toBeLessThan(artStyleIndex);
});
```

---

## 実装順序まとめ

| 順序 | ステップ | ファイル | リスク | 変更量 |
|------|----------|---------|--------|--------|
| 1 | Step 1-1: claudeInstruction強化 | `lib/image-styles.js` L16 | 低 | 文字列1箇所 |
| 2 | Step 1-2: JSON_OUTPUT_SCHEMA分岐 | `api/create-diary.js` L26-37,39,59,91,127,449 | 低〜中 | 関数シグネチャ5箇所+分岐1箇所 |
| 3 | Step 3-1: スタイルテスト追加 | `tests/image-styles.test.js` | 低 | テスト1件 |
| 4 | Step 3-2: スキーマ分岐テスト追加 | `tests/create-diary-schema.test.js`（新規） | 低 | テスト3件 |
| 5 | **`npm test` — Phase 1動作確認** | — | — | 全テスト通過確認 |
| 6 | Step 2-1: composeImagePrompt順序変更 | `lib/character.js` L265-276 | 中 | 配列要素移動1箇所 |
| 7 | Step 3-3: 順序検証テスト追加 | `tests/character.test.js` | 中 | テスト2件 |
| 8 | **`npm test` — Phase 2動作確認** | — | — | 全テスト通過確認 |

---

## リスク評価

| リスク | 説明 | 軽減策 |
|--------|------|--------|
| **全スタイルへの影響**（Step 2-1） | Scene配置変更が全スタイルのプロンプト構造を変える | 各スタイルで手動比較。`toContain`既存テストは順序非依存で壊れにくい |
| **Claude出力品質変動**（Step 1-1/1-2） | 指示変更によりClaude出力が予期せず変化 | Phase 1完了後に手動テストで出力品質確認→Phase 2に進む |
| **プロンプト長超過** | ストーリー詳細指示でimage_promptが長くなる | 既存ガード: `.slice(0, 3800)` + `PROMPT_WARN_THRESHOLD` 警告 |
| **JSON_OUTPUT_SCHEMAのexport** | named export追加によるVercel影響 | Vercelはdefault export `handler`のみ使用。不安なら統合テスト（案B）を採用 |

---

## 成功基準

- [ ] oilpaintingのclaudeInstructionに5つの必須要素が含まれている
- [ ] JSON_OUTPUT_SCHEMAがoilpainting時にストーリー駆動のimage_prompt定義を使用する
- [ ] composeImagePromptでScene要素がプロンプト先頭に配置される
- [ ] 既存テスト全件パス
- [ ] 追加テスト6件パス
- [ ] 手動テスト: oilpaintingで生成したimage_promptにストーリー要素が明確に含まれる
- [ ] 手動テスト: illustration/popillustの画像品質に退行がない

---

## 検証用リファレンス

`plans/concept-art-prompts.md` に8シーンの参照プロンプトあり。
修正後のシステムがこれと同等品質のimage_promptを自動生成できるか比較検証すること。

---

*元計画書: plans/story-driven-paleoart.md*
*作成: 2026-03-30*
