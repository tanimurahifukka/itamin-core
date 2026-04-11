-- 00030_haccp_grooming_template.sql
-- 個人・出社時の身だしなみ確認 システムテンプレートを追加
--
-- 既存の「出勤前健康・衛生確認」(11000001-...-0001) は健康チェック中心で
-- uniform_check 1項目しか身だしなみに触れていない。外食営業の HACCP 実務上
-- 身だしなみは毛髪・爪・装飾品など独立した複数観点を持つため、専用テンプレ
-- として切り出す。店舗は POST /api/haccp/:storeId/templates/from-system で
-- 取り込める。
--
-- checklist_system_template_items には (system_template_id, item_key) の
-- UNIQUE 制約が無いため、冪等性は WHERE NOT EXISTS で担保する。

INSERT INTO checklist_system_templates
  (id, business_type, name, timing, scope, layer, description, sort_order)
VALUES
  ('11000001-0000-0000-0000-000000000007', 'cafe', '出社時の身だしなみ確認', 'clock_in', 'personal', 'base', '出社時にスタッフ個人が行う身だしなみチェック（毛髪・爪・装飾品・制服等）', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO checklist_system_template_items
  (system_template_id, item_key, label, item_type, required,
   min_value, max_value, unit, is_ccp, tracking_mode, deviation_action, sort_order)
SELECT
  v.system_template_id::uuid, v.item_key, v.label, v.item_type, v.required,
  v.min_value, v.max_value, v.unit, v.is_ccp, v.tracking_mode, v.deviation_action, v.sort_order
FROM (VALUES
  ('11000001-0000-0000-0000-000000000007','uniform_clean',      '制服・エプロン・帽子が清潔で破損していない',                         'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '汚れ・破損がある場合は着替え、管理者に報告',                 1),
  ('11000001-0000-0000-0000-000000000007','hair_covered',       '髪を帽子またはヘアネットに完全に収めた（前髪・後れ毛なし）',         'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '髪がはみ出している場合は結び直し・被り直し',                 2),
  ('11000001-0000-0000-0000-000000000007','nails_trimmed',      '爪を短く切り、マニキュア・付け爪をしていない',                       'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '爪切り・マニキュア除去後に再確認',                           3),
  ('11000001-0000-0000-0000-000000000007','no_accessories',     '指輪・時計・ブレスレット・ピアス等のアクセサリーを外した',           'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '着用が発覚した場合は即座に外す',                             4),
  ('11000001-0000-0000-0000-000000000007','hands_wound_free',   '手指に傷・ささくれがない（ある場合は防水絆創膏＋手袋で完全被覆）',   'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '被覆不十分な傷がある場合は管理者に報告・非調理業務へ配置換え', 5),
  ('11000001-0000-0000-0000-000000000007','shoes_clean',        '規定の清潔で滑りにくい靴を履いている',                               'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '不適切な靴の場合は履き替え',                                 6),
  ('11000001-0000-0000-0000-000000000007','name_tag',           '名札を所定位置に着用している',                                       'checkbox', false, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', NULL,                                                          7),
  ('11000001-0000-0000-0000-000000000007','no_strong_scent',    '香水・強い整髪料・タバコ臭がない',                                   'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '匂いが強い場合は洗い流し・時間をおいて再確認',               8),
  ('11000001-0000-0000-0000-000000000007','beard_trimmed',      '髭を整えている（該当者のみ／不要な場合はチェック）',                 'checkbox', false, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', NULL,                                                          9),
  ('11000001-0000-0000-0000-000000000007','makeup_appropriate', '化粧・ネイル等が業務に適切である',                                   'checkbox', false, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', NULL,                                                         10),
  ('11000001-0000-0000-0000-000000000007','hand_wash_done',     '出社後の手洗い・手指消毒を実施した',                                 'checkbox', true, NULL::numeric, NULL::numeric, NULL::text, false, 'submission_only', '未実施の場合は即実施',                                       11)
) AS v(system_template_id, item_key, label, item_type, required, min_value, max_value, unit, is_ccp, tracking_mode, deviation_action, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM checklist_system_template_items i
  WHERE i.system_template_id = v.system_template_id::uuid
    AND i.item_key = v.item_key
);
