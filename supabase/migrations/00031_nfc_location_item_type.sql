-- 00031_nfc_location_item_type.sql
-- Add nfc_location to item_type CHECK constraints for NFC cleaning integration

ALTER TABLE checklist_template_items
  DROP CONSTRAINT checklist_template_items_item_type_check;
ALTER TABLE checklist_template_items
  ADD CONSTRAINT checklist_template_items_item_type_check
  CHECK (item_type IN ('checkbox','numeric','text','photo','select','nfc_location'));

ALTER TABLE checklist_system_template_items
  DROP CONSTRAINT checklist_system_template_items_item_type_check;
ALTER TABLE checklist_system_template_items
  ADD CONSTRAINT checklist_system_template_items_item_type_check
  CHECK (item_type IN ('checkbox','numeric','text','photo','select','nfc_location'));
