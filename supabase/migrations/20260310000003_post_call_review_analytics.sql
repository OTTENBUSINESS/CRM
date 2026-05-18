-- Post-Call Review: novos campos para outcome do closer + analytics de perfil

-- call_history: registrar outcome do closer
ALTER TABLE call_history
  ADD COLUMN IF NOT EXISTS call_outcome text
    CHECK (call_outcome IN ('schedule_partner_call', 'schedule_payment', 'lost')),
  ADD COLUMN IF NOT EXISTS call_outcome_details jsonb DEFAULT NULL;

-- leads: campos de perfil para analytics (preenchidos pela IA)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS revenue_range text,
  ADD COLUMN IF NOT EXISTS is_icp boolean DEFAULT NULL;

-- RPC: get_call_analytics
CREATE OR REPLACE FUNCTION get_call_analytics(
  p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_date_to date DEFAULT CURRENT_DATE,
  p_team_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_calls', (
      SELECT COUNT(*) FROM call_history ch
      WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
        AND ch.status = 'completed'
        AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
    ),
    'by_outcome', (
      SELECT COALESCE(jsonb_object_agg(outcome, cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(ch.call_outcome, 'no_action') AS outcome, COUNT(*) AS cnt
        FROM call_history ch
        WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
          AND ch.status = 'completed'
          AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
        GROUP BY COALESCE(ch.call_outcome, 'no_action')
      ) sub
    ),
    'by_gender', (
      SELECT COALESCE(jsonb_object_agg(gender_val, cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(l.gender, 'desconhecido') AS gender_val, COUNT(*) AS cnt
        FROM call_history ch
        JOIN leads l ON l.id = ch.lead_id
        WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
          AND ch.status = 'completed'
          AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
        GROUP BY COALESCE(l.gender, 'desconhecido')
      ) sub
    ),
    'by_business_type', (
      SELECT COALESCE(jsonb_object_agg(btype, cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(l.business_type, 'desconhecido') AS btype, COUNT(*) AS cnt
        FROM call_history ch
        JOIN leads l ON l.id = ch.lead_id
        WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
          AND ch.status = 'completed'
          AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
        GROUP BY COALESCE(l.business_type, 'desconhecido')
      ) sub
    ),
    'by_revenue_range', (
      SELECT COALESCE(jsonb_object_agg(rrange, cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(l.revenue_range, 'desconhecido') AS rrange, COUNT(*) AS cnt
        FROM call_history ch
        JOIN leads l ON l.id = ch.lead_id
        WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
          AND ch.status = 'completed'
          AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
        GROUP BY COALESCE(l.revenue_range, 'desconhecido')
      ) sub
    ),
    'icp_rate', (
      SELECT COALESCE(
        ROUND(
          COUNT(*) FILTER (WHERE l.is_icp = true)::numeric /
          NULLIF(COUNT(*) FILTER (WHERE l.is_icp IS NOT NULL), 0)::numeric * 100
        , 1)
      , 0)
      FROM call_history ch
      JOIN leads l ON l.id = ch.lead_id
      WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
        AND ch.status = 'completed'
        AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
    ),
    'conversion_by_outcome', (
      SELECT COALESCE(jsonb_object_agg(outcome, conversion_rate), '{}'::jsonb)
      FROM (
        SELECT
          COALESCE(ch.call_outcome, 'no_action') AS outcome,
          ROUND(
            COUNT(*) FILTER (WHERE d.status = 'won')::numeric /
            NULLIF(COUNT(*), 0)::numeric * 100
          , 1) AS conversion_rate
        FROM call_history ch
        LEFT JOIN deals d ON d.lead_id = ch.lead_id
        WHERE ch.started_at::date BETWEEN p_date_from AND p_date_to
          AND ch.status = 'completed'
          AND (p_team_member_id IS NULL OR ch.team_member_id = p_team_member_id)
        GROUP BY COALESCE(ch.call_outcome, 'no_action')
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;
