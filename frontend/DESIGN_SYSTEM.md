# ITAMIN Frontend Design System

本プロダクトの UI 基盤は **デジタル庁デザインシステム v3** の階層構造・命名規則に準拠する。
本ドキュメントは Token / Component を「デジタル庁の枠組み → ITAMIN の実装」で対応付ける。

参照: https://design.digital.go.jp/

---

## 1. 基本原則

デジタル庁の 5 原則をそのまま採用する。

| 原則 | ITAMIN での解釈 |
|---|---|
| 明快さ (Clarity) | テキスト最小 14px、line-height 1.7 以上、コントラスト WCAG AA |
| 効率性 (Efficiency) | 再利用可能な Atom/Molecule で重複削減（CSS 91% 削減実績） |
| 公平性 (Equity) | キーボード操作可能、`:focus-visible` で 2px ブルーアウトライン |
| 一貫性 (Consistency) | デザイントークンは `@theme` 一元管理、Tailwind ユーティリティで参照 |
| 信頼性 (Reliability) | ロール／ステータスは固定パレット、エラー表示は赤 + テキスト + アイコン |

---

## 2. Design Tokens

### 2.1 階層構造

デジタル庁準拠の 4 階層トークンモデル。

```
Primitive  ──→  Semantic  ──→  Component  ──→  Legacy alias
（基本パレット）（用途別エイリアス）（コンポーネント固有）（後方互換）
```

実装は `frontend/src/styles/tailwind.css` の `@theme` ブロック。

### 2.2 Primitive Palette

| カテゴリ | スケール | 主な値 | 用途 |
|---|---|---|---|
| Blue | 50 / 100 / 200 / 500 / 700 / 900 / 1000 | `--color-blue-700` = `#2563eb` | ブランド primary |
| Sumi（墨） | 50 / 100 / 200 / 300 / 500 / 600 / 700 / 900 | `--color-sumi-900` = `#1a1a1a` | テキスト・ボーダー |
| Red | 50 / 200 / 500 / 700 / 900 | `--color-red-500` = `#ef4444` | エラー / 危険操作 |
| Green | 50 / 500 / 700 / 900 | `--color-green-700` = `#16a34a` | 成功 |
| Yellow | 50 / 500 / 700 / 900 | `--color-yellow-500` = `#f59e0b` | 警告 |
| Magenta | 500 / 700 | `--color-magenta-500` = `#e94560` | 旧打刻テーマ（限定使用） |

### 2.3 Semantic Tokens

デジタル庁 v3 の category 命名（`text-` / `background-` / `border-` / `fill-`）に揃える。

#### Text
| Token | 値 | 用途 |
|---|---|---|
| `--color-text-body` | sumi-900 | 本文 |
| `--color-text-description` | sumi-700 | 副情報・注釈 |
| `--color-text-disabled` | sumi-500 | 無効状態 |
| `--color-text-link` | blue-700 | リンク |
| `--color-text-on-fill` | white | fill 上のテキスト |

#### Background
| Token | 値 | 用途 |
|---|---|---|
| `--color-background-body` | sumi-50 | キャンバス |
| `--color-background-surface` | white | カード・モーダル |
| `--color-background-subtle` | sumi-100 | 弱い区別が欲しい領域 |

#### Border
| Token | 値 | 用途 |
|---|---|---|
| `--color-border-divider` | sumi-200 | 区切り線 |
| `--color-border-field` | sumi-200 | 入力フィールド |
| `--color-border-strong` | sumi-700 | 強調枠 |

#### Fill (Brand action)
| Token | 値 | 用途 |
|---|---|---|
| `--color-fill-primary` | blue-700 | 主要 CTA |
| `--color-fill-primary-hover` | blue-900 | hover 状態 |
| `--color-fill-primary-subtle` | blue-50 | active タブ背景等 |

#### State
| State | fill | bg | fg |
|---|---|---|---|
| Success | green-700 | green-50 | green-900 |
| Warning | yellow-500 | yellow-50 | yellow-900 |
| Error | red-500 | red-50 | red-900 |
| Info | — | blue-100 | blue-1000 |

#### Focus ring
| Token | 値 | 用途 |
|---|---|---|
| `--color-focus-ring` | blue-700 | `:focus-visible` 既定アウトライン |

### 2.4 Typography

| Token | 値 | 備考 |
|---|---|---|
| `--font-sans` | `'Noto Sans JP', -apple-system, …` | 日本語優先・OS 標準フォールバック |
| `--font-mono` | `'SF Mono', Menlo, …` | コード・ID 表示 |
| body font-size | 15px | デジタル庁推奨 14–16px の範囲 |
| body line-height | 1.8 | デジタル庁推奨 1.7 以上 |
| letter-spacing | 0.02em | 日本語可読性向上（`palt` も併用） |

