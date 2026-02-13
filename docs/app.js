// === app.js - My Voice Diary メインロジック ===
// index.html の #calendar-view と #diary-list を動的に生成する

// === 設定 ===
const CONFIG = {
  owner: 'Tanbe3170',
  repo: 'my-voice-diary',
  diariesPath: 'diaries',
  branch: 'main',
  // GitHub Contents API のベースURL
  get apiBase() {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents`;
  },
  // GitHub Pagesの日記ファイルへの直リンク
  get rawBase() {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}`;
  }
};

// === 動的スタイルの注入 ===
// カレンダーと日記カードのスタイルを動的に追加
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* --- カレンダー --- */
    .calendar-container {
      background: var(--surface);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      border: 1px solid var(--border);
    }

    .calendar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .calendar-header h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text);
      letter-spacing: 0.02em;
    }

    .calendar-nav {
      background: none;
      border: 1px solid var(--border) !important;
      color: var(--text);
      padding: 0.4rem 0.8rem !important;
      font-size: 0.85rem !important;
      border-radius: 6px !important;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }

    .calendar-nav:hover {
      background: var(--primary-color);
      color: white;
      border-color: var(--primary-color) !important;
    }

    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }

    .calendar-weekday {
      text-align: center;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-secondary);
      padding: 0.4rem 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .calendar-day {
      text-align: center;
      padding: 0.5rem 0.2rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
      border-radius: 8px;
      position: relative;
      transition: background 0.2s;
    }

    .calendar-day.has-entry {
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
    }

    .calendar-day.has-entry::after {
      content: '';
      display: block;
      width: 5px;
      height: 5px;
      background: var(--primary-color);
      border-radius: 50%;
      margin: 2px auto 0;
    }

    .calendar-day.has-entry:hover {
      background: var(--primary-color);
      color: white;
    }

    .calendar-day.has-entry:hover::after {
      background: white;
    }

    .calendar-day.today {
      background: var(--border);
      font-weight: 700;
      color: var(--text);
    }

    .calendar-day.empty {
      visibility: hidden;
    }

    /* --- 日記一覧 --- */
    .diary-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2rem;
    }

    .diary-list-header h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text);
    }

    .diary-count {
      font-size: 0.8rem;
      color: var(--text-secondary);
      background: var(--surface);
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      border: 1px solid var(--border);
    }

    .diary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 0.75rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.25s, border-color 0.2s;
      opacity: 0;
      transform: translateY(12px);
      animation: cardReveal 0.4s ease forwards;
    }

    .diary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(79, 70, 229, 0.1);
      border-color: var(--primary-color);
    }

    @keyframes cardReveal {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .diary-card-date {
      font-size: 0.75rem;
      color: var(--text-secondary);
      font-weight: 600;
      letter-spacing: 0.04em;
      margin-bottom: 0.3rem;
    }

    .diary-card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .diary-card-summary {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 0.75rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .diary-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .diary-tag {
      font-size: 0.7rem;
      color: var(--primary-color);
      background: rgba(79, 70, 229, 0.08);
      padding: 0.15rem 0.55rem;
      border-radius: 20px;
      font-weight: 500;
    }

    /* --- 読み込み中 --- */
    .loading {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--text-secondary);
    }

    .loading-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid var(--border);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* --- エラー・空状態 --- */
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--text-secondary);
    }

    .empty-state-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
    }

    .empty-state-text {
      font-size: 0.9rem;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}

// === YAML Front Matter パーサー ===
// Markdownファイルの先頭にあるYAML部分を解析する
function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const data = {};

  // タイトル抽出
  const titleMatch = yaml.match(/title:\s*"(.+?)"/);
  if (titleMatch) data.title = titleMatch[1];

  // 日付抽出
  const dateMatch = yaml.match(/date:\s*(\S+)/);
  if (dateMatch) data.date = dateMatch[1];

  // タグ抽出（配列形式）
  const tagsMatch = yaml.match(/tags:\s*\[(.+?)\]/);
  if (tagsMatch) {
    data.tags = tagsMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''));
  }

  // サマリー抽出（本文から）
  const summaryMatch = markdown.match(/### 📖 サマリー\n\n([\s\S]*?)\n\n---/);
  if (summaryMatch) data.summary = summaryMatch[1].trim();

  return data;
}

