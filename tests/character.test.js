// tests/character.test.js
// キャラクター読み込み・プロンプト合成ライブラリのテスト
//
// テストシナリオ:
// 1. loadCharacter: GitHub APIからのキャラクター設定読み込み
// 2. composeImagePrompt: 画像生成プロンプトの合成
// 3. injectCharacterPrompt: Claudeプロンプトへのキャラクター設定注入

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCharacter, composeImagePrompt, injectCharacterPrompt } from '../lib/character.js';
import { getStyle } from '../lib/image-styles.js';

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

// styleOverrides付きキャラクター設定
function createCharacterWithStyleOverrides(overrides = {}) {
  return createValidCharacter({
    imageGeneration: {
      basePrompt: 'A cute chibi Quetzalcoatlus pterosaur character',
      negativePrompt: 'photorealistic, dark, horror',
      styleModifiers: ['soft lighting', 'warm color palette'],
      craftAnalysis: {
        color: 'warm earth tones',
        rendering: 'clean digital illustration',
        atmosphere: 'friendly, kawaii',
      },
      styleOverrides: {
        illustration: {
          basePrompt: 'A cute chibi Quetzalcoatlus, kawaii cartoon style',
          eyeDescriptor: 'small round amber-orange eye with round black pupil and single bright catchlight',
          consistencyKeywords: ['chibi quetzalcoatlus', 'small round amber eye with catchlight'],
          craftAnalysis: {
            color: 'warm earth tones with cream accents, limited palette',
            rendering: 'flat illustration with bold outlines',
            atmosphere: 'friendly, approachable, educational clarity',
          },
        },
        oilpainting: {
          basePrompt: 'A scientifically accurate Quetzalcoatlus northropi azhdarchid pterosaur, anatomically correct proportions',
          eyeDescriptor: 'realistic detailed pterosaur eye with round bird-like pupil, dark amber-brown iris',
          negativePrompt: 'photorealistic, dark, horror, kawaii, chibi, anime eyes, cartoon, cute',
          consistencyKeywords: ['anatomically accurate quetzalcoatlus', 'realistic bird-like eye with round pupil'],
          craftAnalysis: {
            color: 'muted naturalistic earth tones, golden amber highlights',
            rendering: 'acrylic paleoart painting, soft layered brushwork',
            atmosphere: 'serene documentary, environmental storytelling',
          },
        },
      },
      ...overrides,
    },
  });
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

  it('signal付きfetchが正常動作すること', async () => {
    const character = createValidCharacter();
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(character));
    const ac = new AbortController();

    const result = await loadCharacter('quetz-default', githubConfig, { signal: ac.signal });

    expect(result).not.toBeNull();
    expect(result.id).toBe('quetz-default');
    // fetchにsignalが渡されていることを確認
    const fetchOpts = global.fetch.mock.calls[0][1];
    expect(fetchOpts.signal).toBe(ac.signal);
  });

  it('signal未指定時はfetchにsignalが含まれないこと', async () => {
    const character = createValidCharacter();
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(character));

    const result = await loadCharacter('quetz-default', githubConfig);

    expect(result).not.toBeNull();
    const fetchOpts = global.fetch.mock.calls[0][1];
    expect(fetchOpts.signal).toBeUndefined();
  });
});

// ===================================================================
// composeImagePrompt
// ===================================================================