### 2.5 Spacing / Sizing

Tailwind のデフォルト 4px グリッド（`gap-2` = 8px、`p-4` = 16px）をそのまま採用。
デジタル庁の 8px 基本単位と整合。

### 2.6 Radius

| 用途 | 値 | Tailwind |
|---|---|---|
| 小（チップ・badge） | 4px | `rounded` |
| 標準（input・button） | 6–8px | `rounded-md` / `rounded-lg` |
| カード | 12px | `rounded-xl` |
| モーダル | 16px | `rounded-2xl` |

### 2.7 Elevation (Shadow)

| 用途 | 値 |
|---|---|
| カード（軽く浮く） | `shadow-[0_1px_4px_rgba(0,0,0,0.04)]` |
| 浮遊メニュー / Popover | `shadow-[0_4px_20px_rgba(0,0,0,0.15)]` |
| モーダル | `shadow-xl` |
| トースト | `shadow-[0_4px_16px_rgba(0,0,0,0.12)]` |

### 2.8 Motion (Animation)

| 用途 | 値 |
|---|---|
| トランジション標準 | `transition-colors duration-150` |
| ドロップダウン展開 | `@keyframes dropdownFadeIn` 0.15s |
| トースト | `@keyframes toastSlideIn / toastFadeOut` |
| Pulse（勤務中ドット） | `@keyframes dotPulse` 2s infinite |
| Punch 成功 | `@keyframes punchSuccessPop` 0.4s |

### 2.9 Legacy Alias

既存実装の className（`bg-primary`、`text-text-muted` 等）が動き続けるよう、`tailwind.css` 末尾でエイリアスを定義。新規実装ではセマンティック名（`bg-fill-primary`、`text-text-description` 等）の使用を推奨する。

---

## 3. Component カタログ

デジタル庁デザインシステム v3 のコンポーネント分類との対応表。Atomic Design（Atom / Molecule / Organism）の階層も併記。

### 3.1 Form (入力)

| デジタル庁 | ITAMIN 実装 | 階層 | 場所 |
|---|---|---|---|
| Text input | `Input` | Atom | `components/atoms/Input` |
| Label | `Label` | Atom | `components/atoms/Label` |
| Form field（Label + Input + Hint/Error） | `FormField` | Molecule | `components/molecules/FormField` |
| Select | （将来追加。現状は素の `<select>` + Tailwind） | — | — |
| Checkbox | （プロジェクト内で個別実装） | — | — |
| Radio | （プロジェクト内で個別実装） | — | — |

### 3.2 Action (操作)

| デジタル庁 | ITAMIN 実装 | 階層 | 備考 |
|---|---|---|---|
| Button (Primary) | `<Button variant="primary">` | Atom | brand blue |
| Button (Secondary) | `<Button variant="secondary">` | Atom | 白背景 + 枠 |
| Button (Tertiary / Ghost) | `<Button variant="ghost">` | Atom | 透明背景 |
| Button (Danger) | `<Button variant="danger">` | Atom | error fill |
| Button (Disabled) | `disabled` 属性 | Atom | opacity 50% |

### 3.3 Display (表示)

| デジタル庁 | ITAMIN 実装 | 階層 | 用途 |
|---|---|---|---|
| Tag / Badge | `Badge` | Atom | role / status 表示（11 variant） |
| Indicator dot | `StatusDot` | Atom | 勤怠ステータス、勤務中 pulse |
| Page title bar | `PageTitleBar` | Organism | ページ最上部 |
| Summary card | `SummaryCard` | Molecule | KPI 数値カード |
| Empty state | `EmptyState` | Molecule | リスト空時の案内 |

### 3.4 Notification (通知)

| デジタル庁 | ITAMIN 実装 | 階層 | 用途 |
|---|---|---|---|
| Inline error | `ErrorMessage` | Atom | フォーム単体エラー |
| Notice block (Alert) | `Alert` | Atom | success/error/info/warning 4 variant |
| Toast (Notification) | `Toast` + `ToastContainer` | Molecule | グローバル通知 |
| In-page toast | `InlineToast` | Molecule | ページ最上部固定の単発バナー |

### 3.5 Navigation (ナビゲーション)

| デジタル庁 | ITAMIN 実装 | 階層 | 用途 |
|---|---|---|---|
| Header | `Header` | Organism | ロゴ + 右側スロット |
| Sidebar (Side navigation) | `Sidebar` | Organism | カテゴリ別タブリスト |
| Tabs (Segmented) | `<Tabs variant="segmented">` | Molecule | 旧 view-mode-tab |
| Tabs (Underline) | `<Tabs variant="underline">` | Molecule | 旧 attendance-*-tabs |
| Profile dropdown | `ProfileDropdown` | Organism | 右上ユーザーメニュー |
| Mobile card menu | `MobileCardMenu` | Organism | モバイル時の 2 列カード |
| Month navigation | `MonthNavigation` | Molecule | 前月 / ラベル / 翌月 |

