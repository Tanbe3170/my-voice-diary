import { describe, it, expect } from 'vitest';
import { buildImageRequestBody } from '../docs/js/build-image-request.js';

describe('buildImageRequestBody', () => {
  it('基本パラメータのみ', () => {
    const body = buildImageRequestBody({ date: '2026-03-20', imageToken: 'tok123', styleId: 'illustration' });
    expect(body).toEqual({ date: '2026-03-20', imageToken: 'tok123', styleId: 'illustration' });
    expect(body.filePath).toBeUndefined();
    expect(body.characterId).toBeUndefined();
  });

  it('filePath + characterId付き', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20-dino-story.md',
      characterId: 'quetz-default',
      styleId: 'illustration'
    });
    expect(body).toEqual({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20-dino-story.md',
      characterId: 'quetz-default',
      styleId: 'illustration'
    });
  });

  it('characterIdなし・filePathあり', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      filePath: 'diaries/2026/03/2026-03-20.md',
      styleId: 'illustration'
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
      mode: 'dino-story',
      styleId: 'illustration'
    });
    expect(body.mode).toBe('dino-story');
  });

  it('mode=normalは含まれない', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20',
      imageToken: 'tok123',
      mode: 'normal',
      styleId: 'illustration'
    });
    expect(body.mode).toBeUndefined();
  });

  it('styleId=illustration時にbodyに含まれること', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20', imageToken: 'tok123', styleId: 'illustration'
    });
    expect(body.styleId).toBe('illustration');
  });

  it('styleId=oilpainting時にbodyに含まれること', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20', imageToken: 'tok123', styleId: 'oilpainting'
    });
    expect(body.styleId).toBe('oilpainting');
  });

  it('styleIdが常にbodyに設定されること（undefinedでも）', () => {
    const body = buildImageRequestBody({
      date: '2026-03-20', imageToken: 'tok123'
    });
    // styleId未指定でもbodyのキーとして存在する（値はundefined）
    expect('styleId' in body).toBe(true);
  });
});
