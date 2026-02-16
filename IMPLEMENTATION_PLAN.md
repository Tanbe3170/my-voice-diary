# voice-diary 実装計画 v2（音声入力＋Instagram自動投稿対応版）

> **更新日**: 2025年2月11日  
> **対象**: 音声入力（スマホ＋Ubuntu）とInstagram Graph API完全自動投稿を含む完全版

---

## 📋 全体スケジュール

| Phase | 内容 | 期間 | 工数 | コスト | 状態 |
|-------|------|------|------|--------|------|
| Phase 1 | 基本機能（手動テキスト入力） | 2-3日 | 8時間 | $0 | 🔄 85%完了 |
| Phase 2 | Webフォーム＋音声入力（スマホ） | 3-4日 | 12時間 | $0* | 📅 未着手 |
| Phase 3 | Ubuntu音声認識（Nerd Dictation） | 1-2日 | 4時間 | $0 | 📅 未着手 |
| Phase 4 | AI画像生成（DALL-E 3） | 2-3日 | 8時間 | ~$0.04/枚 | 📅 未着手 |
| Phase 5 | Instagram完全自動投稿 | 3-4日 | 10時間 | $0 | 📅 未着手 |

*SuperWhisper使用時は買い切りアプリ購入費が発生

**合計工数**: 約42時間  
**完成目標**: 3週間以内  
**月間ランニングコスト**: ~$0.3（Claude API使用料のみ）

---

## 🎯 システム全体像（最終形）

```
┌─────────────────────────────────────────────────────────────────┐
│                    voice-diary 完全版システム                    │
└─────────────────────────────────────────────────────────────────┘

[入力経路A: スマホ音声入力]
  音声 → SuperWhisper → テキスト → Webフォーム貼り付け
           ↓
  音声 → Web Speech API → テキスト自動入力 → Webフォーム
           ↓
  [GitHub API] ← GitHub Personal Access Token認証
           ↓
  GitHubリポジトリに直接push (diaries/YYYY/MM/YYYY-MM-DD.md)

[入力経路B: Ubuntu PC音声入力]
  音声 → Nerd Dictation → クリップボード → diary-push.sh
           ↓
  Claude API (日記整形)
           ↓
  GitHubリポジトリにpush

[処理・保存層]
  GitHubリポジトリ (my-voice-diary)
    ├── diaries/YYYY/MM/YYYY-MM-DD.md  (日記本文)
    ├── images/YYYY-MM-DD.png           (AI生成画像)
    └── docs/ (GitHub Pages)

[閲覧層]
  GitHub Pages (https://tanbe3170.github.io/my-voice-diary/)
    ├── カレンダービュー
    ├── タグ検索
    └── 日記詳細表示

[投稿層]
  Instagram Graph API
    ├── 画像＋キャプション自動投稿
    ├── ハッシュタグ自動付与
    └── エラーハンドリング＋リトライ
```

---

## ✅ Phase 1: 基本機能（手動テキスト入力）【85%完了】

### 完了済み
- [x] Python環境構築
- [x] Claude API設定
- [x] GitHub認証設定
- [x] `diary-summarize.py` 実装・テスト完了
- [x] `diary-push.sh` 実装・テスト完了
- [x] 1日目の日記作成完了

### 残りタスク

#### タスク1.6: 残り2日分の日記作成（30分）

```bash
cd ~/diary

# 2日目の日記
bash scripts/diary-push.sh "今日は午前中にvoice-diaryのPhase 2の設計を行った。Webフォームと音声認識APIの実装方針を固めることができた。午後はドキュメントの整理を進めた。"

# 3日目の日記
bash scripts/diary-push.sh "今日はGitHub Pagesの基本構造を学習した。HTMLとJavaScriptでMarkdownを読み込む方法を調査し、実装イメージが掴めてきた。明日から本格的にコーディングを開始する予定。"
```

**確認項目**:
- [ ] `diaries/2026/02/` に3つの日記ファイルが存在
- [ ] GitHub上で3つの日記が表示される
- [ ] 各日記のフォーマットが統一されている

---

#### タスク1.7: Phase 1 振り返り（30分）

**評価シート**:

| 項目 | 評価（1-5） | 改善案 |
|------|-------------|--------|
| 日記整形品質 |  | |
| タイトル生成 |  | |
| サマリーの要約精度 |  | |
| 口語→文語変換の自然さ |  | |
| ハッシュタグの適切さ |  | |
| 処理時間（目標1分以内） |  | |

**改善が必要な場合**:
→ `TECHNICAL_SPEC.md` の「7.1 日記整形プロンプト」を調整

---

#### タスク1.8: codex-review実施（必須）

**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** scripts/ 配下の diary-summarize.py, diary-push.sh

---

## 🌐 Phase 2: Webフォーム＋スマホ音声入力【新規】

### 目標
スマホから音声入力で日記を作成し、GitHubに直接保存できるWebアプリを構築する。

### 成果物
1. `docs/index.html` - 日記一覧＋カレンダービュー
2. `docs/diary-input.html` - 音声入力対応Webフォーム（PWA対応）
3. `docs/diary-detail.html` - 日記詳細表示ページ
4. `docs/style.css` - レスポンシブCSS
5. `docs/app.js` - メインロジック
6. `docs/manifest.json` - PWA設定
7. `docs/service-worker.js` - オフライン対応

---

### タスク2.1: GitHub Pages有効化（10分）

**手順**:
1. https://github.com/Tanbe3170/my-voice-diary にアクセス
2. **Settings** → **Pages**
3. **Source**: "Deploy from a branch"
4. **Branch**: `main`
5. **Folder**: `/docs`
6. **Save**

**確認**:
- 5分後、https://tanbe3170.github.io/my-voice-diary/ にアクセス
- 「404」が表示されればOK（まだファイルがないため）

---

### タスク2.2: 基本HTML構造作成（1時間）

#### ファイル: `docs/index.html`

**機能**:
- 日記一覧表示
- 月次カレンダービュー
- タグフィルタリング
- 日記作成ボタン（diary-input.html へリンク）

