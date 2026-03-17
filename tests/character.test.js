// tests/character.test.js
// キャラクター読み込み・プロンプト合成ライブラリのテスト
//
// テストシナリオ:
// 1. loadCharacter: GitHub APIからのキャラクター設定読み込み
// 2. composeImagePrompt: 画像生成プロンプトの合成
// 3. injectCharacterPrompt: Claudeプロンプトへのキャラクター設定注入

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCharacter, composeImagePrompt, injectCharacterPrompt } from '../api/lib/character.js';

// fetchモック
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// テスト用キャラクター設定（最小限の有効データ）
function createValidCharacter(overrides = {}) {
  return {
    id: 'quetz-default',
    name: 'ケッツ',
    nameEn: 'Quetz',
    species: {
      scientific: 'Quetzalcoatlus northropi',
      common: 'ケッツァコアトルス',
      family: 'Azhdarchidae',
    },
    personality: {
      traits: ['好奇心旺盛', 'おおらか'],
      speechStyle: 'のんびりした口調',
      firstPerson: 'ボク',
      catchphrase: '今日も空から見ると、いい一日だったなぁ〜',
    },
    appearance: {
      consistencyKeywords: ['chibi quetzalcoatlus', 'oversized head', 'long pointed beak'],
    },
    imageGeneration: {
      basePrompt: 'A cute chibi Quetzalcoatlus pterosaur character',
      negativePrompt: 'photorealistic, dark, horror',
      styleModifiers: ['soft lighting', 'warm color palette'],
      craftAnalysis: {
        color: 'warm earth tones',
        rendering: 'clean digital illustration',
        atmosphere: 'friendly, kawaii',
      },
    },
    ...overrides,
  };
}

// GitHub APIレスポンスのヘルパー
function githubApiResponse(character) {
  const content = Buffer.from(JSON.stringify(character)).toString('base64');
  return {
    ok: true,
    json: async () => ({ content }),
  };
}

const githubConfig = {
  token: 'ghp_test',
  owner: 'TestOwner',
  repo: 'test-repo',
};

// ===================================================================
// loadCharacter
// ===================================================================

describe('loadCharacter', () => {
  it('デフォルトキャラクター読み込み成功', async () => {
    const character = createValidCharacter();
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(character));

    const result = await loadCharacter('quetz-default', githubConfig);

    expect(result).not.toBeNull();
    expect(result.id).toBe('quetz-default');
    expect(result.name).toBe('ケッツ');

    // GitHub APIが正しいURLで呼ばれたことを確認
    const callUrl = global.fetch.mock.calls[0][0];
    expect(callUrl).toContain('characters/quetz-default.json');
    expect(callUrl).toContain('TestOwner');
    expect(callUrl).toContain('test-repo');
  });

  it('存在しないキャラクターIDでnull返却', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await loadCharacter('nonexistent', githubConfig);
    expect(result).toBeNull();
  });

  it('GitHub API失敗時にnull返却', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('JSON解析失敗時にnull返却', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: Buffer.from('not valid json {{{').toString('base64'),
      }),
    });

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('スキーマ検証失敗時にnull返却（必須フィールド不足）', async () => {
    const invalidCharacter = { id: 'test', name: 'テスト' }; // appearance/imageGeneration欠落
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('test', githubConfig);
    expect(result).toBeNull();
  });

  it('パストラバーサル攻撃でnull返却（"../secret"）', async () => {
    const result = await loadCharacter('../secret', githubConfig);
    expect(result).toBeNull();
    // fetchが呼ばれていないことを確認
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('過長characterId（31文字以上）でnull返却', async () => {
    const longId = 'a'.repeat(31);
    const result = await loadCharacter(longId, githubConfig);
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('不正文字含むcharacterId（大文字・スラッシュ等）でnull返却', async () => {
    const testCases = ['Default/../../', 'UPPERCASE', 'has space', 'has.dot', 'has_underscore'];
    for (const invalidId of testCases) {
      const result = await loadCharacter(invalidId, githubConfig);
      expect(result).toBeNull();
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GitHub設定不足時にnull返却', async () => {
    const result = await loadCharacter('quetz-default', { token: '', owner: '', repo: '' });
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ===================================================================
// composeImagePrompt
// ===================================================================

describe('composeImagePrompt', () => {
  it('キャラクター設定 + image_promptの合成', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('A sunny park scene', character);

    expect(result.prompt).toContain('A cute chibi Quetzalcoatlus pterosaur character');
    expect(result.prompt).toContain('Scene: A sunny park scene');
    expect(result.negativePrompt).toBe('photorealistic, dark, horror');
  });

  it('キャラクターがnullの場合はimage_promptをそのまま返却', () => {
    const result = composeImagePrompt('A sunny park scene', null);

    expect(result.prompt).toBe('A sunny park scene');
    expect(result.negativePrompt).toBe('');
  });

  it('合成結果が3800文字以内に収まること', () => {
    const character = createValidCharacter();
    const longPrompt = 'A'.repeat(4000);
    const result = composeImagePrompt(longPrompt, character);

    expect(result.prompt.length).toBeLessThanOrEqual(3800);
  });

  it('consistencyKeywordsが合成結果に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character);

    expect(result.prompt).toContain('chibi quetzalcoatlus');
    expect(result.prompt).toContain('oversized head');
    expect(result.prompt).toContain('long pointed beak');
  });

  it('CRAFT分析フィールドが合成に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character);

    expect(result.prompt).toContain('warm earth tones');
    expect(result.prompt).toContain('clean digital illustration');
    expect(result.prompt).toContain('friendly, kawaii');
  });

  it('styleModifiersが合成結果に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character);

    expect(result.prompt).toContain('soft lighting');
    expect(result.prompt).toContain('warm color palette');
  });
});

// ===================================================================
// injectCharacterPrompt
// ===================================================================

describe('injectCharacterPrompt', () => {
  it('キャラクター設定がClaudeプロンプトに注入されること', () => {
    const character = createValidCharacter();
    const basePrompt = '以下の日記を整形してください。';
    const result = injectCharacterPrompt(basePrompt, character);

    expect(result).toContain('以下の日記を整形してください。');
    expect(result).toContain('キャラクター設定');
    expect(result).toContain('ケッツ');
  });

  it('キャラクターがnullの場合は元のプロンプトを返却', () => {
    const basePrompt = '以下の日記を整形してください。';
    const result = injectCharacterPrompt(basePrompt, null);

    expect(result).toBe(basePrompt);
  });

  it('personality.speechStyleが含まれること', () => {
    const character = createValidCharacter();
    const result = injectCharacterPrompt('base', character);

    expect(result).toContain('のんびりした口調');
  });

  it('species.commonが含まれること', () => {
    const character = createValidCharacter();
    const result = injectCharacterPrompt('base', character);

    expect(result).toContain('ケッツァコアトルス');
  });

  it('一人称が含まれること', () => {
    const character = createValidCharacter();
    const result = injectCharacterPrompt('base', character);

    expect(result).toContain('ボク');
  });

  it('学名（scientific name）が含まれること', () => {
    const character = createValidCharacter();
    const result = injectCharacterPrompt('base', character);

    expect(result).toContain('Quetzalcoatlus northropi');
  });
});
