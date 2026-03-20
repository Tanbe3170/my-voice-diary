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
} from '../api/lib/image-styles.js';

describe('IMAGE_STYLES定義', () => {
  it('illustrationスタイルが定義されていること', () => {
    expect(IMAGE_STYLES.illustration).toBeDefined();
    expect(IMAGE_STYLES.illustration.name).toBe('フラットイラスト');
  });

  it('oilpaintingスタイルが定義されていること', () => {
    expect(IMAGE_STYLES.oilpainting).toBeDefined();
    expect(IMAGE_STYLES.oilpainting.name).toBe('油絵');
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
    expect(style.name).toBe('油絵');
    expect(style.promptPrefix).toContain('Oil painting');
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

  it('未知のstyleIdでnullを返すこと', () => {
    expect(getStyleClaudeInstruction('unknown')).toBeNull();
  });
});
