// tests/image-styles.test.js
// 画像生成スタイル定義のユニットテスト

import { describe, it, expect } from 'vitest';
import {
  IMAGE_STYLES,
  DEFAULT_STYLE,
  getStyle,
  isValidStyleId,
  getStylePromptPrefix,
  getStyleNegativePrompt,
  getStyleClaudeInstruction,
  getStyleConflicts,
} from '../lib/image-styles.js';

describe('IMAGE_STYLES定義', () => {
  it('illustrationスタイルが定義されていること', () => {
    expect(IMAGE_STYLES.illustration).toBeDefined();
    expect(IMAGE_STYLES.illustration.name).toBe('フラットイラスト');
  });

  it('oilpaintingスタイルが定義されていること', () => {
    expect(IMAGE_STYLES.oilpainting).toBeDefined();
    expect(IMAGE_STYLES.oilpainting.name).toBe('パレオアート');
  });

  it('popillustスタイルが定義されていること', () => {
    expect(IMAGE_STYLES.popillust).toBeDefined();
    expect(IMAGE_STYLES.popillust.name).toBe('ポップイラスト');
  });

  it('各スタイルにstyleConflictsが配列で定義されていること', () => {
    for (const [id, style] of Object.entries(IMAGE_STYLES)) {
      expect(Array.isArray(style.styleConflicts), `${id}.styleConflicts`).toBe(true);
    }
  });

  it('各スタイルのpromptPrefixが空でないこと', () => {
    for (const [id, style] of Object.entries(IMAGE_STYLES)) {
      expect(style.promptPrefix, `${id}.promptPrefix`).toBeTruthy();
      expect(typeof style.promptPrefix).toBe('string');
    }
  });

  it('各スタイルのnegativePromptが空でないこと', () => {
    for (const [id, style] of Object.entries(IMAGE_STYLES)) {
      expect(style.negativePrompt, `${id}.negativePrompt`).toBeTruthy();
      expect(typeof style.negativePrompt).toBe('string');
    }
  });

  it('各スタイルのclaudeInstructionが空でないこと', () => {
    for (const [id, style] of Object.entries(IMAGE_STYLES)) {
      expect(style.claudeInstruction, `${id}.claudeInstruction`).toBeTruthy();
      expect(typeof style.claudeInstruction).toBe('string');
    }
  });
});

describe('DEFAULT_STYLE', () => {
  it('illustrationがデフォルトであること', () => {
    expect(DEFAULT_STYLE).toBe('illustration');
  });

  it('DEFAULT_STYLEがIMAGE_STYLESに存在すること', () => {
    expect(IMAGE_STYLES[DEFAULT_STYLE]).toBeDefined();
  });
});

describe('getStyle', () => {
  it('illustrationのスタイル定義を返すこと', () => {
    const style = getStyle('illustration');
    expect(style).not.toBeNull();
    expect(style.name).toBe('フラットイラスト');
    expect(style.promptPrefix).toContain('Flat illustration');
  });

  it('oilpaintingのスタイル定義を返すこと', () => {
    const style = getStyle('oilpainting');
    expect(style).not.toBeNull();
    expect(style.name).toBe('パレオアート');
    expect(style.promptPrefix).toContain('paleoart');
  });

  it('popillustのスタイル定義を返すこと', () => {
    const style = getStyle('popillust');
    expect(style).not.toBeNull();
    expect(style.name).toBe('ポップイラスト');
    expect(style.promptPrefix).toContain('pop-art');
  });

  it('__proto__でnullを返すこと（プロトタイプ汚染防止）', () => {
    expect(getStyle('__proto__')).toBeNull();
    expect(getStyle('constructor')).toBeNull();
    expect(getStyle('toString')).toBeNull();
  });

  it('未知のstyleIdでnullを返すこと（フォールバックなし）', () => {
    expect(getStyle('unknown')).toBeNull();
    expect(getStyle('watercolor')).toBeNull();
    expect(getStyle('')).toBeNull();
  });

  it('null/undefinedでnullを返すこと', () => {
    expect(getStyle(null)).toBeNull();
    expect(getStyle(undefined)).toBeNull();
  });
});

