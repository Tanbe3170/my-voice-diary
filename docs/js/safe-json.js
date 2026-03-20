// docs/js/safe-json.js
// 安全なJSONパースヘルパー（非JSONレスポンス対応）
// 非JSONレスポンス時はHTTPステータスベースの汎用メッセージを返し、
// HTML本文や内部情報をクライアントに露出しない。
export async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // 非JSON/不正JSON時は汎用メッセージにマスク（情報漏えい防止）
    return { error: `HTTP ${response.status}` };
  }
}