**実装のポイント**:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Voice Diary</title>
  <link rel="stylesheet" href="style.css">
  <link rel="manifest" href="manifest.json">
</head>
<body>
  <header>
    <h1>📖 My Voice Diary</h1>
    <button id="create-diary-btn" onclick="location.href='diary-input.html'">
      ✏️ 新しい日記を作成
    </button>
  </header>

  <main>
    <section id="calendar-view">
      <!-- カレンダーをJavaScriptで動的生成 -->
    </section>

    <section id="diary-list">
      <!-- 日記一覧をJavaScriptで動的生成 -->
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

---

### タスク2.3: 音声入力対応Webフォーム作成（3時間）★重要

#### ファイル: `docs/diary-input.html`

**機能**:
1. **SuperWhisper対応**: テキストエリアに貼り付け
2. **Web Speech API**: ブラウザ音声認識ボタン
3. Claude API呼び出し（diary-summarize.py相当の処理）
4. GitHub API経由でMarkdownファイル作成＋push

**実装**:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>日記作成 - My Voice Diary</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>✏️ 日記を作成</h1>
    <button onclick="location.href='index.html'">← 戻る</button>
  </header>

  <main>
    <div class="input-methods">
      <h2>入力方法を選択</h2>
      
      <!-- 方法1: SuperWhisper貼り付け -->
      <div class="method">
        <h3>📱 SuperWhisper（推奨）</h3>
        <p>SuperWhisperで音声をテキスト化し、下のテキストエリアに貼り付けてください。</p>
      </div>

      <!-- 方法2: Web Speech API -->
      <div class="method">
        <h3>🎤 ブラウザ音声認識</h3>
        <button id="voice-btn" class="voice-button">
          🎤 音声入力を開始
        </button>
        <span id="voice-status"></span>
      </div>

      <!-- 方法3: 手動入力 -->
      <div class="method">
        <h3>⌨️ 手動入力</h3>
        <p>直接テキストを入力してください。</p>
      </div>
    </div>

    <div class="input-area">
      <label for="diary-text">日記の内容（口語でOK）</label>
      <textarea 
        id="diary-text" 
        rows="15" 
        placeholder="今日は朝から...&#10;&#10;音声入力、または直接入力してください。"
      ></textarea>

      <button id="process-btn" class="primary-button">
        🤖 Claude APIで整形してGitHubに保存
      </button>

      <div id="progress" style="display:none;">
        <p>処理中...</p>
        <progress id="progress-bar" max="100" value="0"></progress>
      </div>

      <div id="result" style="display:none;"></div>
    </div>
  </main>

  <script>
    // === Web Speech API 実装 ===
    const voiceBtn = document.getElementById('voice-btn');
    const voiceStatus = document.getElementById('voice-status');
    const diaryText = document.getElementById('diary-text');

    let recognition;
    let isRecording = false;

    // ブラウザの音声認識APIをチェック
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;

      voiceBtn.onclick = () => {
        if (!isRecording) {
          recognition.start();
          isRecording = true;
          voiceBtn.textContent = '⏹️ 停止';
          voiceBtn.classList.add('recording');
          voiceStatus.textContent = '🎤 録音中...';
        } else {
          recognition.stop();
          isRecording = false;
          voiceBtn.textContent = '🎤 音声入力を開始';
          voiceBtn.classList.remove('recording');
          voiceStatus.textContent = '';
        }
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          diaryText.value += finalTranscript;
        }
        voiceStatus.textContent = `🎤 認識中: ${interimTranscript}`;
      };

      recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        voiceStatus.textContent = `❌ エラー: ${event.error}`;
        isRecording = false;
        voiceBtn.textContent = '🎤 音声入力を開始';
        voiceBtn.classList.remove('recording');
      };

      recognition.onend = () => {
        if (isRecording) {
          recognition.start(); // 継続録音
        }
      };
    } else {
      voiceBtn.disabled = true;
      voiceBtn.textContent = '❌ 音声認識非対応';
      voiceStatus.textContent = 'このブラウザは音声認識に対応していません';
    }

    // === Claude API + GitHub API 連携処理 ===
    const processBtn = document.getElementById('process-btn');
    const progressDiv = document.getElementById('progress');
    const progressBar = document.getElementById('progress-bar');
    const resultDiv = document.getElementById('result');

    processBtn.onclick = async () => {
      const rawText = diaryText.value.trim();
      
      if (!rawText) {
        alert('日記の内容を入力してください。');
        return;
      }

      // GitHub Personal Access Token（セキュリティ改善: sessionStorageに変更）
      // ※Phase 2では当初localStorageを使用していたが、セキュリティレビュー後にsessionStorageへ移行
      let githubToken = sessionStorage.getItem('github_token');
      if (!githubToken) {
        // セキュリティ警告を表示
        const securityWarning = `⚠️ セキュリティ警告（暫定措置）

このアプリは個人使用を前提としており、APIキーをブラウザに一時保存します。

【注意事項】
• 共有PCでは使用しないでください
• sessionStorage使用のためタブ終了で消えますが、完全保証ではありません
• 本番環境では使用しないでください

【推奨】Phase 2.5でサーバーレス関数への移行を予定しています。`;

        if (!confirm(securityWarning)) {
          return;
        }

        githubToken = prompt('GitHub Personal Access Token を入力してください:\n\n(ブラウザを閉じると削除されます)');
        if (!githubToken) {
          alert('トークンが必要です。');
          return;
        }
        sessionStorage.setItem('github_token', githubToken);
      }

      // Claude API Key（同様）
      let claudeApiKey = sessionStorage.getItem('claude_api_key');
      if (!claudeApiKey) {
        claudeApiKey = prompt('Claude API Key を入力してください:\n\n(ブラウザを閉じると削除されます)');
        if (!claudeApiKey) {
          alert('APIキーが必要です。');
          return;
        }
        sessionStorage.setItem('claude_api_key', claudeApiKey);
      }

      processBtn.disabled = true;
      progressDiv.style.display = 'block';
      progressBar.value = 20;

      try {
        // ステップ1: Claude APIで日記整形
        progressBar.value = 30;
        const diaryData = await summarizeDiary(rawText, claudeApiKey);
        
        progressBar.value = 60;
        
        // ステップ2: Markdownファイル生成
        const markdown = generateMarkdown(diaryData);
        
        progressBar.value = 80;
        
        // ステップ3: GitHub APIでpush
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const year = today.split('-')[0];
        const month = today.split('-')[1];
        const filePath = `diaries/${year}/${month}/${today}.md`;
        
        await pushToGitHub(githubToken, filePath, markdown, diaryData.title);
        
        progressBar.value = 100;
        
        // 成功メッセージ
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <div class="success">
            <h3>✅ 日記の保存が完了しました！</h3>
            <p><strong>タイトル:</strong> ${diaryData.title}</p>
            <p><strong>ハッシュタグ:</strong> ${diaryData.tags.join(' ')}</p>
            <p><a href="https://github.com/Tanbe3170/my-voice-diary/blob/main/${filePath}" target="_blank">
              📂 GitHubで確認
            </a></p>
            <button onclick="location.href='index.html'">📖 日記一覧に戻る</button>
          </div>
        `;
        
        diaryText.value = ''; // フォームクリア
        
      } catch (error) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <div class="error">
            <h3>❌ エラーが発生しました</h3>
            <p>${error.message}</p>
          </div>
        `;
      } finally {
        processBtn.disabled = false;
        progressDiv.style.display = 'none';
      }
    };

    // === Claude API 呼び出し関数 ===
    async function summarizeDiary(rawText, apiKey) {
      const today = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '年').replace(/年0?/, '年').replace(/月0?/, '月') + '日';

      const prompt = `あなたは日記執筆のアシスタントです。以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
${rawText}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

\`\`\`json
{
  "date": "${today}",
  "title": "その日の出来事を要約した魅力的なタイトル（15文字以内）",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "body": "詳細な日記本文（段落分けあり、文語体で整った文章）",
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
}
\`\`\`

【整形のルール】
1. 口語（「〜でした」「〜なんだけど」）→ 文語（「〜だった」「〜だが」）
2. タイトルは読者の興味を引く工夫をする
3. サマリーは3行で要点をまとめる
4. 本文は適度に段落分けし、読みやすくする
5. ハッシュタグはInstagram投稿を想定（#日記 #今日の出来事 など）
6. 画像プロンプトは情景が浮かぶような具体的な英語で記述

それでは、音声入力テキストを日記に整形してください。`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Claude API エラー: ${error.error.message}`);
      }

      const data = await response.json();
      const responseText = data.content[0].text;

      // JSON抽出（```json ... ``` または {...} を抽出）
      const jsonMatch = responseText.match(/```json\s*(\{.*?\})\s*```/s) || 
                        responseText.match(/(\{.*\})/s);
      
      if (!jsonMatch) {
        throw new Error('Claude APIのレスポンスからJSONを抽出できませんでした');
      }

      return JSON.parse(jsonMatch[1]);
    }

    // === Markdown生成関数 ===
    function generateMarkdown(diaryData) {
      const today = new Date().toISOString().split('T')[0];
      const tags = diaryData.tags.map(tag => tag.startsWith('#') ? tag : '#' + tag);
      
      return `---
