# バグ修正計画: 日記作成初回エラー + 画像生成504

## 問題概要

### Bug ①: 日記作成 初回500 → リトライ成功
**Vercelログ証拠（3回再現）:**
```
07:22:43 POST /api/create-diary → 500: LLM出力スキーマ検証エラー: [ 'image_pr...
07:23:10 POST /api/create-diary → 200 (成功)
```

**原因仮説（2系統）:**

**(A) LLMの欠落出力:** Claude APIが`image_prompt`フィールドを含まない（または不完全な）JSONを返す。
- `api/create-diary.js` L554: `image_prompt`が必須フィールドとして検証されており、欠落時は500エラー
- Claude APIの`max_tokens: 2000`で出力が切り詰められる可能性
- **観測指標:** Claude APIレスポンスのテキスト長、JSON構造の完全性をログに記録

**(B) 処理時間超過:** Vercelデフォルトタイムアウトによりリクエストが中断される。
- `create-diary.js`は`vercel.json`に`maxDuration`が**未設定** → Hobbyプランデフォルト10秒
- Claude API呼び出し（L471）にタイムアウト未設定 → Vercelがランタイムを強制終了
- **観測指標:** Claude API応答時間をconsole.timeで計測、AbortError発生ログ

**両仮説とも対策が必要:**
- (A)対策: image_promptフォールバック + ログ強化
- (B)対策: maxDuration追加 + AbortSignal.timeout()

### Bug ②: 画像生成 HTTP 504
**Vercelログ証拠（3/3回100%失敗）:**
```
07:23:31 POST /api/generate-image → 504: Vercel Runtime Timeout Error
```

**根本原因:** DALL-E 3のAPI呼び出しにタイムアウト未設定、Vercel 30秒制限を超過。
- `lib/image-backend.js` L89: `fetch()`にAbortSignal.timeout()なし
- `api/generate-image.js`: 7つのfetch呼び出しすべてにタイムアウトなし
- `loadCharacter()`（`lib/character.js`内fetch）もタイムアウト未設定
- `generateWithGemini()`（SDK呼び出し）もタイムアウト未設定
- DALL-E 3は通常10-60秒かかる → 30秒maxDurationでは不足
- `post-instagram.js`にはデッドライン管理（getRemainingTimeout + null判定）があるが、`generate-image.js`にはない

---

## 修正計画

### Phase 1: Bug ① — create-diary LLM出力エラー修正

#### 1-1. `vercel.json`にcreate-diaryのmaxDurationを追加
**ファイル:** `vercel.json`
**変更:** `api/create-diary.js`のmaxDurationを30秒に設定

```json
"api/create-diary.js": {
  "maxDuration": 30
}
```

**理由:** 現在未設定 → Hobbyプランデフォルト10秒。Claude API応答が10秒を超えると切断され、不完全なレスポンスになる。

#### 1-2. Claude API呼び出しにAbortSignal.timeout()追加
**ファイル:** `api/create-diary.js` L471-483
**変更:** fetch呼び出しにタイムアウト追加（25秒、Vercel 30秒のうち5秒をバッファ）

```javascript
const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ ... }),
  signal: AbortSignal.timeout(25_000), // 25秒タイムアウト
});
```

#### 1-3. image_promptフォールバック追加（防御的対策）
**ファイル:** `api/create-diary.js` L553-558
**変更:** `image_prompt`が欠落した場合、titleベースのフォールバックを生成

```javascript
// image_prompt検証（string、1-500文字）— 欠落時はフォールバック
if (!data.image_prompt || typeof data.image_prompt !== 'string') {
  // フォールバック: titleから英語プロンプトを生成
  data.image_prompt = `A diary illustration about: ${data.title}`;
  console.warn('image_prompt欠落、フォールバック使用:', data.image_prompt);
} else if (data.image_prompt.length > 500) {
  data.image_prompt = data.image_prompt.substring(0, 500);
}
```

**理由:** Claude APIのレスポンスが稀に`image_prompt`を省略する場合でも、日記作成自体は成功させるべき。画像プロンプトは副次的な機能。

#### 1-4. 診断ログ追加（原因仮説の検証用）
**ファイル:** `api/create-diary.js`
**変更:** Claude API呼び出し前後に計測ログを追加

```javascript
const claudeStart = Date.now();
const claudeResponse = await fetch('...', { signal: AbortSignal.timeout(25_000) });
console.log(`Claude API応答時間: ${Date.now() - claudeStart}ms`);

// レスポンステキスト取得後
console.log(`Claude出力長: ${responseText.length}文字`);
```

