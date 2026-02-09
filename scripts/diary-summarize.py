#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diary-summarize.py
音声入力テキストをClaude APIで日記形式に整形するスクリプト

使い方:
    python3 diary-summarize.py "今日は朝からフクロウ図鑑の開発をしていました..."
"""

import os
import sys
import json
import re
from datetime import datetime
from anthropic import Anthropic

def check_api_key():
    """ANTHROPIC_API_KEY環境変数が設定されているかチェック"""
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("❌ エラー: ANTHROPIC_API_KEYが設定されていません", file=sys.stderr)
        print("", file=sys.stderr)
        print("以下のコマンドで設定してください:", file=sys.stderr)
        print("  export ANTHROPIC_API_KEY='sk-ant-api03-...'", file=sys.stderr)
        print("", file=sys.stderr)
        print("または ~/.bashrc に追加してください:", file=sys.stderr)
        print("  echo 'export ANTHROPIC_API_KEY=\"sk-ant-api03-...\"' >> ~/.bashrc", file=sys.stderr)
        print("  source ~/.bashrc", file=sys.stderr)
        sys.exit(1)
    return api_key

def create_diary_prompt(raw_text):
    """日記整形用のプロンプトを作成"""
    today = datetime.now().strftime("%Y年%m月%d日")
    
    prompt = f"""あなたは日記執筆のアシスタントです。以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
{raw_text}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

```json
{{
  "date": "{today}",
  "title": "その日の出来事を要約した魅力的なタイトル（15文字以内）",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "body": "詳細な日記本文（段落分けあり、文語体で整った文章）",
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
}}
```

【整形のルール】
1. 口語（「〜でした」「〜なんだけど」）→ 文語（「〜だった」「〜だが」）
2. タイトルは読者の興味を引く工夫をする
3. サマリーは3行で要点をまとめる
4. 本文は適度に段落分けし、読みやすくする
5. ハッシュタグはInstagram投稿を想定（#日記 #今日の出来事 など）
6. 画像プロンプトは情景が浮かぶような具体的な英語で記述

それでは、音声入力テキストを日記に整形してください。"""
    
    return prompt

def extract_json_from_response(response_text):
    """Claude APIのレスポンスからJSON部分を抽出"""
    # ```json ... ``` の中身を取得
    json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # ```なしでJSONが返ってきた場合
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
        else:
            raise ValueError("レスポンスからJSONを抽出できませんでした")
    
    return json_str

def summarize_diary(raw_text, api_key):
    """Claude APIで日記を整形"""
    client = Anthropic(api_key=api_key)
    
    prompt = create_diary_prompt(raw_text)
    
    print("🤖 Claude APIにリクエスト送信中...", file=sys.stderr)
    
    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        response_text = message.content[0].text
        print("✅ レスポンス受信完了", file=sys.stderr)
        
        # JSONを抽出
        json_str = extract_json_from_response(response_text)
        diary_data = json.loads(json_str)
        
        return diary_data
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    """メイン処理"""
    if len(sys.argv) < 2:
        print("使い方: python3 diary-summarize.py \"音声入力テキスト\"", file=sys.stderr)
        sys.exit(1)
    
    raw_text = sys.argv[1]
    
    # APIキーチェック
    api_key = check_api_key()
    
    # 日記整形
    diary_data = summarize_diary(raw_text, api_key)
    
    # JSON出力（標準出力）
    print(json.dumps(diary_data, ensure_ascii=False, indent=2))
    
    # ログ出力（標準エラー出力）
    print("", file=sys.stderr)
    print("📝 整形完了！", file=sys.stderr)
    print(f"  タイトル: {diary_data['title']}", file=sys.stderr)
    print(f"  ハッシュタグ: {' '.join(diary_data['tags'])}", file=sys.stderr)

if __name__ == "__main__":
    main()
