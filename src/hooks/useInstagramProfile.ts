import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface InstagramProfile {
  id: string;
  username: string;
  full_name: string;
  biography: string;
  external_url: string | null;
  profile_data: {
    isPrivate: boolean;
    isVerified: boolean;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    profilePicUrlHD: string;
    profilePictureUrl: string;
    storedProfilePictureUrl: string;
  };
  latest_posts: any[];
  profile_picture_url_hd: string;
  stored_profile_picture_url: string;
  is_verified: boolean;
  is_private: boolean;
  follower_count: number;
  following_count: number;
  media_count: number;
  created_at: string;
  updated_at: string;
  last_scraped_at: string;
}

export interface InstagramPost {
  id: string;
  post_id: string;
  code: string;
  media_type: number;
  thumbnail_url: string;
  stored_thumbnail_url: string;
  caption: string;
  like_count: number;
  comment_count: number;
  play_count: number;
  taken_at: string;
}

export interface InstagramStory {
  id: string;
  story_id: string;
  media_type: number;
  media_url: string;
  stored_media_url: string;
  thumbnail_url: string;
  stored_thumbnail_url: string;
  taken_at: string;
  expires_at: string;
  has_audio: boolean;
  ai_description: string | null;
}

export const useInstagramProfile = (profileId: string | undefined) => {
  return useQuery({
    queryKey: ['instagram-profile', profileId],
    queryFn: async () => {
      if (!profileId) return null;
      
      const { data, error } = await supabase
        .from('instagram_profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (error) throw error;
      return data as InstagramProfile;
    },
    enabled: !!profileId,
  });
};

export const useInstagramPosts = (profileId: string | undefined) => {
  return useQuery({
    queryKey: ['instagram-posts', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const { data, error } = await supabase
        .from('instagram_feed_posts')
        .select('*')
        .eq('instagram_profile_id', profileId)
        .order('taken_at', { ascending: false })
        .limit(12);

      if (error) throw error;
      return (data || []) as InstagramPost[];
    },
    enabled: !!profileId,
  });
};

export const useInstagramStories = (profileId: string | undefined) => {
  return useQuery({
    queryKey: ['instagram-stories', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const { data, error } = await supabase
        .from('instagram_stories')
        .select('*')
        .eq('instagram_profile_id', profileId)
        .order('taken_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as InstagramStory[];
    },
    enabled: !!profileId,
  });
};