**理由:** 原因仮説(A)/(B)のどちらが支配的かを本番ログから判定するため。

---

### Phase 2: Bug ② — generate-image 504タイムアウト修正

#### 2-1. `vercel.json`のmaxDurationを60秒に拡大
**ファイル:** `vercel.json`
**変更:** `api/generate-image.js`のmaxDurationを60秒に変更（Hobbyプラン上限）

```json
"api/generate-image.js": {
  "maxDuration": 60
}
```

**理由:** DALL-E 3は10-60秒かかることがあり、現在の30秒では不足。Hobbyプランは最大60秒まで設定可能。

#### 2-2. generate-image.jsにデッドライン管理追加（post-instagram.jsパターン準拠）
**ファイル:** `api/generate-image.js`
**変更:** `post-instagram.js`のgetRemainingTimeout + null判定パターンを採用

```javascript
// ハンドラ冒頭でデッドライン設定（絶対時刻）
const deadline = Date.now() + 55_000; // 55秒デッドライン（5秒バッファ）

// ヘルパー関数（post-instagram.js準拠: null返却で打ち切り判定）
// fixedLimit: この操作の上限タイムアウト（例: Redis 5秒、GitHub 10秒）
// 戻り値: min(fixedLimit, 残り時間) または null（時間切れ）
function getRemainingTimeout(fixedLimit) {
  const remaining = deadline - Date.now() - 1_000; // 1秒マージン
  if (remaining <= 0) return null; // 時間切れ
  return Math.min(fixedLimit, remaining);
}

// 各外部I/O前にnull判定 → 時間切れなら即504返却
const timeout = getRemainingTimeout(5_000);
if (timeout === null) {
  return res.status(504).json({ error: '処理がタイムアウトしました。再度お試しください。' });
}
const countRes = await fetch(`${UPSTASH_URL}/incr/...`, {
  headers: { ... },
  signal: AbortSignal.timeout(timeout),
});
```

**各fetch呼び出しのタイムアウト設定:**
- Upstash INCR: `getRemainingTimeout(5_000)`
- Upstash EXPIRE: `getRemainingTimeout(5_000)`
- GitHub diary fetch: `getRemainingTimeout(10_000)`
- loadCharacter: `getRemainingTimeout(5_000)` （signalパラメータ追加、下記2-3参照）
- 画像生成: **deadlineそのものを`generateImageWithFallback`に渡す**（下記2-3参照）
- GitHub GET SHA: `getRemainingTimeout(5_000)`
- GitHub PUT image: `getRemainingTimeout(10_000)`

#### 2-3. generateImageWithFallbackに絶対デッドラインを伝播
**ファイル:** `lib/image-backend.js` L136
**変更:** 固定タイムアウトではなく**絶対時刻deadline**を受け取り、**各バックエンド試行ごとにループ内で残時間を再計算**する

```javascript
/**
 * @param {string} prompt
 * @param {string} negativePrompt
 * @param {number} [deadline] - 絶対時刻（Date.now()ベース）。未指定時はタイムアウトなし。
 */
export async function generateImageWithFallback(prompt, negativePrompt, deadline) {
  const chain = getFallbackChain();
  const MARGIN = 2_000; // 2秒マージン
  let lastError = null; // ★ 最後のエラーを保持（タイムアウト原因の伝播用）

  for (const target of chain) {
    const apiKey = getApiKey(target.backend);
    if (!apiKey) continue;

    // ★ 各試行前に残時間を再計算（前の試行で消費した時間を反映）
    let remaining;
    if (deadline !== undefined) {
      remaining = deadline - Date.now() - MARGIN;
      if (remaining <= 0) {
        const err = new Error('画像生成のタイムアウト: 残り時間なし');
        err.code = 'DEADLINE_EXCEEDED';
        throw err;
      }
    }

    try {
      if (target.backend === 'gemini') {
        return await generateWithGemini(prompt, negativePrompt, target.model, target.name, apiKey, remaining);
      } else {
        return await generateWithDalle(prompt, apiKey, remaining);
      }
    } catch (err) {
      lastError = err; // ★ 最後のエラーを記録
      console.warn(`${target.name} failed: ${sanitizeError(err.message, apiKey)}`);
      continue;
    }
  }

  // ★ 最後のエラーがタイムアウト系なら、そのまま再throw（504マッピング用）
  if (lastError && isTimeoutLike(lastError)) {
    throw lastError; // AbortError/DEADLINE_EXCEEDED等がそのまま伝播
  }
  throw new Error('全画像生成バックエンドが失敗しました');
}

// タイムアウト系エラー判定（内部用）
function isTimeoutLike(err) {
  return err.name === 'AbortError' || err.name === 'TimeoutError' ||
         err.code === 'DEADLINE_EXCEEDED' || err.code === 'GEMINI_TIMEOUT';
}
```

