-- Non-destructive VideoMind library management.
-- Archive is reversible; delete is logical only (no physical data deletion).
ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS videos_owner_library_idx
    ON public.videos(owner_id, created_at DESC)
    WHERE deleted_at IS NULL;
