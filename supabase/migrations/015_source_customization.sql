-- Migration 015: Per-source color + label customization
--
-- Each source calendar can carry its own display config that governs how
-- mirrored blocks appear on the OTHER calendars. When calendar A is the
-- source and mirrors to B and C, the block written on B and C uses A's
-- mirror_color_id + mirror_label — so a user glancing at their work
-- calendar can distinguish "block from personal" vs "block from side project".
--
-- Defaults preserve today's behavior: gray "Busy" block. Existing rows get
-- these defaults on backfill, so no user sees a change until they customize.
--
-- mirror_color_id follows Google Calendar's event color palette (1-11).
--   1  Lavender    2  Sage       3  Grape      4  Flamingo
--   5  Banana      6  Tangerine  7  Peacock    8  Graphite (default)
--   9  Blueberry  10  Basil     11  Tomato

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS mirror_color_id TEXT NOT NULL DEFAULT '8';

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS mirror_label TEXT NOT NULL DEFAULT 'Busy';

-- Guardrails on the label: keep it short so Google Calendar doesn't reject it,
-- and prevent obviously-broken inputs. UI enforces the same cap.
ALTER TABLE user_accounts
  ADD CONSTRAINT mirror_label_length CHECK (char_length(mirror_label) BETWEEN 1 AND 60);

ALTER TABLE user_accounts
  ADD CONSTRAINT mirror_color_id_valid CHECK (mirror_color_id IN ('1','2','3','4','5','6','7','8','9','10','11'));