// === GitHub APIから日記ファイル一覧を取得 ===
// diaries/ ディレクトリを再帰的に探索し、.mdファイルのパスを収集する
async function fetchDiaryList() {
  const diaries = [];

  try {
    // 年ディレクトリ一覧を取得（例: diaries/2026/）
    const yearsRes = await fetch(`${CONFIG.apiBase}/${CONFIG.diariesPath}`);
    if (!yearsRes.ok) throw new Error('日記ディレクトリの取得に失敗しました');
    const years = await yearsRes.json();

    // 各年ディレクトリを探索
    for (const yearDir of years.filter(f => f.type === 'dir')) {
      // 月ディレクトリ一覧を取得（例: diaries/2026/02/）
      const monthsRes = await fetch(yearDir.url);
      if (!monthsRes.ok) continue;
      const months = await monthsRes.json();

      for (const monthDir of months.filter(f => f.type === 'dir')) {
        // 日記ファイル一覧を取得（例: diaries/2026/02/2026-02-09.md）
        const filesRes = await fetch(monthDir.url);
        if (!filesRes.ok) continue;
        const files = await filesRes.json();

        // .mdファイルのみ収集
        for (const file of files.filter(f => f.name.endsWith('.md'))) {
          diaries.push({
            name: file.name,
            path: file.path,
            downloadUrl: file.download_url,
            // ファイル名から日付を抽出（YYYY-MM-DD.md → YYYY-MM-DD）
            date: file.name.replace('.md', '')
          });
        }
      }
    }
  } catch (error) {
    console.error('日記一覧の取得エラー:', error);
    throw error;
  }

  // 新しい日記を先頭に（日付の降順）
  return diaries.sort((a, b) => b.date.localeCompare(a.date));
}

// === 日記の詳細データを取得 ===
// download_url から Markdown を取得し、Front Matter を解析する
async function fetchDiaryDetail(diary) {
  try {
    const res = await fetch(diary.downloadUrl);
    if (!res.ok) throw new Error(`日記の取得に失敗: ${diary.name}`);
    const markdown = await res.text();
    const frontMatter = parseFrontMatter(markdown);

    return {
      ...diary,
      ...(frontMatter || {}),
      // Front Matterが無い場合のフォールバック
      title: frontMatter?.title || diary.name.replace('.md', ''),
      tags: frontMatter?.tags || [],
      summary: frontMatter?.summary || ''
    };
  } catch (error) {
    console.error(`日記詳細の取得エラー (${diary.name}):`, error);
    return {
      ...diary,
      title: diary.name.replace('.md', ''),
      tags: [],
      summary: ''
    };
  }
}