**呼び出し側（generate-image.js）:**
```javascript
// deadlineそのものを渡す（固定タイムアウトではない）
const { imageData, backend, model, modelId } = await generateImageWithFallback(
  composedPrompt, negativePrompt, deadline
);
```

**generateWithDalle にタイムアウト追加:**
```javascript
async function generateWithDalle(prompt, apiKey, timeoutMs) {
  const fetchOpts = {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ ... }),
  };
  if (timeoutMs !== undefined) {
    fetchOpts.signal = AbortSignal.timeout(timeoutMs);
  }
  const response = await fetch('https://api.openai.com/v1/images/generations', fetchOpts);
  // ...
}
```

**generateWithGemini にタイムアウト追加（clearTimeout付き）:**
```javascript
async function generateWithGemini(prompt, negativePrompt, model, name, apiKey, timeoutMs) {
  const generatePromise = genAI.models.generateContent({ ... });

  if (timeoutMs !== undefined) {
    // Promise.raceタイムアウト（タイマー解除付き、code付与）
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        const err = new Error(`${name} タイムアウト (${timeoutMs}ms)`);
        err.code = 'GEMINI_TIMEOUT'; // ★ 機械判定可能なコード（文字列依存を排除）
        reject(err);
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([generatePromise, timeoutPromise]);
      return response;
    } finally {
      clearTimeout(timerId); // ★ 成功/失敗に関わらずタイマー解除
    }
    // 注意: タイムアウト後の遅延完了結果は握りつぶされる（短命なServerless関数のため問題なし）
  } else {
    const response = await generatePromise;
    return response;
  }
  // ...
}
```

#### 2-4. loadCharacterにsignalパラメータ追加
**ファイル:** `lib/character.js` L55
**変更:** GitHub API fetchにAbortSignalを受け渡し可能にする

```javascript
export async function loadCharacter(characterId, githubConfig, options = {}) {
  // ...
  const fetchOpts = {
    headers: { ... },
  };
  if (options.signal) {
    fetchOpts.signal = options.signal;
  }
  const response = await fetch(apiUrl, fetchOpts);
  // ...
}
```

**呼び出し側（generate-image.js）— fail-open設計:**
```javascript
// loadCharacterはfail-open: タイムアウトしてもcharacter=nullで続行（画像生成自体は実行）
const charTimeout = getRemainingTimeout(5_000);
if (characterId && charTimeout !== null) {
  try {
    character = await loadCharacter(characterId, githubConfig, {
      signal: AbortSignal.timeout(charTimeout),
    });
  } catch (charErr) {
    console.warn('キャラクター読み込み失敗（続行）:', charErr.message);
    character = null; // fail-open: キャラクターなしで画像生成を続行
  }
}
// charTimeout === null の場合もcharacter=nullのまま続行（時間切れでも画像生成は試みる）
```

**方針:** loadCharacterはキャラクター装飾のためのオプション機能であり、タイムアウトや失敗時は画像生成自体を中止しない（fail-open）。これは`create-diary.js`と同じ方針。504返却はloadCharacterではなく、画像生成本体（generateImageWithFallback）のタイムアウトに対してのみ適用する。

#### 2-5. generate-image.jsにタイムアウトエラー分類を追加
**ファイル:** `api/generate-image.js`
**変更:** 包括catchでタイムアウト系エラーを識別し、500ではなく504を返す

```javascript
// タイムアウトエラー判定ヘルパー
function isTimeoutError(err) {
  // fetch AbortSignal.timeout()が投げるAbortError/TimeoutError
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  // generateImageWithFallback のdeadline超過 / Geminiタイムアウト（codeベース判定）
  if (err.code === 'DEADLINE_EXCEEDED' || err.code === 'GEMINI_TIMEOUT') return true;
  return false;
}

// ハンドラの包括catch内
} catch (error) {
  console.error('画像生成エラー:', sanitizeError(error.message));

  // ★ タイムアウト系エラーは504、その他は500
  if (isTimeoutError(error)) {
    return res.status(504).json({
      error: '画像生成がタイムアウトしました。再度お試しください。'
    });
  }

  return res.status(500).json({
    error: '画像の生成中にエラーが発生しました。'
  });
}
```

