# 手動テスト計画: パレオアートモード ストーリー反映改善

> **前提:** ExecPlan全Phase（1/2/3）の実装・自動テスト（470件）完了済み
> **目的:** Claude/DALL-Eの出力品質を目視確認し、ExecPlan成功基準の残り2項目をクリアする

---

## テスト1: oilpainting品質確認

### 目的
oilpaintingモードで生成されたimage_promptに、ストーリー駆動の5要素が含まれることを確認する。

### 手順

1. **diary-input.html** で以下のテストケースを入力（スタイル: oilpainting）

#### テストケース1-A: 感情の転換点
```
今日、ずっと怖かった海に初めて飛び込んだ。
最初は足がすくんで動けなかったけど、友達が手を差し伸べてくれた瞬間、
体が勝手に動いた。水面に飛び込んだ時、世界が青く静かになって、
怖さが全部消えた。水中で目を開けたら、太陽の光が揺れていてきれいだった。
```

#### テストケース1-B: 対立と発見（恐竜モード）
```
森の奥で見つけた巣には、小さな卵が3つあった。
親竜がいないのは嵐のせいだと思った。
卵を温めていたら、突然茂みから低いうなり声。
振り返ると、巨大なティラノサウルスが歯をむき出しにして立っていた。
でも不思議と、攻撃してこない。よく見ると足を引きずっている。怪我をしているんだ。
```

2. **確認項目** — 生成されたimage_promptに以下が含まれるか:

| # | 要素 | 確認観点 | 合格基準 |
|---|------|---------|---------|
| 1 | 行動と感情 | 主人公が何をしているか、感情が描写されているか | 具体的な動詞＋感情語（fear→courage, curiosity等） |
| 2 | 物語的意味 | 転換点・対立・発見が表現されているか | シーンの意味が読み取れる構図 |
| 3 | 構図 | カメラアングル・前景/背景の指定があるか | low angle, close-up, foreground/background等 |
| 4 | ライティング | 色温度と感情の対応があるか | warm/cold light, golden hour, dramatic shadow等 |
| 5 | 環境ディテール | 地質・植生・天候が物語を反映しているか | 具体的な環境描写（not generic landscape） |

3. **参照基準**: `plans/concept-art-prompts.md` の8シーンと同等品質かを比較

### 判定
- 5要素中4つ以上含まれていれば **PASS**
- 3つ以下の場合は **FAIL** → claudeInstruction/JSON_OUTPUT_SCHEMAの調整が必要

---

## テスト2: illustration/popillust退行確認

### 目的
Phase 2の`composeImagePrompt`順序変更（全スタイル影響）により、illustration/popillustの画像品質が劣化していないことを確認する。

### 手順

1. **同一テキスト**（テストケース1-A）を3スタイルで生成:
   - oilpainting
   - illustration
   - popillust

2. **確認項目**:

| # | 確認観点 | 合格基準 |
|---|---------|---------|
| 1 | スタイル識別 | 各スタイルの画風が正しく反映されている（油絵/フラットイラスト/ポップアート） |
| 2 | Scene反映 | image_promptの内容が画像に反映されている |
| 3 | キャラクター | キャラクター設定がある場合、特徴が維持されている |
| 4 | Art style欠落 | DALL-E使用時、スタイル識別語（Flat illustration / Dynamic pop-art / Acrylic paleoart）が画像に反映されている |

3. **変更前との比較**（可能であれば）:
   - 同じテキストで変更前（コミット`69f93a6`以前）の画像と比較
   - 画風の一貫性、ディテールの品質が維持されていることを確認

### 判定
- 4項目すべて問題なければ **PASS**
- スタイル識別不能またはArt style欠落があれば **FAIL** → composeImagePrompt順序の再調整が必要

---

## テスト実施方法

### 方法A: 本番環境（推奨）
```
1. https://my-voice-diary.vercel.app/diary-input.html にアクセス
2. JWT認証トークンを入力
3. テストテキストを入力、スタイルを選択
4. 「日記作成」→ image_promptを確認
5. 「画像生成」→ 画像を目視確認
```

### 方法B: curlでAPI直接呼び出し
```bash
# JWT生成
TOKEN=$(node scripts/generate-jwt.js)

# create-diary（oilpainting）
curl -X POST https://my-voice-diary.vercel.app/api/create-diary \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "rawText": "テストテキスト...",
    "styleId": "oilpainting",
    "mode": "normal"
  }'

# レスポンスのimage_promptを確認
# generate-imageはimageTokenを使用して呼び出し
```

---

## 注意事項

- DALL-E 3の画像生成コスト: $0.04/枚（テスト3スタイル×2ケース = 最大$0.24）
- Gemini NB2/NBproが優先使用される場合はコスト無料
- レート制限: create-diary 30req/日、generate-image 10req/日
- テスト結果は本HANDOFFに記録すること

---

*作成: 2026-04-03*
*ExecPlan: plans/story-driven-paleoart-exec.md*
