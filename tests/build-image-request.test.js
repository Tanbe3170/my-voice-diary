import { describe, it, expect } from 'vitest';
import { buildImageRequestBody } from '../docs/js/build-image-request.js';

describe('buildImageRequestBody', () => {
  it('基本パラメータのみ', () => {
    const body = buildImageRequestBody({ date: '2026-03-20', imageToken: 'tok123' });
    expect(body).toEqual({ date: '2026-03-20', imageToken: 'tok123' });
    expect(body.filePath).toBeUndefined();
    expect(body.characterId).toBeUndefined();
  });

  it('filePath + characterId付き', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20-dino-story.md',
      characterId: 'quetz-default'
    });
    expect(body).toEqual({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20-dino-story.md',
      characterId: 'quetz-default'
    });
  });

  it('characterIdなし・filePathあり', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20.md'
    });
    expect(body.filePath).toBe('diaries/2026/03/2026-03-20.md');
    expect(body.characterId).toBeUndefined();
  });

  it('mode付き（dino-story）', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20-dino-story.md',
      characterId: 'quetz-default',
      mode: 'dino-story'
    });
    expect(body.mode).toBe('dino-story');
  });

  it('mode=normalは含まれない', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      mode: 'normal'
    });
    expect(body.mode).toBeUndefined();
  });
});
