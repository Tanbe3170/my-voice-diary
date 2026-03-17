// tests/create-diary-dino.test.js
// create-diary API の恐竜日記モード拡張テスト
//
// テストシナリオ:
// 1. mode="dino-story"正常系
// 2. mode="dino-research"正常系
// 3. mode未指定で後方互換
// 4. 不正なmode → 400
// 5. dinoContext型不正 → 400
// 6. species > 50文字 → 400
// 7. topic > 200文字 → 400
// 8. sources > 5件 → 400
// 9. dino-storyでdinoContextなしでも動作
// 10. mode=normalでdinoContext無視
// 11. Markdown生成にmode/dino_context含む
// 12. LLM出力スキーマ検証がmode付きでも動作
// 13. dino-storyプロンプトに恐竜世界観含む
// 14. dino-researchプロンプトに研究ノート形式含む
// 15. mode未指定時に既存プロンプト使用
// 16. ファイルパスにモードサフィックス
// 17. normalモードはサフィックスなし
// 18. sources要素の型・長さ検証
// 19. sources/topicのサニタイズ
// 20. レスポンスにmodeフィールド含む

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../api/lib/jwt.js';

const JWT_SECRET = 'test-jwt-secret-key-for-dino-tests';

function createValidJwt() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: 'diary-admin', iat: now, exp: now + 3600 }, JWT_SECRET);
}

// Claude APIの正常レスポンスを生成するヘルパー
function claudeSuccessResponse(overrides = {}) {
  const data = {
    title: 'テスト日記',
    summary: 'テストサマリー',
    body: 'テスト本文',
    tags: ['#test'],
    image_prompt: 'test image prompt',
    ...overrides
  };
  return {
    ok: true,
    json: async () => ({
      content: [{ text: `\`\`\`json\n${JSON.stringify(data)}\n\`\`\`` }]
    })
  };
}

// モック用のreq/resファクトリ
function createMockReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://my-voice-diary.vercel.app',
      'content-type': 'application/json',
      'x-auth-token': createValidJwt(),
      'x-forwarded-for': '192.168.1.1',
      ...overrides.headers,
    },
    body: {
      rawText: '今日はテストの日です。',
      ...overrides.body,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    setHeader(key, value) { this._headers[key] = value; return this; },
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
    end() { return this; },
  };
  return res;
}

