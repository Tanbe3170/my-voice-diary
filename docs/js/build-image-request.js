/**
 * 画像生成APIリクエストボディ構築
 * @param {object} params
 * @param {string} params.date - 日付 (YYYY-MM-DD)
 * @param {string} params.imageToken - 画像認証トークン
 * @param {string} [params.filePath] - 日記ファイルパス
 * @param {string} [params.characterId] - キャラクターID
 * @returns {object} generate-image APIリクエストボディ
 */
export function buildImageRequestBody({ date, imageToken, filePath, characterId, mode, styleId }) {
  const body = { date, imageToken };
  if (filePath) body.filePath = filePath;
  if (characterId) body.characterId = characterId;
  if (mode && mode !== 'normal') body.mode = mode;
  body.styleId = styleId;
  return body;
}