### 3.6 Container (容器)

| デジタル庁 | ITAMIN 実装 | 階層 | 用途 |
|---|---|---|---|
| Card | `Card` | Molecule | 汎用コンテナ |
| Modal (Dialog) | `Modal` | Molecule | overlay + body + actions |
| Loading | `Loading` | Atom | スピナー + メッセージ |

### 3.7 Domain Specific (業務固有)

デジタル庁の汎用カタログには含まれない、ITAMIN 業務固有コンポーネント。

| 名称 | 階層 | 説明 |
|---|---|---|
| `BreakMinutesField` | Molecule | 数値入力 + 「分」 + プリセットチップ |
| `ChecklistGate` | Organism | 打刻前チェックリスト強制モーダル |
| `TimePicker15` | Organism | 15 分刻みの時刻 select |
| `PunchRouteHint` | Organism | LINE/NFC 打刻ルート案内バナー |

---

## 4. アクセシビリティ規約

### 4.1 コントラスト

| 対象 | 最小コントラスト比 |
|---|---|
| 通常テキスト（< 18pt） | 4.5 : 1 |
| 大きいテキスト（≥ 18pt） | 3 : 1 |
| UI 要素（ボタン枠など） | 3 : 1 |

`tailwind.css` のセマンティックトークンは上記を満たすよう調整済み。
新規組み合わせを追加する際は WebAIM Contrast Checker 等で検証する。

### 4.2 フォーカス

```css
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
```

`Button` Atom も `focus-visible:outline-primary` を持つ。
キーボード操作で移動した時のみリングが見える（マウスでは表示されない）。

### 4.3 タップターゲット

- 最小 44 × 44px（デジタル庁推奨）。
- `Button size="md"` は h-10 (40px) だが、`size="lg"` は 48px。モバイル主要 CTA は `lg` を推奨。

### 4.4 セマンティック HTML

- 見出し階層は h1 → h2 → h3 を飛ばさない。
- ボタン要素は `<button type="button">` 既定（form 内 submit のみ `type="submit"`）。
- アイコンのみのボタンには `aria-label` を必須。
- アラートには `role="alert"`、ステータスには `role="status"`。

---

## 5. 命名規則

### 5.1 ファイル / ディレクトリ

```
src/
├── styles/
│   └── tailwind.css      ← @theme tokens
├── lib/
│   └── cn.ts             ← className 合成 helper
└── components/
    ├── atoms/<Name>/
    │   ├── <Name>.tsx
    │   └── index.ts      ← named export
    ├── molecules/<Name>/
    └── organisms/<Name>/
```

### 5.2 props 命名

- バリアントは `variant`（discriminated union）。
- サイズは `size: 'sm' | 'md' | 'lg'`。
- 子要素挿入は `children` または render slot。
- カスタム class は `className` で受け取り `cn()` で合成。

### 5.3 CSS class 命名（Tailwind 内）

新規実装は以下を優先:

| 良い | 避ける |
|---|---|
| `text-text-body` | `text-[#1a1a1a]`（ハードコード） |
| `bg-fill-primary` | `bg-blue-700`（primitive 直参照） |
| `border-border-divider` | `border-sumi-200` |

---

## 6. 既存実装からの差分

### 6.1 達成済み

- styles.css: **3,304 → 294 行**（91% 削減）
- 26 components（Atom 8 / Molecule 10 / Organism 8）
- 28 ページのほぼ全スタイルを Tailwind ユーティリティ化
- Tailwind v4 + `@theme` で token 一元化

### 6.2 残課題

| 項目 | 優先度 | 内容 |
|---|---|---|
| Select Atom | 中 | `<select>` の Tailwind 統一が散在中。Atom 化推奨 |
| Checkbox/Radio Atom | 中 | 現状 native input。視覚カスタムが必要なら Atom 化 |
| 残存 CSS（shift-table 系） | 低 | 3 ページで共有のテーブル構造、105 行程度 |
| デジタル庁 primitive 値の完全採用 | 低 | 現状はブランド色（#2563eb 系）を保持。完全準拠なら `--color-blue-700: #0017c1` への置換も検討 |
| Storybook 等のドキュメント生成 | 低 | コンポーネントカタログを自動生成できると保守が楽 |

### 6.3 移行ガイド

新規実装する際の推奨パターン:

```tsx
// ❌ 避ける: ハードコード
<div className="bg-[#2563eb] text-white">...</div>

// ⚠ 互換: 既存エイリアス
<div className="bg-primary text-white">...</div>

// ✅ 推奨: デジタル庁準拠セマンティック
<div className="bg-fill-primary text-text-on-fill">...</div>
```
