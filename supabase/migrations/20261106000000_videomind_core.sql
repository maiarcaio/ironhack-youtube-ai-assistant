
-- VideoMind AI
-- Initial PostgreSQL schema
-- Data access: authenticated reads, backend-managed writes

-- 1. Videos and processing status

CREATE TABLE public.videos (
    video_id TEXT PRIMARY KEY
        CHECK (length(video_id) BETWEEN 1 AND 128),

    owner_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    title TEXT NOT NULL DEFAULT 'Untitled video',

    source_type TEXT NOT NULL
        CHECK (source_type IN ('youtube', 'upload')),

    source_url TEXT,
    youtube_video_id TEXT,

    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'processing',
                'completed',
                'failed'
            )
        ),

    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (video_id, owner_id)
);


-- 2. Cached transcripts

CREATE TABLE public.transcripts (
    video_id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL,

    content TEXT NOT NULL
        CHECK (
            length(content) > 0
            AND octet_length(content) <= 2097152
        ),

    format TEXT NOT NULL
        CHECK (format IN ('txt', 'srt', 'vtt')),

    source TEXT NOT NULL
        CHECK (source IN ('youtube', 'upload')),

    language TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (video_id, owner_id)
        REFERENCES public.videos(video_id, owner_id)
        ON DELETE CASCADE
);


-- 3. Background ingestion jobs

CREATE TABLE public.ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'processing',
                'completed',
                'failed'
            )
        ),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    last_error TEXT,

    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (video_id, owner_id)
        REFERENCES public.videos(video_id, owner_id)
        ON DELETE CASCADE
);


-- 4. Conversation threads

CREATE TABLE public.chat_threads (
    id TEXT PRIMARY KEY
        DEFAULT (gen_random_uuid()::text),

    owner_id UUID NOT NULL,

    video_id TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (id, owner_id),

    FOREIGN KEY (video_id, owner_id)
        REFERENCES public.videos(video_id, owner_id)
        ON DELETE CASCADE
);


-- 5. Chat message history

CREATE TABLE public.chat_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    thread_id TEXT NOT NULL,
    owner_id UUID NOT NULL,

    role TEXT NOT NULL
        CHECK (role IN ('user', 'assistant')),

    content TEXT NOT NULL
        CHECK (length(content) > 0),

    sources JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(sources) = 'array'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (thread_id, owner_id)
        REFERENCES public.chat_threads(id, owner_id)
        ON DELETE CASCADE
);


-- 6. Performance indexes

CREATE INDEX videos_owner_created_idx
    ON public.videos(owner_id, created_at DESC);

CREATE INDEX transcripts_owner_idx
    ON public.transcripts(owner_id);

CREATE INDEX jobs_owner_idx
    ON public.ingestion_jobs(owner_id);

CREATE INDEX jobs_queue_idx
    ON public.ingestion_jobs(status, available_at);

CREATE INDEX threads_owner_created_idx
    ON public.chat_threads(owner_id, created_at DESC);

CREATE INDEX messages_owner_idx
    ON public.chat_messages(owner_id);

CREATE INDEX messages_thread_created_idx
    ON public.chat_messages(thread_id, created_at);


-- 7. Enable Row Level Security

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;


-- 8. Database access permissions
-- Authenticated users may read their own records.
-- All writes are reserved for the authorized backend.

REVOKE ALL ON TABLE
    public.videos,
    public.transcripts,
    public.ingestion_jobs,
    public.chat_threads,
    public.chat_messages
FROM anon, authenticated;

GRANT SELECT ON TABLE
    public.videos,
    public.transcripts,
    public.ingestion_jobs,
    public.chat_threads,
    public.chat_messages
TO authenticated;


-- 9. Owner-scoped SELECT policies

CREATE POLICY videos_select_own
ON public.videos
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY transcripts_select_own
ON public.transcripts
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY jobs_select_own
ON public.ingestion_jobs
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY threads_select_own
ON public.chat_threads
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY messages_select_own
ON public.chat_messages
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);