describe('composeImagePrompt', () => {
  it('キャラクター設定 + image_promptの合成', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('A sunny park scene', character, 'illustration');

    expect(result.prompt).toContain('A cute chibi Quetzalcoatlus pterosaur character');
    expect(result.prompt).toContain('Scene: A sunny park scene');
    expect(result.negativePrompt).toContain('photorealistic, dark, horror');
  });

  it('キャラクターがnullの場合はimage_promptをそのまま返却', () => {
    const result = composeImagePrompt('A sunny park scene', null, 'illustration');

    expect(result.prompt).toContain('A sunny park scene');
  });

  it('合成結果が3800文字以内に収まること', () => {
    const character = createValidCharacter();
    const longPrompt = 'A'.repeat(4000);
    const result = composeImagePrompt(longPrompt, character, 'illustration');

    expect(result.prompt.length).toBeLessThanOrEqual(3800);
  });

  it('consistencyKeywordsが合成結果に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('chibi quetzalcoatlus');
    expect(result.prompt).toContain('oversized head');
    expect(result.prompt).toContain('long pointed beak');
  });

  it('CRAFT分析フィールドが合成に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('warm earth tones');
    expect(result.prompt).toContain('clean digital illustration');
    expect(result.prompt).toContain('friendly, kawaii');
  });

  it('styleModifiersが合成結果に含まれること', () => {
    const character = createValidCharacter();
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('soft lighting');
    expect(result.prompt).toContain('warm color palette');
  });

  // スタイル連携テスト
  it('キャラクターなし + illustrationスタイル', () => {
    const style = getStyle('illustration');
    const result = composeImagePrompt('A sunny park scene', null, 'illustration');

    expect(result.prompt).toContain(style.promptPrefix);
    expect(result.prompt).toContain('A sunny park scene');
    expect(result.negativePrompt).toContain(style.negativePrompt);
  });

  it('キャラクターなし + oilpaintingスタイル', () => {
    const style = getStyle('oilpainting');
    const result = composeImagePrompt('A sunny park scene', null, 'oilpainting');

    expect(result.prompt).toContain(style.promptPrefix);
    expect(result.prompt).toContain('A sunny park scene');
    expect(result.negativePrompt).toContain(style.negativePrompt);
  });

  it('キャラクターあり + illustrationスタイル', () => {
    const character = createValidCharacter();
    const style = getStyle('illustration');
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('Art style:');
    expect(result.prompt).toContain(style.promptPrefix);
    expect(result.negativePrompt).toContain(character.imageGeneration.negativePrompt);
    expect(result.negativePrompt).toContain(style.negativePrompt);
  });

  it('キャラクターあり + oilpaintingスタイル', () => {
    const character = createValidCharacter();
    const style = getStyle('oilpainting');
    const result = composeImagePrompt('test scene', character, 'oilpainting');

    expect(result.prompt).toContain('Art style:');
    expect(result.prompt).toContain(style.promptPrefix);
    expect(result.negativePrompt).toContain(character.imageGeneration.negativePrompt);
    expect(result.negativePrompt).toContain(style.negativePrompt);
  });

  it('900文字超のプロンプトで警告ログが出力されること（キャラクターなし）', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const longPrompt = 'A'.repeat(800);
    const result = composeImagePrompt(longPrompt, null, 'oilpainting');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PROMPT_LENGTH_WARN]'));
    warnSpy.mockRestore();
  });

  it('900文字超のプロンプトで警告ログが出力されること（キャラクターあり）', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const character = createValidCharacter();
    const longPrompt = 'A'.repeat(800);
    const result = composeImagePrompt(longPrompt, character, 'oilpainting');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PROMPT_LENGTH_WARN]'));
    warnSpy.mockRestore();
  });

  it('短いプロンプトで警告ログが出力されないこと', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const shortPrompt = 'A short prompt';
    composeImagePrompt(shortPrompt, null, 'illustration');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('negativePromptマージ検証', () => {
    const character = createValidCharacter();
    const style = getStyle('oilpainting');
    const result = composeImagePrompt('test scene', character, 'oilpainting');

    // キャラクターとスタイルの両方のnegativePromptが含まれる
    const charNeg = character.imageGeneration.negativePrompt;
    const styleNeg = style.negativePrompt;
    expect(result.negativePrompt).toContain(charNeg);
    expect(result.negativePrompt).toContain(styleNeg);
    // カンマで区切られていること
    expect(result.negativePrompt).toBe(`${charNeg}, ${styleNeg}`);
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

// ===================================================================
// composeImagePrompt - スタイル別分岐
// ===================================================================

describe('composeImagePrompt - スタイル別分岐', () => {
  it('illustration: chibi basePromptと小さい丸い目を使用', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('A sunny park scene', character, 'illustration');

    expect(result.prompt).toContain('kawaii cartoon style');
    expect(result.prompt).toContain('small round amber-orange eye');
  });

  it('oilpainting: 写実的basePromptと鳥類型目を使用', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('A sunny park scene', character, 'oilpainting');

    expect(result.prompt).toContain('scientifically accurate Quetzalcoatlus');
    expect(result.prompt).toContain('realistic detailed pterosaur eye');
    expect(result.prompt).toContain('bird-like pupil');
  });

  it('oilpainting: negativePromptにkawaii/chibiが含まれる', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('A sunny park scene', character, 'oilpainting');

    expect(result.negativePrompt).toContain('kawaii');
    expect(result.negativePrompt).toContain('chibi');
    expect(result.negativePrompt).toContain('anime eyes');
  });

  it('不明なstyleId: デフォルトbasePromptにフォールバック', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('A sunny park scene', character, 'watercolor');

    // デフォルトのbasePromptが使用される
    expect(result.prompt).toContain('A cute chibi Quetzalcoatlus pterosaur character');
    // eyeDescriptorはないのでEye detailが含まれない
    expect(result.prompt).not.toContain('Eye detail');
  });

  it('styleOverrides未定義: デフォルトにフォールバック', () => {
    const character = createValidCharacter(); // styleOverridesなし
    const result = composeImagePrompt('A sunny park scene', character, 'illustration');

    // デフォルトのbasePromptが使用される
    expect(result.prompt).toContain('A cute chibi Quetzalcoatlus pterosaur character');
    // eyeDescriptorがないのでEye detailが含まれない
    expect(result.prompt).not.toContain('Eye detail');
  });

  it('eyeDescriptorがプロンプトに含まれること', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('Eye detail (IMPORTANT):');
    expect(result.prompt).toContain('small round amber-orange eye');
  });

  it('スタイル不整合検出が警告を出す', () => {
    const warnSpy = vi.spyOn(console, 'warn');

    // kawaii basePromptをoilpaintingスタイルで使用するとスタイル不整合
    const character = createValidCharacter({
      imageGeneration: {
        basePrompt: 'A cute chibi kawaii Quetzalcoatlus',
        negativePrompt: 'dark, horror',
        styleModifiers: ['soft lighting'],
        craftAnalysis: {
          color: 'warm tones',
          rendering: 'digital illustration',
          atmosphere: 'friendly',
        },
      },
    });
    composeImagePrompt('test scene', character, 'oilpainting');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[STYLE_CONFLICT]')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('kawaii')
    );
    warnSpy.mockRestore();
  });
});

