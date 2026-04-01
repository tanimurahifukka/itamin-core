# HAYABUSA - Claude Code Token Compression MCP Server

Claude Codeのコンテキストウィンドウを効率化するMCPサーバー。
コメント・デバッグ文・空行を除去し、関連ファイルのみを抽出してトークン使用量を削減。

## Setup

```bash
cd hayabusa
npm install
npm run build
```

## Claude Codeに登録

`~/.claude/settings.json` に追加:

```json
{
  "mcpServers": {
    "hayabusa": {
      "command": "node",
      "args": ["/absolute/path/to/hayabusa/dist/index.js"]
    }
  }
}
```

## Tools

### compress_context
ディレクトリ内のコードファイルを圧縮して返す。

```
directory: "/path/to/project"  # 必須
query: "auth login"            # キーワードで関連ファイルをフィルタ
max_files: 20                  # 最大ファイル数
```

### compress_file
単一ファイルを圧縮。

```
file_path: "/path/to/file.ts"
```

### list_files
コードファイル一覧を返す（node_modules等は除外済み）。

```
directory: "/path/to/project"
query: "plugin shift"          # キーワードフィルタ
```

## How It Works

1. **ファイル選択**: node_modules, .git, lock files等を自動除外
2. **キーワードフィルタ**: queryでパスマッチングし関連ファイルのみ抽出
3. **コード圧縮**: コメント、console.log/debugger、空行、末尾空白を除去
4. **レポート出力**: 削減率をサマリ表示