title: "${diaryData.title}"
date: ${today}
tags: [${tags.join(', ')}]
image_prompt: "${diaryData.image_prompt}"
---

# ${diaryData.title}

## 📅 ${today}

### 📖 サマリー

${diaryData.summary}

---

${diaryData.body}

---

**Tags:** ${tags.join(' ')}
`;
    }

    // === GitHub API Push関数 ===
    async function pushToGitHub(token, filePath, content, commitMessage) {
      const owner = 'Tanbe3170';
      const repo = 'my-voice-diary';
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

      // 既存ファイルのSHA取得（上書き時に必要）
      let sha;
      try {
        const getResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (getResponse.ok) {
          const data = await getResponse.json();
          sha = data.sha;
        }
      } catch (e) {
        // ファイルが存在しない場合はsha不要
      }

      // Base64エンコード
      const contentBase64 = btoa(unescape(encodeURIComponent(content)));

      const body = {
        message: `diary: ${new Date().toISOString().split('T')[0]} - ${commitMessage}`,
        content: contentBase64,
        branch: 'main'
      };

      if (sha) {
        body.sha = sha; // 既存ファイル上書き
      }

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub API エラー: ${error.message}`);
      }

      return await response.json();
    }
  </script>
</body>
</html>
```

---

### タスク2.4: レスポンシブCSS作成（2時間）

#### ファイル: `docs/style.css`

**要件**:
- モバイルファースト
- ダークモード対応
- PWAっぽいデザイン

**実装例**:

```css
/* === リセット === */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* === カスタムプロパティ === */
:root {
  --primary-color: #4F46E5;
  --secondary-color: #10B981;
  --background: #FFFFFF;
  --surface: #F9FAFB;
  --text: #111827;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --error: #EF4444;
  --success: #10B981;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #111827;
    --surface: #1F2937;
    --text: #F9FAFB;
    --text-secondary: #9CA3AF;
    --border: #374151;
  }
}

/* === 基本スタイル === */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--background);
  color: var(--text);
  line-height: 1.6;
  padding: 0;
  margin: 0;
}

header {
  background-color: var(--primary-color);
  color: white;
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header h1 {
  font-size: 1.5rem;
}

main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

/* === ボタン === */
button, .button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

button.primary-button {
  background-color: var(--primary-color);
  color: white;
}

button.primary-button:hover {
  background-color: #4338CA;
}

button.voice-button {
  background-color: var(--secondary-color);
  color: white;
  font-size: 1.2rem;
}

button.voice-button.recording {
  background-color: var(--error);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* === フォーム === */
.input-area {
  background-color: var(--surface);
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin-top: 2rem;
}

textarea {
  width: 100%;
  padding: 1rem;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  background-color: var(--background);
  color: var(--text);
  resize: vertical;
}

textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text);
}

/* === 入力方法選択 === */
.input-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.method {
  background-color: var(--surface);
  padding: 1.5rem;
  border-radius: 12px;
  border: 2px solid var(--border);
}