// ===================================================================
// composeImagePrompt - craftAnalysis互換（resolveStyleAttributes振る舞い検証）
// ===================================================================

describe('composeImagePrompt - craftAnalysis互換', () => {
  it('v1(flat craftAnalysis): Colorセクションが合成結果に含まれる', () => {
    const character = createValidCharacter(); // v1フラット形式
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).toContain('Color: warm earth tones');
    expect(result.prompt).toContain('Rendering: clean digital illustration');
    expect(result.prompt).toContain('Atmosphere: friendly, kawaii');
  });

  it('v2(nested craftAnalysis): styleId対応のColorセクションが使用される', () => {
    const character = createValidCharacter({
      imageGeneration: {
        basePrompt: 'A cute chibi Quetzalcoatlus pterosaur character',
        negativePrompt: 'dark, horror',
        styleModifiers: ['soft lighting'],
        craftAnalysis: {
          illustration: {
            color: 'vibrant colors for illustration',
            rendering: 'flat illustration rendering',
            atmosphere: 'cheerful illustration atmosphere',
          },
          oilpainting: {
            color: 'muted earth tones for painting',
            rendering: 'oil painting rendering',
            atmosphere: 'serene painting atmosphere',
          },
        },
      },
    });

    const result = composeImagePrompt('test scene', character, 'illustration');
    expect(result.prompt).toContain('Color: vibrant colors for illustration');
    expect(result.prompt).toContain('Rendering: flat illustration rendering');

    const result2 = composeImagePrompt('test scene', character, 'oilpainting');
    expect(result2.prompt).toContain('Color: muted earth tones for painting');
    expect(result2.prompt).toContain('Rendering: oil painting rendering');
  });

  it('styleOverrides内craftAnalysisが最優先で使用される', () => {
    const character = createCharacterWithStyleOverrides();
    const result = composeImagePrompt('test scene', character, 'illustration');

    // styleOverrides.illustration.craftAnalysisが使用される
    expect(result.prompt).toContain('Color: warm earth tones with cream accents, limited palette');
    expect(result.prompt).toContain('Rendering: flat illustration with bold outlines');
  });

  it('craftAnalysis未定義: Colorセクションが省略される', () => {
    const character = createValidCharacter({
      imageGeneration: {
        basePrompt: 'A cute chibi Quetzalcoatlus pterosaur character',
        negativePrompt: 'dark, horror',
        styleModifiers: ['soft lighting'],
        // craftAnalysis未定義
      },
    });
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).not.toContain('Color:');
  });

  it('craftAnalysis部分定義: colorのみでRendering: undefinedが出ないこと', () => {
    const character = createCharacterWithStyleOverrides();
    character.imageGeneration.styleOverrides.illustration.craftAnalysis = {
      color: 'warm earth tones',
      // rendering, atmosphere が未定義
    };
    const result = composeImagePrompt('test scene', character, 'illustration');

    expect(result.prompt).not.toContain('undefined');
    expect(result.prompt).not.toContain('Rendering:');
  });
});