// 全テストで共通の環境変数
const baseEnv = {
  VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
  VERCEL_URL: 'my-voice-diary-xxx.vercel.app',
  JWT_SECRET,
  CLAUDE_API_KEY: 'sk-ant-test-key',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  IMAGE_TOKEN_SECRET: 'test-image-secret',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

// 標準的なfetchモック（Upstash + Claude + GitHub正常応答）
// capturedClaudeBodyに送信されたClaudeリクエストのbodyを格納
function createStandardFetchMock(capturedClaudeBody = null) {
  return vi.fn(async (url, options) => {
    // Upstash incr
    if (url.includes('upstash') && url.includes('incr')) {
      return { ok: true, json: async () => ({ result: 5 }) };
    }
    // Claude API
    if (url.includes('api.anthropic.com')) {
      if (capturedClaudeBody && options?.body) {
        capturedClaudeBody.value = JSON.parse(options.body);
      }
      return claudeSuccessResponse();
    }
    // GitHub API GET（ファイル存在チェック）
    if (url.includes('api.github.com') && (!options || options.method !== 'PUT')) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    // GitHub API PUT（ファイル保存）
    if (url.includes('api.github.com') && options?.method === 'PUT') {
      return { ok: true, json: async () => ({ content: { html_url: 'https://github.com/test' } }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('create-diary API 恐竜日記モード', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    Object.assign(process.env, baseEnv);
    originalFetch = globalThis.fetch;
    vi.resetModules();
    const mod = await import('../api/create-diary.js');
    handler = mod.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =================================================================
  // テスト1: mode="dino-story"で正常な日記作成
  // =================================================================
  it('mode="dino-story"で正常な日記作成ができること', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'カフェで友達とランチした',
        mode: 'dino-story',
        dinoContext: { era: 'modern', species: 'velociraptor', scenario: 'coexistence' }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.mode).toBe('dino-story');
    expect(res._json.filePath).toContain('-dino-story.md');
  });

  // =================================================================
  // テスト2: mode="dino-research"で正常な日記作成
  // =================================================================
  it('mode="dino-research"で正常な日記作成ができること', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'ティラノサウルスの羽毛について調べた',
        mode: 'dino-research',
        dinoContext: { topic: 'T-Rex feathers', sources: ['Nature 2024'] }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.mode).toBe('dino-research');
    expect(res._json.filePath).toContain('-dino-research.md');
  });

  // =================================================================
  // テスト3: mode未指定で後方互換
  // =================================================================
  it('mode未指定で従来通りの動作（後方互換）', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: '普通の日記です' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.mode).toBe('normal');
    // ファイルパスにモードサフィックスがないこと
    expect(res._json.filePath).not.toContain('-dino');
    expect(res._json.filePath).toMatch(/\/\d{4}-\d{2}-\d{2}\.md$/);
  });

  // =================================================================
  // テスト4: 不正なmode値で400エラー
  // =================================================================
  it('不正なmode値で400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'テスト', mode: 'invalid-mode' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('不正なモード');
  });

  // =================================================================
  // テスト5: dinoContext型不正で400エラー
  // =================================================================
  it('dinoContextが配列の場合400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'テスト', mode: 'dino-story', dinoContext: ['invalid'] }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('不正なコンテキスト形式');
  });

  // =================================================================
  // テスト6: species > 50文字で400エラー
  // =================================================================
  it('species > 50文字で400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-story',
        dinoContext: { species: 'a'.repeat(51) }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('恐竜種名が不正');
  });

  // =================================================================
  // テスト7: topic > 200文字で400エラー
  // =================================================================
  it('topic > 200文字で400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-research',
        dinoContext: { topic: 'a'.repeat(201) }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('研究テーマが不正');
  });

  // =================================================================
  // テスト8: sources > 5件で400エラー
  // =================================================================
  it('sources > 5件で400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-research',
        dinoContext: { sources: ['a', 'b', 'c', 'd', 'e', 'f'] }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('参考文献リストが不正');
  });

  // =================================================================
  // テスト9: dino-storyでdinoContextなしでも動作
  // =================================================================
  it('mode="dino-story"でdinoContextなしでもデフォルト世界観で動作すること', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'カフェでランチした', mode: 'dino-story' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.mode).toBe('dino-story');
  });

  // =================================================================
  // テスト10: mode=normalでdinoContext指定時は無視される
  // =================================================================
  it('mode="normal"でdinoContext指定時でも通常の日記が作成されること', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: '普通の日記',
        mode: 'normal',
        dinoContext: { era: 'modern', species: 'velociraptor' }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.mode).toBe('normal');
    expect(res._json.filePath).not.toContain('-dino');
  });

  // =================================================================
  // テスト11: Markdown生成にmode/dino_context含む
  // =================================================================
  it('mode="dino-story"時にMarkdownにmode/dino_contextが含まれること', async () => {
    let capturedGithubBody = null;
    globalThis.fetch = vi.fn(async (url, options) => {
      if (url.includes('upstash') && url.includes('incr')) {
        return { ok: true, json: async () => ({ result: 5 }) };
      }
      if (url.includes('api.anthropic.com')) {
        return claudeSuccessResponse();
      }
      if (url.includes('api.github.com') && options?.method === 'PUT') {
        capturedGithubBody = JSON.parse(options.body);
        return { ok: true, json: async () => ({ content: { html_url: 'https://github.com/test' } }) };
      }
      if (url.includes('api.github.com')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const req = createMockReq({
      body: {
        rawText: 'テスト日記',
        mode: 'dino-story',
        dinoContext: { era: 'modern', species: 'velociraptor', scenario: 'coexistence' }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(capturedGithubBody).not.toBeNull();

    // Base64デコードしてMarkdown内容を確認
    const markdown = Buffer.from(capturedGithubBody.content, 'base64').toString('utf-8');
    expect(markdown).toContain('mode: "dino-story"');
    expect(markdown).toContain('dino_context:');
    expect(markdown).toContain('era: "modern"');
    expect(markdown).toContain('species: "velociraptor"');
    expect(markdown).toContain('scenario: "coexistence"');
  });

  // =================================================================
  // テスト12: LLM出力スキーマ検証がmode付きでも動作
  // =================================================================
  it('LLM出力スキーマ検証がmode付きでも正常に動作すること', async () => {
    // 正常なLLMレスポンスでmode付きリクエストが成功することを確認
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'テスト', mode: 'dino-story', dinoContext: { era: 'modern' } }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.title).toBe('テスト日記');
  });

  // =================================================================
  // テスト13: dino-storyプロンプトに恐竜世界観含む
  // =================================================================
  it('mode="dino-story"時にClaude APIリクエストに恐竜世界観プロンプトが含まれること', async () => {
    const capturedClaudeBody = { value: null };
    globalThis.fetch = createStandardFetchMock(capturedClaudeBody);
    const req = createMockReq({
      body: {
        rawText: 'カフェでランチした',
        mode: 'dino-story',
        dinoContext: { era: 'modern', species: 'velociraptor', scenario: 'coexistence' }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(capturedClaudeBody.value).not.toBeNull();
    const prompt = capturedClaudeBody.value.messages[0].content;
    expect(prompt).toContain('恐竜が絶滅せず');
    expect(prompt).toContain('パラレルワールド');
    expect(prompt).toContain('velociraptor');
    expect(prompt).toContain('coexistence');
  });

  // =================================================================
  // テスト14: dino-researchプロンプトに研究ノート形式含む
  // =================================================================
  it('mode="dino-research"時にClaude APIリクエストに研究ノートプロンプトが含まれること', async () => {
    const capturedClaudeBody = { value: null };
    globalThis.fetch = createStandardFetchMock(capturedClaudeBody);
    const req = createMockReq({
      body: {
        rawText: 'ティラノサウルスの羽毛について',
        mode: 'dino-research',
        dinoContext: { topic: 'T-Rex feathers', sources: ['Nature 2024'] }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(capturedClaudeBody.value).not.toBeNull();
    const prompt = capturedClaudeBody.value.messages[0].content;
    expect(prompt).toContain('研究ノート');
    expect(prompt).toContain('古生物学');
    expect(prompt).toContain('T-Rex feathers');
    expect(prompt).toContain('Nature 2024');
  });

  // =================================================================
  // テスト15: mode未指定時に既存プロンプト使用
  // =================================================================
  it('mode未指定時に既存の通常プロンプトが使用されること', async () => {
    const capturedClaudeBody = { value: null };
    globalThis.fetch = createStandardFetchMock(capturedClaudeBody);
    const req = createMockReq({
      body: { rawText: '普通の日記' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(capturedClaudeBody.value).not.toBeNull();
    const prompt = capturedClaudeBody.value.messages[0].content;
    // 通常プロンプトの特徴的なテキストが含まれること
    expect(prompt).toContain('音声入力テキスト（口語）を、文語の日記形式');
    // 恐竜プロンプトの特徴が含まれないこと
    expect(prompt).not.toContain('恐竜が絶滅せず');
    expect(prompt).not.toContain('研究ノート');
  });

  // =================================================================
  // テスト16: ファイルパスにモードサフィックス
  // =================================================================
  it('mode="dino-story"時にファイルパスに-dino-storyサフィックスが付くこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'テスト', mode: 'dino-story' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.filePath).toMatch(/-dino-story\.md$/);
  });

  // =================================================================
  // テスト17: normalモードはサフィックスなし
  // =================================================================
  it('mode="normal"時にファイルパスにサフィックスがないこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: { rawText: 'テスト', mode: 'normal' }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.filePath).toMatch(/\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(res._json.filePath).not.toContain('-dino');
    expect(res._json.filePath).not.toContain('-normal');
  });

  // =================================================================
  // テスト18: sources要素の型・長さ検証
  // =================================================================
  it('sources要素がstring以外の場合400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-research',
        dinoContext: { sources: [123, 'valid'] }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('参考文献の要素が不正');
  });

  it('sources要素が100文字超過の場合400エラーを返すこと', async () => {
    globalThis.fetch = createStandardFetchMock();
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-research',
        dinoContext: { sources: ['a'.repeat(101)] }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toContain('参考文献の要素が不正');
  });

  // =================================================================
  // テスト19: sources/topicのサニタイズ
  // =================================================================
  it('sources/topicの制御文字・マークダウン記法がサニタイズされること', async () => {
    const capturedClaudeBody = { value: null };
    globalThis.fetch = createStandardFetchMock(capturedClaudeBody);
    const req = createMockReq({
      body: {
        rawText: 'テスト',
        mode: 'dino-research',
        dinoContext: {
          topic: 'T-Rex\x00 feathers```injection',
          sources: ['Nature\x01 2024```hack', 'Clean source']
        }
      }
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const prompt = capturedClaudeBody.value.messages[0].content;
    // 制御文字が除去されていること
    expect(prompt).not.toContain('\x00');
    expect(prompt).not.toContain('\x01');
    // ```が除去されていること
    expect(prompt).toContain('T-Rex feathersinjection');
    expect(prompt).toContain('Nature 2024hack');
    // クリーンなソースはそのまま
    expect(prompt).toContain('Clean source');
  });

  // =================================================================
  // テスト20: レスポンスにmodeフィールド含む
  // =================================================================
  it('レスポンスにmodeフィールドが含まれること', async () => {
    globalThis.fetch = createStandardFetchMock();

    // dino-storyモード
    const req1 = createMockReq({
      body: { rawText: 'テスト', mode: 'dino-story' }
    });
    const res1 = createMockRes();
    await handler(req1, res1);
    expect(res1._status).toBe(200);
    expect(res1._json.mode).toBe('dino-story');

    // mode未指定
    const req2 = createMockReq({
      body: { rawText: 'テスト' }
    });
    const res2 = createMockRes();
    await handler(req2, res2);
    expect(res2._status).toBe(200);
    expect(res2._json.mode).toBe('normal');
  });
});