.method h3 {
  margin-bottom: 0.5rem;
  color: var(--primary-color);
}

/* === 結果表示 === */
.success, .error {
  padding: 1.5rem;
  border-radius: 12px;
  margin-top: 1rem;
}

.success {
  background-color: #D1FAE5;
  color: #065F46;
  border: 2px solid var(--success);
}

.error {
  background-color: #FEE2E2;
  color: #991B1B;
  border: 2px solid var(--error);
}

/* === プログレスバー === */
progress {
  width: 100%;
  height: 8px;
  border-radius: 4px;
}

/* === レスポンシブ === */
@media (max-width: 640px) {
  header h1 {
    font-size: 1.2rem;
  }

  button {
    font-size: 0.9rem;
    padding: 0.6rem 1rem;
  }

  .input-area {
    padding: 1rem;
  }
}
```

---

### タスク2.5: PWA設定（1時間）

#### ファイル: `docs/manifest.json`

```json
{
  "name": "My Voice Diary",
  "short_name": "Voice Diary",
  "description": "音声入力で書く毎日の日記",
  "start_url": "/my-voice-diary/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#4F46E5",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### ファイル: `docs/service-worker.js`

```javascript
const CACHE_NAME = 'voice-diary-v1';
const urlsToCache = [
  '/my-voice-diary/',
  '/my-voice-diary/index.html',
  '/my-voice-diary/diary-input.html',
  '/my-voice-diary/style.css',
  '/my-voice-diary/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

---

### タスク2.9: codex-review実施（必須）

**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** docs/ 配下全ファイル

---

### Phase 2 完了基準

- [ ] GitHub Pagesが表示される
- [ ] diary-input.htmlで音声入力が動作する（Web Speech API）
- [ ] SuperWhisper貼り付けが動作する
- [ ] Claude APIで日記整形が動作する
- [ ] GitHub APIで日記が保存される
- [ ] スマホでPWAとして追加できる

---

## 🔐 Phase 2.5: セキュリティ強化（オプション・推奨）

### 目標
Phase 2で検出されたセキュリティ問題（localStorage問題）を根本解決するため、サーバーレス関数（Vercel）を導入し、APIキーをブラウザから完全に排除する。

### 所要時間
約4時間（初学者向け）

### 前提条件
- Phase 2完了
- Vercelアカウント（無料）
- Node.js 18以上

### 詳細ドキュメント
👉 **[PHASE_2.5_GUIDE.md](PHASE_2.5_GUIDE.md)** - 初学者向け完全ガイド

### 主要タスク

#### タスク2.5.1: Vercelアカウント準備（10分）
- Vercelアカウント作成
- GitHubリポジトリ接続

#### タスク2.5.2: 環境変数設定（5分）
- GITHUB_TOKEN, CLAUDE_API_KEY, GITHUB_OWNER, GITHUB_REPO

#### タスク2.5.3: サーバーレス関数実装（1.5時間）
- `api/create-diary.js` 作成

#### タスク2.5.4: フロントエンド更新（30分）
- `docs/diary-input.html` を更新（APIキー削除）

#### タスク2.5.5: デプロイとテスト（30分）
- Git push → Vercel自動デプロイ

#### タスク2.5.6: codex-review実施（必須）
**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** api/create-diary.js

---

### Phase 2.5 完了基準

- [ ] Vercelアカウント作成完了
- [ ] 環境変数設定完了
- [ ] `api/create-diary.js` 実装完了
- [ ] フロントエンドからAPIキー削除完了
- [ ] Vercelデプロイ成功
- [ ] 実際に日記作成が動作する（APIキー入力なし）
- [ ] codex-reviewで `ok: true` 確認

**セキュリティレベル**: ⭐⭐⭐⭐⭐（Phase 2の問題を完全解決）

---

## 🎤 Phase 3: Ubuntu音声認識（Nerd Dictation）【新規】

### 目標
Ubuntu環境でオフライン音声認識を実装し、ターミナルから日記を作成できるようにする。

---

### タスク3.1: Nerd Dictationインストール（30分）

#### ステップ1: pipxインストール

```bash
# pipxがない場合
sudo apt update
sudo apt install -y pipx
pipx ensurepath

# シェル再起動
source ~/.bashrc
```

---

#### ステップ2: Nerd Dictationインストール

```bash
pipx install nerd-dictation

# 確認
nerd-dictation --help
```

---

#### ステップ3: Voskモデルダウンロード

```bash
cd ~

# 日本語モデル（約50MB）
wget https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.zip
unzip vosk-model-small-ja-0.22.zip
rm vosk-model-small-ja-0.22.zip

# （オプション）英語モデル
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip
rm vosk-model-small-en-us-0.15.zip
```

---

### タスク3.2: 音声認識テスト（30分）

```bash
# 音声認識開始（日本語）
nerd-dictation begin --vosk-model-dir=~/vosk-model-small-ja-0.22 &

# 話す...（認識されたテキストがクリップボードに保存される）
# 例: 「今日は朝からプログラミングの学習をしていました。」

# 音声認識終了
nerd-dictation end

# クリップボード内容確認
xclip -o -selection clipboard
```

**期待される結果**:
```
今日は朝からプログラミングの学習をしていました
```

---

### タスク3.3: diary-push.sh統合（30分）

#### 新しいスクリプト: `scripts/diary-voice.sh`

```bash
#!/bin/bash
# diary-voice.sh
# 音声認識 → 日記整形 → GitHubプッシュの一括実行

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VOSK_MODEL="$HOME/vosk-model-small-ja-0.22"

echo -e "${BLUE}🎤 音声入力モードを開始します${NC}"
echo ""
echo "【使い方】"
echo "1. Enterキーを押して音声認識を開始"
echo "2. 日記の内容を話す"
echo "3. 話し終わったらもう一度Enterキーを押す"
echo ""
read -p "準備ができたらEnterキーを押してください..."

# 音声認識開始
echo -e "${BLUE}🎤 音声認識を開始しました。話してください...${NC}"
nerd-dictation begin --vosk-model-dir="$VOSK_MODEL" &
NERD_PID=$!

# 終了待ち
read -p "話し終わったらEnterキーを押してください..."

# 音声認識終了
nerd-dictation end
wait $NERD_PID 2>/dev/null || true

# クリップボードからテキスト取得
RAW_TEXT=$(xclip -o -selection clipboard 2>/dev/null || echo "")

if [ -z "$RAW_TEXT" ]; then
    echo -e "${RED}❌ 音声認識に失敗しました。もう一度試してください。${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ 音声認識完了！${NC}"
echo ""
echo "【認識されたテキスト】"
echo "----------------------------------------"
echo "$RAW_TEXT"
echo "----------------------------------------"
echo ""

read -p "このテキストで日記を作成しますか？ (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ キャンセルしました${NC}"
    exit 0
fi

# diary-push.sh を実行
echo ""
bash "$SCRIPT_DIR/diary-push.sh" "$RAW_TEXT"
```

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/diary-voice.sh
```

---

### タスク3.4: エイリアス作成（10分）

`~/.bashrc` に追加:

```bash
# voice-diary ショートカット
alias diary-voice='bash ~/diary/scripts/diary-voice.sh'
alias diary='bash ~/diary/scripts/diary-push.sh'
```

**反映**:
```bash
source ~/.bashrc
```

**使い方**:
```bash
# 音声入力モード
diary-voice

# 手動テキスト入力モード
diary "今日は..."
```

---

### タスク3.5: codex-review実施（必須）

**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** scripts/diary-voice.sh

---

### Phase 3 完了基準

- [ ] Nerd Dictationがインストールされた
- [ ] Voskモデルがダウンロードされた
- [ ] 音声認識が動作する
- [ ] `diary-voice.sh` が動作する
- [ ] エイリアスが設定された
- [ ] 実際に音声入力で日記が作成された

---

## 🖼️ Phase 4: AI画像生成（DALL-E 3）

### 目標
日記の内容から自動で画像を生成し、Markdownに埋め込む。

---

### タスク4.1: OpenAI API設定（30分）

#### ステップ1: APIキー取得

1. https://platform.openai.com/signup にアクセス
2. アカウント作成
3. **API Keys** → **Create new secret key**
4. キーをコピー

---

#### ステップ2: 環境変数設定

`~/.bashrc` に追加:

```bash
# OpenAI API
export OPENAI_API_KEY="sk-proj-..."
```

**反映**:
```bash
source ~/.bashrc

# 確認
echo $OPENAI_API_KEY
```

---

### タスク4.2: image-gen.py 作成（2時間）

#### ファイル: `scripts/image-gen.py`

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
image-gen.py
日記の画像プロンプトからDALL-E 3で画像を生成するスクリプト

使い方:
    python3 image-gen.py "diaries/2026/02/2026-02-09.md"
"""

import os
import sys
import re
import requests
from datetime import datetime
from pathlib import Path

def check_api_key():
    """OPENAI_API_KEY環境変数チェック"""
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("❌ エラー: OPENAI_API_KEYが設定されていません", file=sys.stderr)
        sys.exit(1)
    return api_key

def extract_image_prompt(markdown_path):
    """MarkdownファイルからYAML Front Matterの画像プロンプトを抽出"""
    try:
        with open(markdown_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # YAML Front Matter抽出
        yaml_match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL | re.MULTILINE)
        if not yaml_match:
            raise ValueError("YAML Front Matterが見つかりません")
        
        yaml_content = yaml_match.group(1)
        
        # image_prompt抽出
        prompt_match = re.search(r'image_prompt:\s*["\']?(.*?)["\']?\s*$', yaml_content, re.MULTILINE)
        if not prompt_match:
            raise ValueError("image_promptが見つかりません")
        
        return prompt_match.group(1).strip()
    
    except Exception as e:
        print(f"❌ ファイル読み込みエラー: {e}", file=sys.stderr)
        sys.exit(1)

def generate_image(prompt, api_key):
    """DALL-E 3 APIで画像生成"""
    print(f"🎨 DALL-E 3で画像生成中...", file=sys.stderr)
    print(f"   プロンプト: {prompt[:60]}...", file=sys.stderr)
    
    try:
        response = requests.post(
            'https://api.openai.com/v1/images/generations',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'dall-e-3',
                'prompt': prompt,
                'n': 1,
                'size': '1024x1024',  # または '1792x1024', '1024x1792'
                'quality': 'standard',  # または 'hd' （高画質、コスト2倍）
                'style': 'vivid'  # または 'natural'
            },
            timeout=60
        )
        
        response.raise_for_status()
        data = response.json()
        
        image_url = data['data'][0]['url']
        return image_url
    
    except requests.exceptions.RequestException as e:
        print(f"❌ DALL-E API エラー: {e}", file=sys.stderr)
        sys.exit(1)

def download_image(image_url, save_path):
    """画像をダウンロードして保存"""
    print(f"📥 画像をダウンロード中...", file=sys.stderr)
    
    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        # 保存先ディレクトリ作成
        save_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(save_path, 'wb') as f:
            f.write(response.content)
        
        print(f"✅ 画像を保存しました: {save_path}", file=sys.stderr)
        return save_path
    
    except requests.exceptions.RequestException as e:
        print(f"❌ 画像ダウンロードエラー: {e}", file=sys.stderr)
        sys.exit(1)

def update_markdown_with_image(markdown_path, image_path):
    """Markdownファイルに画像パスを追加"""
    try:
        with open(markdown_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 画像パスを相対パスに変換
        markdown_dir = Path(markdown_path).parent
        relative_image_path = os.path.relpath(image_path, markdown_dir)
        
        # "---" の後に画像を追加
        # パターン: "---\n\n# タイトル" → "---\n\n![](画像パス)\n\n# タイトル"
        updated_content = re.sub(
            r'(---\n\n)(# )',
            rf'\1![Generated Image](/{relative_image_path})\n\n\2',
            content,
            count=1
        )
        
        with open(markdown_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        
        print(f"✅ Markdownファイルを更新しました", file=sys.stderr)
    
    except Exception as e:
        print(f"❌ Markdown更新エラー: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("使い方: python3 image-gen.py <markdownファイルパス>", file=sys.stderr)
        sys.exit(1)
    
    markdown_path = Path(sys.argv[1])
    
    if not markdown_path.exists():
        print(f"❌ ファイルが見つかりません: {markdown_path}", file=sys.stderr)
        sys.exit(1)
    
    # APIキーチェック
    api_key = check_api_key()
    
    # 画像プロンプト抽出
    image_prompt = extract_image_prompt(markdown_path)
    
    # 画像生成
    image_url = generate_image(image_prompt, api_key)
    
    # 画像保存パス決定
    date_str = markdown_path.stem  # YYYY-MM-DD
    project_root = markdown_path.parent.parent.parent.parent  # ~/diary
    image_save_path = project_root / 'images' / f'{date_str}.png'
    
    # 画像ダウンロード
    download_image(image_url, image_save_path)
    
    # Markdown更新
    update_markdown_with_image(markdown_path, image_save_path)
    
    print(f"\n✅ すべての処理が完了しました！", file=sys.stderr)
    print(f"   画像: {image_save_path}", file=sys.stderr)

if __name__ == "__main__":
    main()
```

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/image-gen.py
```

---

### タスク4.3: diary-push.sh に統合（1時間）

`diary-push.sh` の最後に追加:

```bash
# === 画像生成（オプション） ===
read -p "画像を生成しますか？ (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🎨 画像を生成中...${NC}"
    
    if [ -n "$OPENAI_API_KEY" ]; then
        "$VENV_PYTHON" "$SCRIPT_DIR/image-gen.py" "$DIARY_FILE"
        
        # Git add & commit & push
        cd "$PROJECT_DIR"
        git add "$DIARY_FILE" images/
        git commit --amend --no-edit
        git push -f origin main
        
        echo -e "${GREEN}✅ 画像生成＋GitHubプッシュ完了！${NC}"
    else
        echo -e "${RED}❌ OPENAI_API_KEYが設定されていません${NC}"
        echo "画像生成をスキップします。"
    fi
fi
```

---

### タスク4.4: codex-review実施（必須）

**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** scripts/image-gen.py

---

### Phase 4 完了基準

- [ ] OpenAI APIキーが設定された
- [ ] `image-gen.py` が動作する
- [ ] DALL-E 3で画像が生成される
- [ ] 画像が `images/` に保存される
- [ ] Markdownに画像が埋め込まれる
- [ ] GitHub Pagesで画像が表示される

**コスト**: 約$0.04/枚（standard品質）、約$0.08/枚（hd品質）

---

## 📱 Phase 5: Instagram完全自動投稿【新規】

### 目標
Instagram Graph APIを使い、日記と画像を完全自動投稿する。

---

### タスク5.1: Meta開発者アカウント＋Instagramビジネスアカウント設定（1時間）

#### ステップ1: Meta開発者アカウント作成

1. https://developers.facebook.com/ にアクセス
2. Facebookアカウントでログイン
3. **マイアプリ** → **アプリを作成**
4. アプリタイプ: **ビジネス**
5. アプリ名: `Voice Diary Bot`（任意）
6. **アプリを作成**

---

#### ステップ2: Instagramビジネスアカウントに変換

1. Instagramアプリを開く
2. プロフィール → **設定** → **アカウント**
3. **プロアカウントに切り替える**
4. カテゴリ選択: **ブログ** または **クリエイター**
5. **ビジネス** を選択
6. 連絡先情報を入力

---

#### ステップ3: Facebookページ作成

1. https://www.facebook.com/pages/create にアクセス
2. ページ名: `My Voice Diary`（任意）
3. カテゴリ: **個人ブログ**
4. **ページを作成**

---

#### ステップ4: InstagramとFacebookページをリンク

1. Facebookページの**設定** → **Instagram**
2. **アカウントをリンク**
3. Instagramにログイン

---

#### ステップ5: アクセストークン取得

1. Meta開発者アプリに戻る
2. **ツール** → **Graph APIエクスプローラー**
3. **ユーザーアクセストークン** → **取得**
4. 権限選択:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
5. **アクセストークンを生成**
6. トークンをコピー

---

#### ステップ6: 長期トークンに変換

```bash
# 短期トークン（1時間有効）を長期トークン（60日有効）に変換
curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
```

**結果**:
```json
{
  "access_token": "長期トークン...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

---

#### ステップ7: Instagram Business Account ID取得

```bash
# Facebookページに紐付いたInstagramアカウントIDを取得
curl -X GET "https://graph.facebook.com/v21.0/me/accounts?access_token=長期トークン"
```

**結果**:
```json
{
  "data": [
    {
      "id": "FACEBOOK_PAGE_ID",
      "name": "My Voice Diary"
    }
  ]
}
```

次に:
```bash
curl -X GET "https://graph.facebook.com/v21.0/FACEBOOK_PAGE_ID?fields=instagram_business_account&access_token=長期トークン"
```

**結果**:
```json
{
  "instagram_business_account": {
    "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }
}
```

---

#### ステップ8: 環境変数設定

`~/.bashrc` に追加:

```bash
# Instagram Graph API
export INSTAGRAM_ACCESS_TOKEN="長期トークン..."
export INSTAGRAM_BUSINESS_ACCOUNT_ID="123456789..."
```

**反映**:
```bash
source ~/.bashrc
```

---

### タスク5.2: instagram-post.py 作成（3時間）

#### ファイル: `scripts/instagram-post.py`

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
instagram-post.py
日記と画像をInstagram Graph APIで自動投稿するスクリプト

使い方:
    python3 instagram-post.py "diaries/2026/02/2026-02-09.md"
"""

import os
import sys
import re
import time
import requests
from pathlib import Path

def check_env_vars():
    """環境変数チェック"""
    access_token = os.environ.get('INSTAGRAM_ACCESS_TOKEN')
    account_id = os.environ.get('INSTAGRAM_BUSINESS_ACCOUNT_ID')
    
    if not access_token or not account_id:
        print("❌ エラー: Instagram API環境変数が設定されていません", file=sys.stderr)
        print("", file=sys.stderr)
        print("以下を ~/.bashrc に追加してください:", file=sys.stderr)
        print('  export INSTAGRAM_ACCESS_TOKEN="..."', file=sys.stderr)
        print('  export INSTAGRAM_BUSINESS_ACCOUNT_ID="..."', file=sys.stderr)
        sys.exit(1)
    
    return access_token, account_id

def extract_diary_data(markdown_path):
    """Markdownファイルからデータ抽出"""
    try:
        with open(markdown_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # YAML Front Matter抽出
        yaml_match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL | re.MULTILINE)
        if not yaml_match:
            raise ValueError("YAML Front Matterが見つかりません")
        
        yaml_content = yaml_match.group(1)
        
        # 各フィールド抽出
        title = re.search(r'title:\s*["\']?(.*?)["\']?\s*$', yaml_content, re.MULTILINE).group(1).strip()
        date = re.search(r'date:\s*(\S+)', yaml_content).group(1).strip()
        
        # タグ抽出（配列形式）
        tags_match = re.search(r'tags:\s*\[(.*?)\]', yaml_content, re.DOTALL)
        tags = []
        if tags_match:
            tags_str = tags_match.group(1)
            tags = [tag.strip().strip('"').strip("'").strip(',') for tag in tags_str.split(',')]
        
        # 本文抽出（YAML Front Matterの後、最初の "---" まで）
        body_match = re.search(r'---\n\n.*?\n\n###\s*📖\s*サマリー\n\n(.*?)\n\n---', content, re.DOTALL)
        if body_match:
            summary = body_match.group(1).strip()
        else:
            summary = ""
        
        return {
            'title': title,
            'date': date,
            'tags': tags,
            'summary': summary
        }
    
    except Exception as e:
        print(f"❌ ファイル読み込みエラー: {e}", file=sys.stderr)
        sys.exit(1)

def find_image_path(markdown_path):
    """日記に対応する画像パスを探す"""
    date_str = markdown_path.stem  # YYYY-MM-DD
    project_root = markdown_path.parent.parent.parent.parent  # ~/diary
    image_path = project_root / 'images' / f'{date_str}.png'
    
    if not image_path.exists():
        print(f"⚠️  警告: 画像が見つかりません: {image_path}", file=sys.stderr)
        return None
    
    return image_path

def create_caption(diary_data):
    """Instagram投稿用キャプション作成"""
    caption_parts = [
        f"📖 {diary_data['title']}",
        "",
        diary_data['summary'],
        "",
        f"📅 {diary_data['date']}",
        "",
        # ハッシュタグ（#が付いていない場合は追加）
        ' '.join([tag if tag.startswith('#') else f'#{tag}' for tag in diary_data['tags']]),
        "",
        "#日記 #voicediary #diary"
    ]
    
    caption = '\n'.join(caption_parts)
    
    # Instagram制限: 2200文字まで
    if len(caption) > 2200:
        caption = caption[:2197] + "..."
    
    return caption

def upload_image_to_hosting(image_path):
    """
    画像を公開URLにアップロード
    
    Instagram Graph APIは画像URLを要求するため、
    GitHubの画像URLを使用する。
    
    注意: GitHubのraw.githubusercontent.comは公開URLなので、
          プライベートリポジトリの場合は別のホスティングサービスを使用する必要がある。
    """
    # GitHubの公開URL（my-voice-diaryがPublicリポジトリの場合）
    date_str = image_path.stem
    github_image_url = f"https://raw.githubusercontent.com/Tanbe3170/my-voice-diary/main/images/{date_str}.png"
    
    # URLが有効か確認
    try:
        response = requests.head(github_image_url, timeout=10)
        if response.status_code == 200:
            return github_image_url
        else:
            print(f"❌ 画像URLが無効です: {github_image_url}", file=sys.stderr)
            print(f"   HTTPステータス: {response.status_code}", file=sys.stderr)
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ 画像URL確認エラー: {e}", file=sys.stderr)
        return None

def create_media_container(account_id, image_url, caption, access_token):
    """Instagram Graph API: メディアコンテナ作成"""
    print("📸 メディアコンテナを作成中...", file=sys.stderr)
    
    url = f"https://graph.facebook.com/v21.0/{account_id}/media"
    
    params = {
        'image_url': image_url,
        'caption': caption,
        'access_token': access_token
    }
    
    try:
        response = requests.post(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        container_id = data['id']
        print(f"✅ コンテナID: {container_id}", file=sys.stderr)
        return container_id
    
    except requests.exceptions.RequestException as e:
        print(f"❌ メディアコンテナ作成エラー: {e}", file=sys.stderr)
        if hasattr(e, 'response') and e.response is not None:
            print(f"   レスポンス: {e.response.text}", file=sys.stderr)
        sys.exit(1)

def publish_media(account_id, container_id, access_token):
    """Instagram Graph API: メディア公開"""
    print("📤 メディアを公開中...", file=sys.stderr)
    
    url = f"https://graph.facebook.com/v21.0/{account_id}/media_publish"
    
    params = {
        'creation_id': container_id,
        'access_token': access_token
    }
    
    try:
        # コンテナの処理完了を待つ（最大60秒）
        for i in range(12):
            # ステータス確認
            status_url = f"https://graph.facebook.com/v21.0/{container_id}"
            status_params = {
                'fields': 'status_code',
                'access_token': access_token
            }
            status_response = requests.get(status_url, params=status_params, timeout=10)
            status_data = status_response.json()
            
            if status_data.get('status_code') == 'FINISHED':
                break
            
            print(f"   コンテナ処理中... ({i+1}/12)", file=sys.stderr)
            time.sleep(5)
        
        # 公開
        response = requests.post(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        post_id = data['id']
        print(f"✅ 投稿ID: {post_id}", file=sys.stderr)
        return post_id
    
    except requests.exceptions.RequestException as e:
        print(f"❌ メディア公開エラー: {e}", file=sys.stderr)
        if hasattr(e, 'response') and e.response is not None:
            print(f"   レスポンス: {e.response.text}", file=sys.stderr)
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("使い方: python3 instagram-post.py <markdownファイルパス>", file=sys.stderr)
        sys.exit(1)
    
    markdown_path = Path(sys.argv[1])
    
    if not markdown_path.exists():
        print(f"❌ ファイルが見つかりません: {markdown_path}", file=sys.stderr)
        sys.exit(1)
    
    # 環境変数チェック
    access_token, account_id = check_env_vars()
    
    # 日記データ抽出
    diary_data = extract_diary_data(markdown_path)
    
    # 画像パス取得
    image_path = find_image_path(markdown_path)
    if not image_path:
        print("❌ 画像が見つからないため、投稿できません。", file=sys.stderr)
        sys.exit(1)
    
    # 画像URL取得
    image_url = upload_image_to_hosting(image_path)
    if not image_url:
        print("❌ 画像URLを取得できませんでした。", file=sys.stderr)
        sys.exit(1)
    
    # キャプション作成
    caption = create_caption(diary_data)
    
    print("\n【投稿内容プレビュー】", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(caption, file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"画像: {image_url}", file=sys.stderr)
    print("", file=sys.stderr)
    
    # 確認
    response = input("この内容でInstagramに投稿しますか？ (y/n): ")
    if response.lower() != 'y':
        print("❌ キャンセルしました", file=sys.stderr)
        sys.exit(0)
    
    # メディアコンテナ作成
    container_id = create_media_container(account_id, image_url, caption, access_token)
    
    # メディア公開
    post_id = publish_media(account_id, container_id, access_token)
    
    print("\n✅ Instagramへの投稿が完了しました！", file=sys.stderr)
    print(f"   投稿ID: {post_id}", file=sys.stderr)
    print(f"   Instagram: https://www.instagram.com/", file=sys.stderr)

if __name__ == "__main__":
    main()
```

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/instagram-post.py
```

---

### タスク5.3: diary-push.sh に統合（1時間）

`diary-push.sh` の最後に追加:

```bash
# === Instagram投稿（オプション） ===
if [ -f "$PROJECT_DIR/images/$(basename "$DIARY_FILE" .md).png" ]; then
    read -p "Instagramに投稿しますか？ (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}📱 Instagramに投稿中...${NC}"
        
        if [ -n "$INSTAGRAM_ACCESS_TOKEN" ] && [ -n "$INSTAGRAM_BUSINESS_ACCOUNT_ID" ]; then
            "$VENV_PYTHON" "$SCRIPT_DIR/instagram-post.py" "$DIARY_FILE"
        else
            echo -e "${RED}❌ Instagram API環境変数が設定されていません${NC}"
            echo "Instagram投稿をスキップします。"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  画像がないため、Instagram投稿はスキップされます${NC}"
fi
```

---

### タスク5.4: codex-review実施（必須）

**実施手順:** CODEX_REVIEW_GUIDE.md を参照
**レビュー対象:** scripts/instagram-post.py

---

### Phase 5 完了基準

- [ ] Meta開発者アカウントが作成された
- [ ] Instagramビジネスアカウントに変換された
- [ ] Facebookページが作成された
- [ ] アクセストークンが取得された
- [ ] 環境変数が設定された
- [ ] `instagram-post.py` が動作する
- [ ] 実際にInstagramに投稿された

---

## 🎓 プロジェクト完成後のアクション

### 1. スキル化（`my-skill-creator`使用）

**目的**: voice-diaryを他のプロジェクトで再利用可能にする

**手順**:
1. `my-skill-creator` スキルを起動
2. Step 1-6 に従ってスキルを作成
3. `.skill` ファイルをパッケージング

---

### 2. ドキュメント整備

**追加すべきドキュメント**:
- `FAQ.md` - よくある質問
- `CHANGELOG.md` - 変更履歴
- `CONTRIBUTING.md` - 開発者向けガイド

---

### 3. 運用改善

**継続的改善項目**:
- プロンプトの最適化（Claude APIのコスト削減）
- 音声認識精度の向上
- 画像生成プロンプトの改善
- Instagram投稿の自動化（cron設定）

---

## 📊 最終的なシステム構成

```
voice-diary/
├── README.md                    ✅ プロジェクト説明
├── SETUP.md                     ✅ セットアップ手順
├── PROJECT_OVERVIEW.md          ✅ プロジェクト概要
├── IMPLEMENTATION_PLAN_v2.md    ✅ 本ファイル
├── TECHNICAL_SPEC.md            ✅ 技術仕様
├── .gitignore                   ✅ Git除外設定
│
├── scripts/                     ✅ 自動化スクリプト
│   ├── diary-summarize.py       ✅ Claude APIで日記整形
│   ├── diary-push.sh            ✅ GitHubに自動push
│   ├── diary-voice.sh           🆕 音声入力モード（Ubuntu）
│   ├── image-gen.py             🆕 DALL-E 3画像生成
│   └── instagram-post.py        🆕 Instagram自動投稿
│
├── diaries/                     ✅ 日記ファイル (Markdown)
│   └── YYYY/MM/YYYY-MM-DD.md
│
├── images/                      🆕 AI生成画像
│   └── YYYY-MM-DD.png
│
└── docs/                        🆕 GitHub Pages（PWA対応）
    ├── index.html               🆕 日記一覧＋カレンダー
    ├── diary-input.html         🆕 音声入力Webフォーム
    ├── diary-detail.html        🆕 日記詳細表示
    ├── style.css                🆕 レスポンシブCSS
    ├── app.js                   🆕 メインロジック
    ├── manifest.json            🆕 PWA設定
    └── service-worker.js        🆕 オフライン対応
```

---

## 📝 次のステップ

### 今すぐできること

1. **Phase 1 完了**: 残り2日分の日記を作成
2. **Phase 2 開始**: GitHub Pages有効化 → Webフォーム実装

### 質問リスト（次のチャットで）

- [ ] どのPhaseから始めるか？
- [ ] SuperWhisperは購入済みか？
- [ ] OpenAI APIキーは取得済みか？
- [ ] Instagramビジネスアカウントは作成済みか？


**作成日**: 2025年2月11日  
**バージョン**: 2.0  
**対象**: 音声入力＋Instagram自動投稿完全版