// ===================================================================
// styleOverrides 不正データ防御テスト
// ===================================================================

describe('composeImagePrompt - styleOverrides不正データ防御', () => {
  it('不正styleOverrides: consistencyKeywordsが非配列でもエラーにならない', () => {
    const character = createCharacterWithStyleOverrides();
    character.imageGeneration.styleOverrides.illustration.consistencyKeywords = 'not-an-array';
    // resolveStyleAttributesがデフォルトにフォールバックする
    const result = composeImagePrompt('A sunny day', character, 'illustration');
    expect(result).toBeDefined();
    expect(result.prompt).toBeDefined();
    // デフォルトのconsistencyKeywordsが使われる
    expect(result.prompt).toContain('chibi quetzalcoatlus');
  });

  it('不正styleOverrides: styleModifiersが非配列でもエラーにならない', () => {
    const character = createCharacterWithStyleOverrides();
    character.imageGeneration.styleOverrides.illustration.styleModifiers = 123;
    const result = composeImagePrompt('A sunny day', character, 'illustration');
    expect(result).toBeDefined();
    expect(result.prompt).toBeDefined();
  });

  it('不正styleOverrides: basePromptが非文字列でもエラーにならない', () => {
    const character = createCharacterWithStyleOverrides();
    character.imageGeneration.styleOverrides.illustration.basePrompt = 999;
    const result = composeImagePrompt('A sunny day', character, 'illustration');
    expect(result).toBeDefined();
    // デフォルトのbasePromptにフォールバック
    expect(result.prompt).toContain('A cute chibi Quetzalcoatlus pterosaur character');
  });

  it('不正styleOverrides: negativePromptが非文字列でもエラーにならない', () => {
    const character = createCharacterWithStyleOverrides();
    character.imageGeneration.styleOverrides.illustration.negativePrompt = ['array'];
    const result = composeImagePrompt('A sunny day', character, 'illustration');
    expect(result).toBeDefined();
    expect(result.negativePrompt).toBeDefined();
  });

  it('validateCharacterSchema: consistencyKeywordsが数値の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.consistencyKeywords = 12345;
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: styleModifiersがオブジェクトの場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.styleModifiers = { bad: true };
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: basePromptが数値の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.basePrompt = 999;
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: craftAnalysisが文字列の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.craftAnalysis = 'bad';
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: negativePromptが配列の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.negativePrompt = ['bad'];
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: styleOverridesが配列の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides = ['bad'];
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: styleOverrides.illustrationが配列の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration = ['bad'];
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });

  it('validateCharacterSchema: craftAnalysisが配列の場合にスキーマ検証失敗', async () => {
    const invalidCharacter = createCharacterWithStyleOverrides();
    invalidCharacter.imageGeneration.styleOverrides.illustration.craftAnalysis = ['bad'];
    global.fetch = vi.fn().mockResolvedValueOnce(githubApiResponse(invalidCharacter));

    const result = await loadCharacter('quetz-default', githubConfig);
    expect(result).toBeNull();
  });
});