describe('isValidStyleId', () => {
  it('illustrationでtrueを返すこと', () => {
    expect(isValidStyleId('illustration')).toBe(true);
  });

  it('oilpaintingでtrueを返すこと', () => {
    expect(isValidStyleId('oilpainting')).toBe(true);
  });

  it('popillustでtrueを返すこと', () => {
    expect(isValidStyleId('popillust')).toBe(true);
  });

  it('__proto__/constructorでfalseを返すこと（プロトタイプ汚染防止）', () => {
    expect(isValidStyleId('__proto__')).toBe(false);
    expect(isValidStyleId('constructor')).toBe(false);
    expect(isValidStyleId('toString')).toBe(false);
  });

  it('不明なキーでfalseを返すこと', () => {
    expect(isValidStyleId('unknown')).toBe(false);
    expect(isValidStyleId('watercolor')).toBe(false);
  });

  it('null/undefinedでfalseを返すこと', () => {
    expect(isValidStyleId(null)).toBe(false);
    expect(isValidStyleId(undefined)).toBe(false);
  });

  it('数値でfalseを返すこと', () => {
    expect(isValidStyleId(123)).toBe(false);
  });

  it('空文字列でfalseを返すこと', () => {
    expect(isValidStyleId('')).toBe(false);
  });
});

describe('getStylePromptPrefix', () => {
  it('illustrationのpromptPrefixを返すこと', () => {
    const prefix = getStylePromptPrefix('illustration');
    expect(prefix).toContain('Flat illustration');
  });

  it('未知のstyleIdでnullを返すこと', () => {
    expect(getStylePromptPrefix('unknown')).toBeNull();
  });
});

describe('getStyleNegativePrompt', () => {
  it('oilpaintingのnegativePromptを返すこと', () => {
    const neg = getStyleNegativePrompt('oilpainting');
    expect(neg).toContain('photorealistic');
  });

  it('未知のstyleIdでnullを返すこと', () => {
    expect(getStyleNegativePrompt('unknown')).toBeNull();
  });
});

describe('getStyleClaudeInstruction', () => {
  it('illustrationのclaudeInstructionを返すこと', () => {
    const inst = getStyleClaudeInstruction('illustration');
    expect(inst).toContain('フラットイラスト調');
  });

  it('popillustのclaudeInstructionを返すこと', () => {
    const inst = getStyleClaudeInstruction('popillust');
    expect(inst).toContain('ポップアートイラスト調');
  });

  it('未知のstyleIdでnullを返すこと', () => {
    expect(getStyleClaudeInstruction('unknown')).toBeNull();
  });

  it('oilpaintingのclaudeInstructionにストーリー駆動の【必須要素】が含まれること', () => {
    const inst = getStyleClaudeInstruction('oilpainting');
    expect(inst).toContain('【必須要素】');
    expect(inst).toContain('行動と感情');
    expect(inst).toContain('物語的意味');
    expect(inst).toContain('構図');
    expect(inst).toContain('ライティング');
    expect(inst).toContain('環境ストーリーテリング');
  });
});

describe('getStyleConflicts', () => {
  it('oilpaintingの衝突語リストを返すこと', () => {
    const conflicts = getStyleConflicts('oilpainting');
    expect(conflicts).toContain('kawaii');
    expect(conflicts).toContain('chibi');
  });

  it('popillustの衝突語リストを返すこと', () => {
    const conflicts = getStyleConflicts('popillust');
    expect(conflicts).toContain('photorealistic');
    expect(conflicts).toContain('watercolor');
  });

  it('未知のstyleIdで空配列を返すこと', () => {
    expect(getStyleConflicts('unknown')).toEqual([]);
  });
});
