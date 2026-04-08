# ITAMIN 追加プラグイン提案 追補

作成日: 2026-04-02

## 結論

最優先で追加すべきなのは、**売上証跡取込（sales_capture）** です。

理由は3つです。

1. 現行仕様では売上が `daily_reports.sales` の手入力に寄っている。
2. 従業員が営業後にレシート画像を上げる運用と相性が良い。
3. ここを起点に、売上×人件費、締め差異、予測、POS連携まで横展開できる。

---

## 優先順位

### 1. 売上証跡取込 (`sales_capture`)

**目的**
- 従業員が営業後にレシート画像/PDFをアップロードし、OCRで売上を構造化して記録する。

**推奨する入力単位**
- 1会計ごとの客レシートではなく、**営業終了時の締めレシート / 精算票 / 日次売上票** を第一候補にする。
- これにより、日報・現金締め・人件費分析と自然につながる。

**MVPフロー**
1. スタッフが営業日を選ぶ
2. レシート画像またはPDFをアップロード
3. OCRで以下を抽出
   - 営業日
   - 端末/レジ名
   - 総売上 / 純売上
   - 税額
   - 値引き
   - 返品/取消
   - 現金 / カード / QR 等の支払別売上
   - レシート件数
4. 抽出結果を確認画面で手修正
5. 管理者が承認すると売上確定
6. `daily_reports` に売上を反映

**権限設計**
- upload: full_time / part_time / leader / manager
- confirm / approve: leader / manager / owner

**重要な仕様**
- `business_date` を持つ（深夜営業対策）
- 元画像を保存する
- OCR生データ JSON を保存する
- confidence を保存する
- 重複検知を入れる
- 低信頼時は自動確定しない

---

### 2. 締め差異・現金過不足 (`cash_close`)

**目的**
- OCRやPOS連携で得た expected cash と、実数カウントした counted cash を突合する。

**主な項目**
- expected_cash
- counted_cash
- over_short
- close_note
- counted_by
- approved_by

**相性が良い理由**
- 売上証跡取込の次に自然に必要になる。
- 店舗の「締め作業」をアプリ内で完結できる。

---

### 3. 売上×人件費 (`labor_vs_sales`)

**目的**
- 勤怠と売上を結合し、日別・時間帯別の labor % を見える化する。

**見るべき指標**
- 売上
- 人件費
- labor %
- 1時間ごとの売上 / 人件費
- シフト作成時の予算超過

**活用先**
- 残業抑制
- 過剰配置の削減
- 忙しい時間帯への再配置

---

### 4. POS連携 (`pos_connector`)

**目的**
- Airレジ / スマレジ などから売上・締め情報を直接同期する。

**位置付け**
- OCRは導入障壁が低い入口。
- POS連携は長期的な本命。
- 店舗ごとに「OCRのみ / OCR+POS / POSのみ」を選べる設計にする。

---

### 5. 売上予測 (`sales_forecast`)

**目的**
- 過去の売上データから日別/曜日別の売上予測を出し、シフト作成に反映する。

**初期ロジック**
- 直近2〜8週間の曜日別平均
- 雨天・祝日補正
- 店舗イベント補正

**将来拡張**
- MLベース予測
- 時間帯別予測
- 発注量提案

---

## 仕様に入れるべきデータモデル変更

### 新規テーブル案

```sql
sales_receipts (
  id UUID PK,
  store_id UUID NOT NULL,
  business_date DATE NOT NULL,
  source_type TEXT NOT NULL,          -- close_receipt | settlement_slip | other
  source_vendor TEXT,                 -- airregi | smaregi | square | unknown
  file_path TEXT NOT NULL,
  raw_ocr_json JSONB DEFAULT '{}'::jsonb,
  parsed_summary JSONB DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  status TEXT NOT NULL,               -- uploaded | parsed | needs_review | confirmed | rejected
  duplicate_of UUID,
  uploaded_by UUID NOT NULL,
  reviewed_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

sales_closes (
  id UUID PK,
  store_id UUID NOT NULL,
  business_date DATE NOT NULL,
  register_code TEXT,
  gross_sales INTEGER DEFAULT 0,
  net_sales INTEGER DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  cash_sales INTEGER DEFAULT 0,
  card_sales INTEGER DEFAULT 0,
  qr_sales INTEGER DEFAULT 0,
  other_sales INTEGER DEFAULT 0,
  receipt_count INTEGER DEFAULT 0,
  source_receipt_id UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

cash_close_records (
  id UUID PK,
  store_id UUID NOT NULL,
  business_date DATE NOT NULL,
  expected_cash INTEGER DEFAULT 0,
  counted_cash INTEGER DEFAULT 0,
  over_short INTEGER GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  note TEXT,
  counted_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API案

```http
POST   /api/sales-capture/:storeId/uploads
POST   /api/sales-capture/:storeId/receipts
POST   /api/sales-capture/:storeId/receipts/:id/parse
PUT    /api/sales-capture/:storeId/receipts/:id/confirm
GET    /api/sales-capture/:storeId/business-date/:date
POST   /api/sales-capture/:storeId/business-date/:date/approve

POST   /api/cash-close/:storeId/:businessDate/count
GET    /api/cash-close/:storeId/:businessDate

GET    /api/labor-vs-sales/:storeId/daily?from=&to=
GET    /api/labor-vs-sales/:storeId/hourly?date=
```

---

## 既存仕様で変えるべき点

1. `daily_reports.sales` を売上の唯一の真実の源泉にしない
2. `daily_reports` はメモ/天気/客数/所感の編集レイヤーに寄せる
3. 売上の証跡は `sales_receipts` に、確定値は `sales_closes` に分ける
4. 日次単位だけでなく `business_date` を導入する
5. 画像保存と再解析を前提に raw JSON を残す

---

## 実装順

### Phase 1
- 売上証跡取込
- OCR
- 手修正
- 承認
- daily_reports 反映

### Phase 2
- 締め差異
- 現金過不足
- 売上×人件費

### Phase 3
- POS連携
- 売上予測
- 発注提案

---

## リサーチの示唆

- 領収書OCR系は、Azure Document Intelligence、AWS Textract、Google Document AI のような構造化抽出系が使える。
- 国内POSは、Airレジやスマレジのように外部システム連携と売上/締め情報の取得余地がある。
- 海外の店舗運営SaaSでは、売上と人件費を結びつけてシフト最適化する流れが一般化している。

---

## 一言でいうと

**この要件を入れるなら、ITAMIN は「日報アプリ」から「売上証跡を起点に現場運営を締めまで閉じるアプリ」に進化できる。**
