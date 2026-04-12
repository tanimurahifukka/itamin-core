-- 00032_grooming_items_required.sql
-- 身だしなみテンプレートの名札・髭・化粧を required = true に変更
-- required=false だと ChecklistGate で自動完了扱いになりチェック不要になっていた

UPDATE checklist_system_template_items
   SET required = true
 WHERE system_template_id = '11000001-0000-0000-0000-000000000007'
   AND item_key IN ('name_tag', 'beard_trimmed', 'makeup_appropriate');

-- 既に店舗に取り込み済みのテンプレートアイテムも更新
UPDATE checklist_template_items ti
   SET required = true
  FROM checklist_templates t
 WHERE ti.template_id = t.id
   AND ti.item_key IN ('name_tag', 'beard_trimmed', 'makeup_appropriate')
   AND ti.required = false;
