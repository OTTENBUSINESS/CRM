-- Migration: Add transcriptions column to call_history
-- Description: Adds JSONB column to store real-time transcription data from calls

-- Add transcriptions column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'call_history'
        AND column_name = 'transcriptions'
    ) THEN
        ALTER TABLE call_history
        ADD COLUMN transcriptions JSONB DEFAULT '[]'::jsonb;

        -- Add comment for documentation
        COMMENT ON COLUMN call_history.transcriptions IS 'Array of transcription segments captured during the call. Each segment contains: id, text, speaker, speakerType (local/remote), confidence, timestamp, is_final';
    END IF;
END $$;

-- Create index for faster querying of calls with transcriptions
CREATE INDEX IF NOT EXISTS idx_call_history_has_transcriptions
ON call_history ((transcriptions IS NOT NULL AND transcriptions != '[]'::jsonb));
