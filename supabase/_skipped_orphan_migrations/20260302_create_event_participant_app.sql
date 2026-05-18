-- =============================================
-- EVENT PARTICIPANT APP - 8 novas tabelas
-- =============================================

-- 1. Sessoes de participantes
CREATE TABLE IF NOT EXISTS cs_event_participant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participant_sessions_token ON cs_event_participant_sessions(token);
CREATE INDEX idx_participant_sessions_event ON cs_event_participant_sessions(event_id);
CREATE INDEX idx_participant_sessions_rsvp ON cs_event_participant_sessions(rsvp_id);

-- 2. Perfis estendidos dos participantes
CREATE TABLE IF NOT EXISTS cs_event_participant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  display_name VARCHAR(200) NOT NULL,
  company VARCHAR(200),
  job_title VARCHAR(200),
  bio TEXT,
  avatar_url VARCHAR(500),
  skills TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  linkedin_url VARCHAR(500),
  show_email BOOLEAN DEFAULT false,
  show_phone BOOLEAN DEFAULT false,
  show_linkedin BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rsvp_id, event_id)
);

CREATE INDEX idx_participant_profiles_event ON cs_event_participant_profiles(event_id);
CREATE INDEX idx_participant_profiles_rsvp ON cs_event_participant_profiles(rsvp_id);

-- 3. Posts do feed
CREATE TABLE IF NOT EXISTS cs_event_feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  author_name VARCHAR(200) NOT NULL,
  author_avatar_url VARCHAR(500),
  content TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_posts_event ON cs_event_feed_posts(event_id);
CREATE INDEX idx_feed_posts_pinned ON cs_event_feed_posts(event_id, is_pinned DESC, created_at DESC);

-- 4. Curtidas nos posts
CREATE TABLE IF NOT EXISTS cs_event_feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES cs_event_feed_posts(id) ON DELETE CASCADE,
  rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, rsvp_id)
);

CREATE INDEX idx_feed_likes_post ON cs_event_feed_likes(post_id);
CREATE INDEX idx_feed_likes_rsvp ON cs_event_feed_likes(rsvp_id);

-- 5. Itens do cronograma
CREATE TABLE IF NOT EXISTS cs_event_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  speaker_name VARCHAR(200),
  speaker_title VARCHAR(200),
  speaker_avatar_url VARCHAR(500),
  room VARCHAR(100),
  day_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  category VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_items_event ON cs_event_schedule_items(event_id);
CREATE INDEX idx_schedule_items_day ON cs_event_schedule_items(event_id, day_date, start_time);

-- 6. Sessoes favoritadas
CREATE TABLE IF NOT EXISTS cs_event_schedule_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_item_id UUID NOT NULL REFERENCES cs_event_schedule_items(id) ON DELETE CASCADE,
  rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_item_id, rsvp_id)
);

CREATE INDEX idx_schedule_bookmarks_item ON cs_event_schedule_bookmarks(schedule_item_id);
CREATE INDEX idx_schedule_bookmarks_rsvp ON cs_event_schedule_bookmarks(rsvp_id);

-- 7. Materiais
CREATE TABLE IF NOT EXISTS cs_event_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  schedule_item_id UUID REFERENCES cs_event_schedule_items(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  file_url VARCHAR(1000) NOT NULL,
  file_type VARCHAR(50),
  file_size BIGINT,
  category VARCHAR(100),
  available_after TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materials_event ON cs_event_materials(event_id);
CREATE INDEX idx_materials_schedule ON cs_event_materials(schedule_item_id);

-- 8. Conexoes de networking
CREATE TABLE IF NOT EXISTS cs_event_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,
  requester_rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  target_rsvp_id UUID NOT NULL REFERENCES cs_event_rsvps(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, requester_rsvp_id, target_rsvp_id),
  CHECK (requester_rsvp_id != target_rsvp_id)
);

CREATE INDEX idx_connections_event ON cs_event_connections(event_id);
CREATE INDEX idx_connections_requester ON cs_event_connections(requester_rsvp_id);
CREATE INDEX idx_connections_target ON cs_event_connections(target_rsvp_id);

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE cs_event_participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_participant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_schedule_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_connections ENABLE ROW LEVEL SECURITY;

-- Sessions: service_role manages, anon can read own
CREATE POLICY "sessions_anon_select" ON cs_event_participant_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "sessions_auth_all" ON cs_event_participant_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sessions_service_all" ON cs_event_participant_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Profiles: anyone can read within event, service_role manages
CREATE POLICY "profiles_select_all" ON cs_event_participant_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_auth_all" ON cs_event_participant_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "profiles_service_all" ON cs_event_participant_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "profiles_anon_insert" ON cs_event_participant_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "profiles_anon_update" ON cs_event_participant_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Feed posts: anyone can read, authenticated/service can manage
CREATE POLICY "feed_posts_select_all" ON cs_event_feed_posts FOR SELECT USING (true);
CREATE POLICY "feed_posts_auth_all" ON cs_event_feed_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "feed_posts_service_all" ON cs_event_feed_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Feed likes: anyone can read, anon can insert/delete (via edge function)
CREATE POLICY "feed_likes_select_all" ON cs_event_feed_likes FOR SELECT USING (true);
CREATE POLICY "feed_likes_anon_insert" ON cs_event_feed_likes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "feed_likes_anon_delete" ON cs_event_feed_likes FOR DELETE TO anon USING (true);
CREATE POLICY "feed_likes_auth_all" ON cs_event_feed_likes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "feed_likes_service_all" ON cs_event_feed_likes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Schedule items: anyone can read, authenticated/service can manage
CREATE POLICY "schedule_items_select_all" ON cs_event_schedule_items FOR SELECT USING (true);
CREATE POLICY "schedule_items_auth_all" ON cs_event_schedule_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "schedule_items_service_all" ON cs_event_schedule_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Schedule bookmarks: anyone can read, anon can insert/delete
CREATE POLICY "schedule_bookmarks_select_all" ON cs_event_schedule_bookmarks FOR SELECT USING (true);
CREATE POLICY "schedule_bookmarks_anon_insert" ON cs_event_schedule_bookmarks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "schedule_bookmarks_anon_delete" ON cs_event_schedule_bookmarks FOR DELETE TO anon USING (true);
CREATE POLICY "schedule_bookmarks_auth_all" ON cs_event_schedule_bookmarks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "schedule_bookmarks_service_all" ON cs_event_schedule_bookmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Materials: anyone can read, authenticated/service can manage
CREATE POLICY "materials_select_all" ON cs_event_materials FOR SELECT USING (true);
CREATE POLICY "materials_auth_all" ON cs_event_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "materials_service_all" ON cs_event_materials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Connections: anyone can read within event, anon can insert/update
CREATE POLICY "connections_select_all" ON cs_event_connections FOR SELECT USING (true);
CREATE POLICY "connections_anon_insert" ON cs_event_connections FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "connections_anon_update" ON cs_event_connections FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "connections_auth_all" ON cs_event_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "connections_service_all" ON cs_event_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Triggers para updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_participant_profiles
  BEFORE UPDATE ON cs_event_participant_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_feed_posts
  BEFORE UPDATE ON cs_event_feed_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_schedule_items
  BEFORE UPDATE ON cs_event_schedule_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_materials
  BEFORE UPDATE ON cs_event_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_connections
  BEFORE UPDATE ON cs_event_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Enable realtime for feed posts
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE cs_event_feed_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE cs_event_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE cs_event_schedule_items;