// === 日記一覧の描画 ===
// #diary-list セクションに日記カードを生成する
function renderDiaryList(diaries) {
  const container = document.getElementById('diary-list');
  if (!container) return;

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'diary-list-header';
  header.innerHTML = `
    <h2>📝 日記一覧</h2>
    <span class="diary-count">${diaries.length} 件</span>
  `;

  container.innerHTML = '';
  container.appendChild(header);

  // 日記が無い場合の空状態
  if (diaries.length === 0) {
    container.innerHTML += `
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <p class="empty-state-text">
          まだ日記がありません。<br>
          「✏️ 新しい日記を作成」ボタンから始めましょう！
        </p>
      </div>
    `;
    return;
  }

  // 各日記をカードとして描画（スタッガードアニメーション）
  diaries.forEach((diary, index) => {
    const card = document.createElement('div');
    card.className = 'diary-card';
    // スタッガード: カードごとに遅延を追加
    card.style.animationDelay = `${index * 0.07}s`;

    // 日付の表示形式を整形（2026-02-11 → 2026年2月11日）
    const dateDisplay = formatDateJP(diary.date);

    // タグHTML生成
    const tagsHTML = diary.tags
      .map(tag => `<span class="diary-tag">${tag}</span>`)
      .join('');

    card.innerHTML = `
      <div class="diary-card-date">📅 ${dateDisplay}</div>
      <div class="diary-card-title">${diary.title}</div>
      ${diary.summary ? `<div class="diary-card-summary">${diary.summary}</div>` : ''}
      ${tagsHTML ? `<div class="diary-card-tags">${tagsHTML}</div>` : ''}
    `;

    // カードクリックでGitHubの日記ファイルを開く
    card.addEventListener('click', () => {
      const url = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/blob/${CONFIG.branch}/${diary.path}`;
      window.open(url, '_blank');
    });

    container.appendChild(card);
  });
}

// === カレンダーの描画 ===
// #calendar-view セクションに月次カレンダーを生成する
function renderCalendar(year, month, diaryDates) {
  const container = document.getElementById('calendar-view');
  if (!container) return;

  // 日記がある日付のセット（高速検索用）
  const entryDates = new Set(diaryDates);

  // 月の情報を計算
  const firstDay = new Date(year, month - 1, 1).getDay(); // 曜日（0=日曜）
  const daysInMonth = new Date(year, month, 0).getDate();  // 月の日数
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // 月名の日本語表示
  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];

  container.innerHTML = `
    <div class="calendar-container">
      <div class="calendar-header">
        <button class="calendar-nav" id="cal-prev">◀</button>
        <h2>${year}年 ${monthNames[month - 1]}</h2>
        <button class="calendar-nav" id="cal-next">▶</button>
      </div>
      <div class="calendar-grid" id="cal-grid"></div>
    </div>
  `;

  const grid = document.getElementById('cal-grid');

  // 曜日ヘッダー
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const el = document.createElement('div');
    el.className = 'calendar-weekday';
    el.textContent = day;
    grid.appendChild(el);
  });

  // 月初の空白セル
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-day empty';
    grid.appendChild(el);
  }

  // 各日セル
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const el = document.createElement('div');
    el.className = 'calendar-day';
    el.textContent = day;

    // 日記がある日にマーク
    if (entryDates.has(dateStr)) {
      el.classList.add('has-entry');
      el.title = `${dateStr} の日記を見る`;
    }

    // 今日をハイライト
    if (dateStr === todayStr) {
      el.classList.add('today');
    }

    grid.appendChild(el);
  }

  // 前月・翌月のナビゲーション
  document.getElementById('cal-prev').addEventListener('click', () => {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    renderCalendar(prev.y, prev.m, diaryDates);
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    renderCalendar(next.y, next.m, diaryDates);
  });
}

// === 日付フォーマット（日本語表示） ===
// "2026-02-11" → "2026年2月11日"
function formatDateJP(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${year}年${month}月${day}日`;
}

// === 読み込み中表示 ===
function showLoading(container) {
  container.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>日記を読み込み中...</p>
    </div>
  `;
}

// === エラー表示 ===
function showError(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <p class="empty-state-text">${message}</p>
    </div>
  `;
}

// === アプリケーション初期化 ===
async function init() {
  // 動的スタイルを注入
  injectStyles();

  const calendarView = document.getElementById('calendar-view');
  const diaryList = document.getElementById('diary-list');

  // 読み込み中表示
  if (diaryList) showLoading(diaryList);

  try {
    // GitHub APIから日記ファイル一覧を取得
    const diaryFiles = await fetchDiaryList();

    // 各日記の詳細データを並列で取得
    const diaries = await Promise.all(
      diaryFiles.map(file => fetchDiaryDetail(file))
    );

    // 日記一覧を描画
    renderDiaryList(diaries);

    // カレンダーを描画（現在の年月で表示）
    const now = new Date();
    const diaryDates = diaries.map(d => d.date);
    renderCalendar(now.getFullYear(), now.getMonth() + 1, diaryDates);

  } catch (error) {
    console.error('初期化エラー:', error);
    // エラー時のフォールバック表示
    if (diaryList) {
      showError(diaryList, '日記の読み込みに失敗しました。<br>ページを再読み込みしてください。');
    }
    // カレンダーはエラー時でも空で表示
    if (calendarView) {
      const now = new Date();
      renderCalendar(now.getFullYear(), now.getMonth() + 1, []);
    }
  }
}

// === DOM読み込み完了時に初期化 ===
document.addEventListener('DOMContentLoaded', init);

// === Service Worker登録 ===
// PWA対応：オフライン機能とキャッシュ管理
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/my-voice-diary/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker登録成功:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Service Worker登録失敗:', error);
      });
  });
}