**理由:** `generateImageWithFallback`内のAbortError、DEADLINE_EXCEEDEDエラー、Gemini Promise.raceタイムアウトが現行の包括catchでは500に分類される。ユーザーには「タイムアウト → 再試行」を案内するため504に明示分類する。

---

## 変更ファイル一覧

| ファイル | Phase | 変更内容 |
|---------|-------|---------|
| `vercel.json` | 1+2 | create-diary maxDuration追加(30s)、generate-image maxDuration拡大(60s) |
| `api/create-diary.js` | 1 | Claude APIタイムアウト(25s)、image_promptフォールバック、診断ログ |
| `lib/image-backend.js` | 2 | deadline伝播（絶対時刻）、ループ内残時間再計算、DALL-E 3 AbortSignal、Gemini Promise.race+clearTimeout |
| `lib/character.js` | 2 | loadCharacterにoptional signal受け渡し |
| `api/generate-image.js` | 2 | デッドライン管理(55s)、getRemainingTimeout+null判定、全fetchタイムアウト、isTimeoutError分類→504 |

## テスト方針

### 既存テスト
- `npm test` で全テスト通過を確認（既存368テスト）
- `lib/image-backend.js`のシグネチャ変更に伴い、既存テストの呼び出しを更新

### 追加テスト

#### create-diary テスト
1. **image_promptフォールバック:** Claude APIがimage_prompt未返却時、titleベースのフォールバックで日記作成成功
2. **Claude APIタイムアウト:** AbortError発生時の適切なエラーメッセージ返却

#### generate-image テスト
3. **残時間不足時の即504:** getRemainingTimeout()がnull返却時、504レスポンスを返すこと
4. **DALL-E タイムアウト時のフォールバック:** DALL-E 3がAbortErrorで失敗 → 次バックエンド試行 → 最終エラー整形
5. **デッドライン超過時のエラーメッセージ:** 504レスポンスにユーザーフレンドリーなメッセージ

#### image-backend テスト
6. **AbortError時のフォールバック動作:** 1つのバックエンドがタイムアウト → 次のバックエンドへ継続
7. **全バックエンドタイムアウト時:** 適切なエラーメッセージで拒否
8. **deadline超過で即エラー:** deadline < Date.now()の場合、試行せず即時エラー
9. **残時間減衰の検証:** 1回目バックエンドで時間消費後、2回目に渡るtimeoutMsが小さくなること（deadline基準で再計算されること）
10. **途中で残時間不足:** 1回目試行後にdeadline超過 → 2回目試行せず即時失敗 → ハンドラ側で504にマップ

#### character テスト
11. **loadCharacter signal受け渡し:** signal付きfetchが正常動作すること
12. **loadCharacter タイムアウト時のfail-open:** generate-image.jsのtry/catchでAbortError発生 → character=nullで画像生成続行（504にならない）

#### generate-image 統合テスト（504マッピング）
13. **fetch AbortError → 504:** DALL-E 3のfetchがAbortErrorで失敗 → レスポンスが504であること
14. **Gemini race timeout → 504:** GeminiがPromise.raceタイムアウト → レスポンスが504であること
15. **DEADLINE_EXCEEDED → 504:** generateImageWithFallbackがDEADLINE_EXCEEDEDコード付きエラー → 504であること
16. **通常エラー → 500:** タイムアウト以外のエラー（API key invalid等）→ 500であること

## リスク評価

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| maxDuration 60秒でもDALL-E 3がタイムアウト | 低 | 中 | タイムアウト時のユーザーフレンドリーな504メッセージ |
| image_promptフォールバックの画質低下 | 中 | 低 | フォールバック使用時にログ記録、UXに影響なし |
| Gemini SDK Promise.race競合 | 低 | 低 | finally内でclearTimeout実行、遅延完了結果は握りつぶし（短命なServerless関数） |
| loadCharacterシグネチャ変更の後方互換 | 極低 | 低 | optionsパラメータはデフォルト空オブジェクト |

## 実装順序

1. `vercel.json` 更新（即効性あり、create-diary 30s + generate-image 60s）
2. `api/create-diary.js` 修正（Bug ① 解消: タイムアウト + フォールバック + 診断ログ）
3. `lib/character.js` 修正（signal受け渡し追加）
4. `lib/image-backend.js` 修正（timeoutMs伝播 + DALL-E/Geminiタイムアウト）
5. `api/generate-image.js` 修正（Bug ② 解消: デッドライン管理 + null判定504）
6. テスト追加・実行
7. codex-review
8. コミット＆プッシュ
