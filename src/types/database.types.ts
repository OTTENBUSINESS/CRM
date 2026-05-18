export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          access_token: string
          account_id: string
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          name: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          account_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          account_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ad_campaign_metrics: {
        Row: {
          account_id: string | null
          campaign_id: string
          clicks: number | null
          cpc: number | null
          cpl: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          leads: number | null
          purchases: number | null
          reach: number | null
          roas: number | null
          spend: number | null
        }
        Insert: {
          account_id?: string | null
          campaign_id: string
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
        }
        Update: {
          account_id?: string | null
          campaign_id?: string
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          account_id: string | null
          campaign_id: string
          clicks: number | null
          cpl: number | null
          created_at: string | null
          ctr: number | null
          daily_budget: number | null
          id: string
          impressions: number | null
          last_sync_at: string | null
          leads: number | null
          lifetime_budget: number | null
          name: string
          objective: string | null
          purchases: number | null
          reach: number | null
          roas: number | null
          spend: number | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          campaign_id: string
          clicks?: number | null
          cpl?: number | null
          created_at?: string | null
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          leads?: number | null
          lifetime_budget?: number | null
          name: string
          objective?: string | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          campaign_id?: string
          clicks?: number | null
          cpl?: number | null
          created_at?: string | null
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_sync_at?: string | null
          leads?: number | null
          lifetime_budget?: number | null
          name?: string
          objective?: string | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creative_metrics: {
        Row: {
          account_id: string | null
          ad_id: string
          campaign_id: string | null
          clicks: number | null
          cpc: number | null
          cpl: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          leads: number | null
          purchases: number | null
          reach: number | null
          roas: number | null
          spend: number | null
          video_views: number | null
          video_views_p100: number | null
          video_views_p25: number | null
          video_views_p50: number | null
          video_views_p75: number | null
        }
        Insert: {
          account_id?: string | null
          ad_id: string
          campaign_id?: string | null
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          video_views?: number | null
          video_views_p100?: number | null
          video_views_p25?: number | null
          video_views_p50?: number | null
          video_views_p75?: number | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string
          campaign_id?: string | null
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          video_views?: number | null
          video_views_p100?: number | null
          video_views_p25?: number | null
          video_views_p50?: number | null
          video_views_p75?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creative_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          account_id: string | null
          ad_id: string
          ad_name: string | null
          adset_id: string | null
          body: string | null
          call_to_action: string | null
          campaign_id: string | null
          clicks: number | null
          cpc: number | null
          cpl: number | null
          cpm: number | null
          created_at: string | null
          creative_id: string | null
          ctr: number | null
          headline: string | null
          id: string
          image_url: string | null
          impressions: number | null
          last_sync_at: string | null
          leads: number | null
          purchases: number | null
          reach: number | null
          roas: number | null
          spend: number | null
          status: string | null
          thumbnail_url: string | null
          updated_at: string | null
          video_url: string | null
          video_views: number | null
          video_views_p100: number | null
          video_views_p25: number | null
          video_views_p50: number | null
          video_views_p75: number | null
        }
        Insert: {
          account_id?: string | null
          ad_id: string
          ad_name?: string | null
          adset_id?: string | null
          body?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          creative_id?: string | null
          ctr?: number | null
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          last_sync_at?: string | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_url?: string | null
          video_views?: number | null
          video_views_p100?: number | null
          video_views_p25?: number | null
          video_views_p50?: number | null
          video_views_p75?: number | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string
          ad_name?: string | null
          adset_id?: string | null
          body?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          clicks?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          creative_id?: string | null
          ctr?: number | null
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          last_sync_at?: string | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_url?: string | null
          video_views?: number | null
          video_views_p100?: number | null
          video_views_p25?: number | null
          video_views_p50?: number | null
          video_views_p75?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_metrics: {
        Row: {
          account_id: string | null
          clicks: number | null
          cpa: number | null
          cpc: number | null
          cpl: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          frequency: number | null
          id: string
          impressions: number | null
          leads: number | null
          purchases: number | null
          reach: number | null
          roas: number | null
          spend: number | null
        }
        Insert: {
          account_id?: string | null
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
        }
        Update: {
          account_id?: string | null
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          frequency?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          purchases?: number | null
          reach?: number | null
          roas?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_videos: {
        Row: {
          avatar_id: string | null
          created_at: string | null
          duration_seconds: number | null
          heygen_video_id: string
          id: string
          project_id: string | null
          script: string
          status: string | null
          thumbnail_url: string | null
          updated_at: string | null
          video_url: string | null
          voice_id: string | null
        }
        Insert: {
          avatar_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          heygen_video_id: string
          id?: string
          project_id?: string | null
          script: string
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_url?: string | null
          voice_id?: string | null
        }
        Update: {
          avatar_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          heygen_video_id?: string
          id?: string
          project_id?: string | null
          script?: string
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_url?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      business_context: {
        Row: {
          communication_style: string | null
          company_name: string
          competitors: string[] | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          mission: string | null
          persona_description: string | null
          persona_desires: string[] | null
          persona_name: string | null
          persona_pain_points: string[] | null
          products: Json | null
          tone_of_voice: string | null
          unique_value_proposition: string | null
          updated_at: string | null
          vision: string | null
        }
        Insert: {
          communication_style?: string | null
          company_name?: string
          competitors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mission?: string | null
          persona_description?: string | null
          persona_desires?: string[] | null
          persona_name?: string | null
          persona_pain_points?: string[] | null
          products?: Json | null
          tone_of_voice?: string | null
          unique_value_proposition?: string | null
          updated_at?: string | null
          vision?: string | null
        }
        Update: {
          communication_style?: string | null
          company_name?: string
          competitors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mission?: string | null
          persona_description?: string | null
          persona_desires?: string[] | null
          persona_name?: string | null
          persona_pain_points?: string[] | null
          products?: Json | null
          tone_of_voice?: string | null
          unique_value_proposition?: string | null
          updated_at?: string | null
          vision?: string | null
        }
        Relationships: []
      }
      campaign_creatives: {
        Row: {
          approved_at: string | null
          audience_type: string
          campaign_id: string
          ceo_feedback: string | null
          copy_preview: Json | null
          created_at: string | null
          creative_concept: string | null
          format_type: string
          funnel_stage: string
          generated_at: string | null
          hook_type: string | null
          id: string
          image_generation_prompt: string | null
          image_url: string | null
          message_angle: string | null
          platform_format: string
          psychological_trigger: string | null
          rationale: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string | null
          video_direction: string | null
          video_script: string | null
        }
        Insert: {
          approved_at?: string | null
          audience_type?: string
          campaign_id: string
          ceo_feedback?: string | null
          copy_preview?: Json | null
          created_at?: string | null
          creative_concept?: string | null
          format_type?: string
          funnel_stage?: string
          generated_at?: string | null
          hook_type?: string | null
          id?: string
          image_generation_prompt?: string | null
          image_url?: string | null
          message_angle?: string | null
          platform_format?: string
          psychological_trigger?: string | null
          rationale?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          video_direction?: string | null
          video_script?: string | null
        }
        Update: {
          approved_at?: string | null
          audience_type?: string
          campaign_id?: string
          ceo_feedback?: string | null
          copy_preview?: Json | null
          created_at?: string | null
          creative_concept?: string | null
          format_type?: string
          funnel_stage?: string
          generated_at?: string | null
          hook_type?: string | null
          id?: string
          image_generation_prompt?: string | null
          image_url?: string | null
          message_angle?: string | null
          platform_format?: string
          psychological_trigger?: string | null
          rationale?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          video_direction?: string | null
          video_script?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "creative_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget: number | null
          clicks: number | null
          conversions: number | null
          created_at: string
          end_date: string | null
          id: string
          impressions: number | null
          leads: number | null
          metadata: Json | null
          name: string
          platform: Database["public"]["Enums"]["campaign_platform"]
          spent: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          impressions?: number | null
          leads?: number | null
          metadata?: Json | null
          name: string
          platform: Database["public"]["Enums"]["campaign_platform"]
          spent?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          impressions?: number | null
          leads?: number | null
          metadata?: Json | null
          name?: string
          platform?: Database["public"]["Enums"]["campaign_platform"]
          spent?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_configs: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          model: string | null
          name: string
          provider: string | null
          slug: string
          system_prompt: string
          tools: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          name: string
          provider?: string | null
          slug: string
          system_prompt: string
          tools?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          name?: string
          provider?: string | null
          slug?: string
          system_prompt?: string
          tools?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          config_id: string | null
          context: Json | null
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          config_id?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          config_id?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "chat_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          segment: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          segment?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          segment?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contact_badges: {
        Row: {
          badge: Database["public"]["Enums"]["badge_type"]
          created_at: string
          id: string
          label: string
        }
        Insert: {
          badge: Database["public"]["Enums"]["badge_type"]
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          badge?: Database["public"]["Enums"]["badge_type"]
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      contact_collaborators: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string | null
          has_platform_access: boolean | null
          id: string
          name: string
          role: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          has_platform_access?: boolean | null
          id?: string
          name: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          has_platform_access?: boolean | null
          id?: string
          name?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_collaborators_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_products: {
        Row: {
          billing_day: number | null
          cohort: string | null
          created_at: string
          end_date: string | null
          id: string
          installment_value: number | null
          installments: number | null
          last_activity: string | null
          next_action: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          product: Database["public"]["Enums"]["product_type"]
          start_date: string | null
          status: Database["public"]["Enums"]["product_status"]
          total_value: number | null
          updated_at: string
        }
        Insert: {
          billing_day?: number | null
          cohort?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          last_activity?: string | null
          next_action?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product: Database["public"]["Enums"]["product_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          billing_day?: number | null
          cohort?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          last_activity?: string | null
          next_action?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product?: Database["public"]["Enums"]["product_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          avatar_url: string | null
          company_email: string | null
          company_id: string | null
          company_name: string | null
          company_phone: string | null
          contact_type: Database["public"]["Enums"]["contact_type"] | null
          converted_at: string | null
          created_at: string
          email: string | null
          first_touch_at: string | null
          id: string
          interested_products: string[] | null
          is_decision_maker: boolean | null
          last_touch_at: string | null
          lead_score: number | null
          metadata: Json | null
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          role: string | null
          status: Database["public"]["Enums"]["contact_status"] | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_email?: string | null
          company_id?: string | null
          company_name?: string | null
          company_phone?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          first_touch_at?: string | null
          id?: string
          interested_products?: string[] | null
          is_decision_maker?: boolean | null
          last_touch_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_email?: string | null
          company_id?: string | null
          company_name?: string | null
          company_phone?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          first_touch_at?: string | null
          id?: string
          interested_products?: string[] | null
          is_decision_maker?: boolean | null
          last_touch_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          sender_name: string | null
          sender_type: string
          ticket_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender_name?: string | null
          sender_type: string
          ticket_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender_name?: string | null
          sender_type?: string
          ticket_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel_name: string
          channel_type: string
          contact_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_agent_message_at: string | null
          last_client_message_at: string | null
          last_message: string | null
          last_message_at: string | null
          pending_llm_processing: boolean | null
          process_after: string | null
          team: Database["public"]["Enums"]["team_type"]
          updated_at: string | null
          whatsapp_group_id: string | null
        }
        Insert: {
          channel_name: string
          channel_type: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_agent_message_at?: string | null
          last_client_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          pending_llm_processing?: boolean | null
          process_after?: string | null
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string | null
          whatsapp_group_id?: string | null
        }
        Update: {
          channel_name?: string
          channel_type?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_agent_message_at?: string | null
          last_client_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          pending_llm_processing?: boolean | null
          process_after?: string | null
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string | null
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_group_id_fkey"
            columns: ["whatsapp_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_chat_sessions: {
        Row: {
          created_at: string | null
          creatives: Json | null
          id: string
          images: Json | null
          messages: Json | null
          project_id: string
          updated_at: string | null
          video_avatar: Json | null
        }
        Insert: {
          created_at?: string | null
          creatives?: Json | null
          id?: string
          images?: Json | null
          messages?: Json | null
          project_id: string
          updated_at?: string | null
          video_avatar?: Json | null
        }
        Update: {
          created_at?: string | null
          creatives?: Json | null
          id?: string
          images?: Json | null
          messages?: Json | null
          project_id?: string
          updated_at?: string | null
          video_avatar?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_chat_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_campaigns: {
        Row: {
          channel: string
          created_at: string | null
          id: string
          name: string
          project_id: string
          status: string
          target_cold_creatives: number | null
          target_hot_creatives: number | null
          target_warm_creatives: number | null
          updated_at: string | null
        }
        Insert: {
          channel?: string
          created_at?: string | null
          id?: string
          name: string
          project_id: string
          status?: string
          target_cold_creatives?: number | null
          target_hot_creatives?: number | null
          target_warm_creatives?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string
          target_cold_creatives?: number | null
          target_hot_creatives?: number | null
          target_warm_creatives?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "creative_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_conversations: {
        Row: {
          created_at: string | null
          current_spec: Json | null
          id: string
          messages: Json | null
          project_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_spec?: Json | null
          id?: string
          messages?: Json | null
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_spec?: Json | null
          id?: string
          messages?: Json | null
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "creative_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_projects: {
        Row: {
          accent_color: string | null
          briefing: string | null
          created_at: string | null
          description: string | null
          desires: string[] | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          pain_points: string[] | null
          primary_color: string | null
          secondary_color: string | null
          target_audience: string | null
          text_color: string | null
          tone_of_voice: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          briefing?: string | null
          created_at?: string | null
          description?: string | null
          desires?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          pain_points?: string[] | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          text_color?: string | null
          tone_of_voice?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          briefing?: string | null
          created_at?: string | null
          description?: string | null
          desires?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          pain_points?: string[] | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          text_color?: string | null
          tone_of_voice?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      creative_references: {
        Row: {
          category: string
          created_at: string | null
          extracted_dna: Json | null
          id: string
          image_url: string
          is_active: boolean | null
          name: string | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          extracted_dna?: Json | null
          id?: string
          image_url: string
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          extracted_dna?: Json | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      creative_templates: {
        Row: {
          armadilhas: Json
          checklist_pre_geracao: Json
          created_at: string | null
          descricao: string
          elemento_principal: Json
          estrategia: Json
          estrutura: Json
          id: string
          is_active: boolean | null
          last_test_image_url: string | null
          nome: string
          paleta: Json
          principios_copy: Json
          principios_tipograficos: Json
          principios_visuais: Json
          prompt_base: string
          reference_image_url: string | null
          updated_at: string | null
        }
        Insert: {
          armadilhas?: Json
          checklist_pre_geracao?: Json
          created_at?: string | null
          descricao: string
          elemento_principal?: Json
          estrategia?: Json
          estrutura?: Json
          id?: string
          is_active?: boolean | null
          last_test_image_url?: string | null
          nome: string
          paleta?: Json
          principios_copy?: Json
          principios_tipograficos?: Json
          principios_visuais?: Json
          prompt_base?: string
          reference_image_url?: string | null
          updated_at?: string | null
        }
        Update: {
          armadilhas?: Json
          checklist_pre_geracao?: Json
          created_at?: string | null
          descricao?: string
          elemento_principal?: Json
          estrategia?: Json
          estrutura?: Json
          id?: string
          is_active?: boolean | null
          last_test_image_url?: string | null
          nome?: string
          paleta?: Json
          principios_copy?: Json
          principios_tipograficos?: Json
          principios_visuais?: Json
          prompt_base?: string
          reference_image_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cs_checkins: {
        Row: {
          assignee: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["checkin_status"]
          type: Database["public"]["Enums"]["checkin_type"]
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["checkin_status"]
          type: Database["public"]["Enums"]["checkin_type"]
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["checkin_status"]
          type?: Database["public"]["Enums"]["checkin_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_checkins_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_conversations: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          onboarding_id: string | null
          product: Database["public"]["Enums"]["product_type"] | null
          status: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          onboarding_id?: string | null
          product?: Database["public"]["Enums"]["product_type"] | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          onboarding_id?: string | null
          product?: Database["public"]["Enums"]["product_type"] | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_conversations_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "cs_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_engagement_metrics: {
        Row: {
          id: string
          member_area_completed_lessons: number | null
          member_area_last_access: string | null
          member_area_time_spent_minutes: number | null
          member_area_total_lessons: number | null
          organization_id: string
          product_features_used: Json | null
          product_id: string
          product_last_login: string | null
          product_total_logins: number | null
          updated_at: string | null
          whatsapp_group_last_message: string | null
          whatsapp_group_total_messages: number | null
          whatsapp_support_last_message: string | null
          whatsapp_support_total_tickets: number | null
          zoom_last_participation: string | null
          zoom_total_minutes: number | null
          zoom_total_participations: number | null
        }
        Insert: {
          id?: string
          member_area_completed_lessons?: number | null
          member_area_last_access?: string | null
          member_area_time_spent_minutes?: number | null
          member_area_total_lessons?: number | null
          organization_id: string
          product_features_used?: Json | null
          product_id: string
          product_last_login?: string | null
          product_total_logins?: number | null
          updated_at?: string | null
          whatsapp_group_last_message?: string | null
          whatsapp_group_total_messages?: number | null
          whatsapp_support_last_message?: string | null
          whatsapp_support_total_tickets?: number | null
          zoom_last_participation?: string | null
          zoom_total_minutes?: number | null
          zoom_total_participations?: number | null
        }
        Update: {
          id?: string
          member_area_completed_lessons?: number | null
          member_area_last_access?: string | null
          member_area_time_spent_minutes?: number | null
          member_area_total_lessons?: number | null
          organization_id?: string
          product_features_used?: Json | null
          product_id?: string
          product_last_login?: string | null
          product_total_logins?: number | null
          updated_at?: string | null
          whatsapp_group_last_message?: string | null
          whatsapp_group_total_messages?: number | null
          whatsapp_support_last_message?: string | null
          whatsapp_support_total_tickets?: number | null
          zoom_last_participation?: string | null
          zoom_total_minutes?: number | null
          zoom_total_participations?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_engagement_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_engagement_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_events: {
        Row: {
          assigned_to: string | null
          attendees: string[] | null
          completed_at: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          onboarding_id: string | null
          recording_url: string | null
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attendees?: string[] | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          onboarding_id?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attendees?: string[] | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          onboarding_id?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_events_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "cs_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_health_current: {
        Row: {
          engagement_score: number | null
          health_status: Database["public"]["Enums"]["health_status"]
          id: string
          objectives_score: number | null
          organization_id: string
          overall_score: number
          product_id: string
          sentiment_score: number | null
          updated_at: string | null
          usage_score: number | null
        }
        Insert: {
          engagement_score?: number | null
          health_status: Database["public"]["Enums"]["health_status"]
          id?: string
          objectives_score?: number | null
          organization_id: string
          overall_score: number
          product_id: string
          sentiment_score?: number | null
          updated_at?: string | null
          usage_score?: number | null
        }
        Update: {
          engagement_score?: number | null
          health_status?: Database["public"]["Enums"]["health_status"]
          id?: string
          objectives_score?: number | null
          organization_id?: string
          overall_score?: number
          product_id?: string
          sentiment_score?: number | null
          updated_at?: string | null
          usage_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_health_current_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_health_current_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_health_scores_history: {
        Row: {
          calculated_at: string | null
          calculated_by: string | null
          created_at: string | null
          engagement_score: number | null
          health_status: Database["public"]["Enums"]["health_status"]
          id: string
          metadata: Json | null
          objectives_score: number | null
          organization_id: string
          overall_score: number
          product_id: string
          sentiment_score: number | null
          usage_score: number | null
        }
        Insert: {
          calculated_at?: string | null
          calculated_by?: string | null
          created_at?: string | null
          engagement_score?: number | null
          health_status: Database["public"]["Enums"]["health_status"]
          id?: string
          metadata?: Json | null
          objectives_score?: number | null
          organization_id: string
          overall_score: number
          product_id: string
          sentiment_score?: number | null
          usage_score?: number | null
        }
        Update: {
          calculated_at?: string | null
          calculated_by?: string | null
          created_at?: string | null
          engagement_score?: number | null
          health_status?: Database["public"]["Enums"]["health_status"]
          id?: string
          metadata?: Json | null
          objectives_score?: number | null
          organization_id?: string
          overall_score?: number
          product_id?: string
          sentiment_score?: number | null
          usage_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_health_scores_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_health_scores_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_interactions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          interaction_timestamp: string | null
          member_id: string | null
          metadata: Json | null
          organization_id: string
          product_id: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"] | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          interaction_timestamp?: string | null
          member_id?: string | null
          metadata?: Json | null
          organization_id: string
          product_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          interaction_timestamp?: string | null
          member_id?: string | null
          metadata?: Json | null
          organization_id?: string
          product_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          title?: string
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cs_interactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_interactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean | null
          sender_id: string | null
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cs_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_objectives: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          days_target: number
          deadline: string
          description: string
          id: string
          metadata: Json | null
          notes: string | null
          organization_id: string
          product_id: string
          status: Database["public"]["Enums"]["objective_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          days_target: number
          deadline: string
          description: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          product_id: string
          status?: Database["public"]["Enums"]["objective_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          days_target?: number
          deadline?: string
          description?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          product_id?: string
          status?: Database["public"]["Enums"]["objective_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_objectives_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_objectives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_objectives_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_onboardings: {
        Row: {
          assigned_to: string | null
          checklist_progress: Json | null
          client_product_id: string
          completed_at: string | null
          created_at: string
          diagnostic_data: Json | null
          id: string
          stage: string
          started_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checklist_progress?: Json | null
          client_product_id: string
          completed_at?: string | null
          created_at?: string
          diagnostic_data?: Json | null
          id?: string
          stage?: string
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checklist_progress?: Json | null
          client_product_id?: string
          completed_at?: string | null
          created_at?: string
          diagnostic_data?: Json | null
          id?: string
          stage?: string
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_onboardings_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_onboardings_client_product_id_fkey"
            columns: ["client_product_id"]
            isOneToOne: false
            referencedRelation: "contact_products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_playbook_executions: {
        Row: {
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          organization_id: string
          playbook_id: string
          product_id: string
          result: Json | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id: string
          playbook_id: string
          product_id: string
          result?: Json | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id?: string
          playbook_id?: string
          product_id?: string
          result?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_playbook_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_playbook_executions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "cs_playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_playbook_executions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_playbooks: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          description: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          name: string
          product_id: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          description?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          product_id: string
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          description?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          product_id?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_playbooks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_referrals: {
        Row: {
          converted_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          product_id: string
          referred_company: string | null
          referred_contact_id: string | null
          referred_email: string | null
          referred_name: string
          referred_organization_id: string | null
          referred_phone: string | null
          referrer_contact_id: string
          referrer_organization_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          referred_company?: string | null
          referred_contact_id?: string | null
          referred_email?: string | null
          referred_name: string
          referred_organization_id?: string | null
          referred_phone?: string | null
          referrer_contact_id: string
          referrer_organization_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          referred_company?: string | null
          referred_contact_id?: string | null
          referred_email?: string | null
          referred_name?: string
          referred_organization_id?: string | null
          referred_phone?: string | null
          referrer_contact_id?: string
          referrer_organization_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_referrals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_referrals_referred_contact_id_fkey"
            columns: ["referred_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_referrals_referred_organization_id_fkey"
            columns: ["referred_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_referrals_referrer_contact_id_fkey"
            columns: ["referrer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_referrals_referrer_organization_id_fkey"
            columns: ["referrer_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_success_metrics: {
        Row: {
          id: string
          is_success_case: boolean | null
          nps_collected_at: string | null
          nps_feedback: string | null
          nps_score: number | null
          organization_id: string
          product_id: string
          referrals_converted: number | null
          referrals_count: number | null
          referrals_target: number | null
          success_case_published_at: string | null
          success_case_url: string | null
          testimonial_audio_url: string | null
          testimonial_collected: boolean | null
          testimonial_content: string | null
          testimonial_date: string | null
          testimonial_rating: number | null
          testimonial_video_url: string | null
          updated_at: string | null
          upsell_date: string | null
          upsell_done: boolean | null
          upsell_product: string | null
          upsell_value: number | null
        }
        Insert: {
          id?: string
          is_success_case?: boolean | null
          nps_collected_at?: string | null
          nps_feedback?: string | null
          nps_score?: number | null
          organization_id: string
          product_id: string
          referrals_converted?: number | null
          referrals_count?: number | null
          referrals_target?: number | null
          success_case_published_at?: string | null
          success_case_url?: string | null
          testimonial_audio_url?: string | null
          testimonial_collected?: boolean | null
          testimonial_content?: string | null
          testimonial_date?: string | null
          testimonial_rating?: number | null
          testimonial_video_url?: string | null
          updated_at?: string | null
          upsell_date?: string | null
          upsell_done?: boolean | null
          upsell_product?: string | null
          upsell_value?: number | null
        }
        Update: {
          id?: string
          is_success_case?: boolean | null
          nps_collected_at?: string | null
          nps_feedback?: string | null
          nps_score?: number | null
          organization_id?: string
          product_id?: string
          referrals_converted?: number | null
          referrals_count?: number | null
          referrals_target?: number | null
          success_case_published_at?: string | null
          success_case_url?: string | null
          testimonial_audio_url?: string | null
          testimonial_collected?: boolean | null
          testimonial_content?: string | null
          testimonial_date?: string | null
          testimonial_rating?: number | null
          testimonial_video_url?: string | null
          updated_at?: string | null
          upsell_date?: string | null
          upsell_done?: boolean | null
          upsell_product?: string | null
          upsell_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_success_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_success_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_touchpoints: {
        Row: {
          channel: Database["public"]["Enums"]["touchpoint_channel"]
          checkpoint_day: number | null
          created_at: string | null
          created_by: string | null
          follow_up_deadline: string | null
          id: string
          metadata: Json | null
          next_action: string | null
          next_contact_date: string | null
          organization_id: string
          product_id: string
          risk_action: "monitoring" | "resolved" | null
          sentiment: Database["public"]["Enums"]["sentiment_type"] | null
          source: string | null
          status: string | null
          summary: string
          touchpoint_date: string
          type: Database["public"]["Enums"]["touchpoint_type"]
          updated_at: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["touchpoint_channel"]
          checkpoint_day?: number | null
          created_at?: string | null
          created_by?: string | null
          follow_up_deadline?: string | null
          id?: string
          metadata?: Json | null
          next_action?: string | null
          next_contact_date?: string | null
          organization_id: string
          product_id: string
          risk_action?: "monitoring" | "resolved" | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          source?: string | null
          status?: string | null
          summary: string
          touchpoint_date: string
          type: Database["public"]["Enums"]["touchpoint_type"]
          updated_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["touchpoint_channel"]
          checkpoint_day?: number | null
          created_at?: string | null
          created_by?: string | null
          follow_up_deadline?: string | null
          id?: string
          metadata?: Json | null
          next_action?: string | null
          next_contact_date?: string | null
          organization_id?: string
          product_id?: string
          risk_action?: "monitoring" | "resolved" | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          source?: string | null
          status?: string | null
          summary?: string
          touchpoint_date?: string
          type?: Database["public"]["Enums"]["touchpoint_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_touchpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_touchpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_touchpoints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          contact_id: string
          created_at: string | null
          discount_percent: number | null
          discount_reason: string | null
          entry_amount: number | null
          id: string
          installment_amount: number | null
          installments: number | null
          lost_at: string | null
          lost_reason: string | null
          metadata: Json | null
          negotiated_price: number
          notes: string | null
          organization_id: string | null
          original_price: number
          payment_confirmed_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          product_id: string
          proposal_sent_at: string | null
          proposal_url: string | null
          sales_rep_id: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          updated_at: string | null
          won_at: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          discount_percent?: number | null
          discount_reason?: string | null
          entry_amount?: number | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          negotiated_price: number
          notes?: string | null
          organization_id?: string | null
          original_price: number
          payment_confirmed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id: string
          proposal_sent_at?: string | null
          proposal_url?: string | null
          sales_rep_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          updated_at?: string | null
          won_at?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          discount_percent?: number | null
          discount_reason?: string | null
          entry_amount?: number | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          negotiated_price?: number
          notes?: string | null
          organization_id?: string | null
          original_price?: number
          payment_confirmed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id?: string
          proposal_sent_at?: string | null
          proposal_url?: string | null
          sales_rep_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          updated_at?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          check_in_at: string | null
          contact_id: string
          created_at: string
          event_id: string
          feedback_score: number | null
          feedback_text: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          status: string | null
        }
        Insert: {
          check_in_at?: string | null
          contact_id: string
          created_at?: string
          event_id: string
          feedback_score?: number | null
          feedback_text?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Update: {
          check_in_at?: string | null
          contact_id?: string
          created_at?: string
          event_id?: string
          feedback_score?: number | null
          feedback_text?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cohort: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_online: boolean | null
          location: string | null
          metadata: Json | null
          name: string
          product: Database["public"]["Enums"]["product_type"]
          registered_count: number | null
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          cohort?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_online?: boolean | null
          location?: string | null
          metadata?: Json | null
          name: string
          product: Database["public"]["Enums"]["product_type"]
          registered_count?: number | null
          start_date: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          cohort?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_online?: boolean | null
          location?: string | null
          metadata?: Json | null
          name?: string
          product?: Database["public"]["Enums"]["product_type"]
          registered_count?: number | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      generated_creatives: {
        Row: {
          copy_gerada: Json | null
          created_at: string | null
          feedback: string | null
          format: string | null
          id: string
          image_url: string | null
          meta_creative_id: string | null
          meta_image_hash: string | null
          meta_synced_at: string | null
          meta_video_id: string | null
          platform: string | null
          project_id: string | null
          prompt: string
          prompt_final: string | null
          reference_id: string | null
          score: number | null
          spec: Json | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          copy_gerada?: Json | null
          created_at?: string | null
          feedback?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          meta_creative_id?: string | null
          meta_image_hash?: string | null
          meta_synced_at?: string | null
          meta_video_id?: string | null
          platform?: string | null
          project_id?: string | null
          prompt: string
          prompt_final?: string | null
          reference_id?: string | null
          score?: number | null
          spec?: Json | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          copy_gerada?: Json | null
          created_at?: string | null
          feedback?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          meta_creative_id?: string | null
          meta_image_hash?: string | null
          meta_synced_at?: string | null
          meta_video_id?: string | null
          platform?: string | null
          project_id?: string | null
          prompt?: string
          prompt_final?: string | null
          reference_id?: string | null
          score?: number | null
          spec?: Json | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_creatives_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_creatives_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "creative_references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_creatives_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "creative_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string | null
          current_value: number | null
          id: string
          metric: string
          notes: string | null
          period_end: string
          period_start: string
          status: string | null
          target_value: number
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_value?: number | null
          id?: string
          metric: string
          notes?: string | null
          period_end: string
          period_start: string
          status?: string | null
          target_value: number
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_value?: number | null
          id?: string
          metric?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          target_value?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          client_id: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          client_id?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          client_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          id: string
          lost_reason: string | null
          product: Database["public"]["Enums"]["product_type"]
          qualification_budget: boolean | null
          qualification_decision_maker: boolean | null
          qualification_pain_identified: boolean | null
          qualification_timeline: boolean | null
          score: number | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          id?: string
          lost_reason?: string | null
          product: Database["public"]["Enums"]["product_type"]
          qualification_budget?: boolean | null
          qualification_decision_maker?: boolean | null
          qualification_pain_identified?: boolean | null
          qualification_timeline?: boolean | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          lost_reason?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          qualification_budget?: boolean | null
          qualification_decision_maker?: boolean | null
          qualification_pain_identified?: boolean | null
          qualification_timeline?: boolean | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          copy_text: string | null
          created_at: string | null
          cta: string | null
          description: string | null
          duration_seconds: number | null
          generated_creative_id: string | null
          headline: string | null
          height: number | null
          id: string
          media_type: string
          meta_created_at: string | null
          meta_hash: string | null
          meta_id: string | null
          name: string | null
          project_id: string | null
          source: string
          status: string | null
          synced_at: string | null
          tags: string[] | null
          thumbnail_url: string | null
          url: string | null
          width: number | null
        }
        Insert: {
          copy_text?: string | null
          created_at?: string | null
          cta?: string | null
          description?: string | null
          duration_seconds?: number | null
          generated_creative_id?: string | null
          headline?: string | null
          height?: number | null
          id?: string
          media_type: string
          meta_created_at?: string | null
          meta_hash?: string | null
          meta_id?: string | null
          name?: string | null
          project_id?: string | null
          source: string
          status?: string | null
          synced_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          url?: string | null
          width?: number | null
        }
        Update: {
          copy_text?: string | null
          created_at?: string | null
          cta?: string | null
          description?: string | null
          duration_seconds?: number | null
          generated_creative_id?: string | null
          headline?: string | null
          height?: number | null
          id?: string
          media_type?: string
          meta_created_at?: string | null
          meta_hash?: string | null
          meta_id?: string | null
          name?: string | null
          project_id?: string | null
          source?: string
          status?: string | null
          synced_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_library_generated_creative_id_fkey"
            columns: ["generated_creative_id"]
            isOneToOne: false
            referencedRelation: "generated_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_library_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          category: Database["public"]["Enums"]["nps_category"]
          created_at: string
          feedback: string | null
          id: string
          score: number
        }
        Insert: {
          category: Database["public"]["Enums"]["nps_category"]
          created_at?: string
          feedback?: string | null
          id?: string
          score: number
        }
        Update: {
          category?: Database["public"]["Enums"]["nps_category"]
          created_at?: string
          feedback?: string | null
          id?: string
          score?: number
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          can_invite: boolean | null
          contact_id: string
          created_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          invited_by: string | null
          is_admin: boolean | null
          job_title: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"] | null
          updated_at: string | null
          user_id: string | null
          whatsapp_added_at: string | null
          whatsapp_in_group: boolean | null
        }
        Insert: {
          can_invite?: boolean | null
          contact_id: string
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_admin?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"] | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_added_at?: string | null
          whatsapp_in_group?: boolean | null
        }
        Update: {
          can_invite?: boolean | null
          contact_id?: string
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_admin?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"] | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_added_at?: string | null
          whatsapp_in_group?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_products: {
        Row: {
          created_at: string | null
          cs_rep_id: string | null
          cs_status: Database["public"]["Enums"]["cs_status"] | null
          deal_id: string | null
          expires_at: string | null
          id: string
          journey_stage: Database["public"]["Enums"]["journey_stage"] | null
          metadata: Json | null
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          onboarding_status:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          organization_id: string
          product_id: string
          starts_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cs_rep_id?: string | null
          cs_status?: Database["public"]["Enums"]["cs_status"] | null
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          journey_stage?: Database["public"]["Enums"]["journey_stage"] | null
          metadata?: Json | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          organization_id: string
          product_id: string
          starts_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cs_rep_id?: string | null
          cs_status?: Database["public"]["Enums"]["cs_status"] | null
          deal_id?: string | null
          expires_at?: string | null
          id?: string
          journey_stage?: Database["public"]["Enums"]["journey_stage"] | null
          metadata?: Json | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          organization_id?: string
          product_id?: string
          starts_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_products_cs_rep_id_fkey"
            columns: ["cs_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_products_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          churn_reason: string | null
          churned_at: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          org_type: Database["public"]["Enums"]["organization_type"]
          plan: string | null
          primary_color: string | null
          primary_contact_id: string
          seats_limit: number | null
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["organization_status"] | null
          updated_at: string | null
        }
        Insert: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["organization_type"]
          plan?: string | null
          primary_color?: string | null
          primary_contact_id: string
          seats_limit?: number | null
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["organization_status"] | null
          updated_at?: string | null
        }
        Update: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          org_type?: Database["public"]["Enums"]["organization_type"]
          plan?: string | null
          primary_color?: string | null
          primary_contact_id?: string
          seats_limit?: number | null
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          steps: Json
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          steps?: Json
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_configs: {
        Row: {
          checklist_items: Json | null
          created_at: string
          diagnostic_fields: Json | null
          has_onboarding: boolean | null
          id: string
          name: string
          onboarding_stages: Json | null
          product: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          checklist_items?: Json | null
          created_at?: string
          diagnostic_fields?: Json | null
          has_onboarding?: boolean | null
          id?: string
          name: string
          onboarding_stages?: Json | null
          product: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          checklist_items?: Json | null
          created_at?: string
          diagnostic_fields?: Json | null
          has_onboarding?: boolean | null
          id?: string
          name?: string
          onboarding_stages?: Json | null
          product?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          cs_config: Json | null
          cs_process_type: string | null
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          onboarding_required: boolean | null
          onboarding_steps: Json | null
          primary_color: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cs_config?: Json | null
          cs_process_type?: string | null
          description?: string | null
          id: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          onboarding_required?: boolean | null
          onboarding_steps?: Json | null
          primary_color?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cs_config?: Json | null
          cs_process_type?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          onboarding_required?: boolean | null
          onboarding_steps?: Json | null
          primary_color?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_module: Database["public"]["Enums"]["module_type"] | null
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_module?: Database["public"]["Enums"]["module_type"] | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_module?: Database["public"]["Enums"]["module_type"] | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          asset_type: string
          context: string
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          priority: number | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          asset_type: string
          context: string
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          priority?: number | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          asset_type?: string
          context?: string
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          priority?: number | null
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "creative_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_deliverables: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          content: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          order_index: number | null
          project_id: string | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          type: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          order_index?: number | null
          project_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          order_index?: number | null
          project_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_deliverables_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_funnels: {
        Row: {
          created_at: string | null
          description: string | null
          funnel_data: Json
          id: string
          name: string
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          funnel_data?: Json
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          funnel_data?: Json
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_funnels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          accent_color: string | null
          actual_leads: number | null
          actual_revenue: number | null
          actual_sales: number | null
          budget_planned: number | null
          budget_spent: number | null
          created_at: string | null
          description: string | null
          end_date: string | null
          expected_leads: number | null
          expected_revenue: number | null
          expected_sales: number | null
          goal_id: string | null
          id: string
          logo_url: string | null
          name: string
          objective: string | null
          owner_id: string | null
          persona_override: Json | null
          primary_color: string | null
          progress: number | null
          reference_image_url: string | null
          secondary_color: string | null
          start_date: string | null
          status: string | null
          target_audience: string | null
          tone_of_voice: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          actual_leads?: number | null
          actual_revenue?: number | null
          actual_sales?: number | null
          budget_planned?: number | null
          budget_spent?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          expected_leads?: number | null
          expected_revenue?: number | null
          expected_sales?: number | null
          goal_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          objective?: string | null
          owner_id?: string | null
          persona_override?: Json | null
          primary_color?: string | null
          progress?: number | null
          reference_image_url?: string | null
          secondary_color?: string | null
          start_date?: string | null
          status?: string | null
          target_audience?: string | null
          tone_of_voice?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          actual_leads?: number | null
          actual_revenue?: number | null
          actual_sales?: number | null
          budget_planned?: number | null
          budget_spent?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          expected_leads?: number | null
          expected_revenue?: number | null
          expected_sales?: number | null
          goal_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          objective?: string | null
          owner_id?: string | null
          persona_override?: Json | null
          primary_color?: string | null
          progress?: number | null
          reference_image_url?: string | null
          secondary_color?: string | null
          start_date?: string | null
          status?: string | null
          target_audience?: string | null
          tone_of_voice?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_settings: {
        Row: {
          alert_enabled: boolean
          alert_group_id: string | null
          alert_instance_id: string | null
          alert_message_template: string
          created_at: string
          response_timeout_minutes: number
          team: Database["public"]["Enums"]["team_type"]
          updated_at: string
        }
        Insert: {
          alert_enabled?: boolean
          alert_group_id?: string | null
          alert_instance_id?: string | null
          alert_message_template?: string
          created_at?: string
          response_timeout_minutes?: number
          team: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Update: {
          alert_enabled?: boolean
          alert_group_id?: string | null
          alert_instance_id?: string | null
          alert_message_template?: string
          created_at?: string
          response_timeout_minutes?: number
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_settings_alert_group_id_fkey"
            columns: ["alert_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_settings_alert_instance_id_fkey"
            columns: ["alert_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          related_client_id: string | null
          related_contact_id: string | null
          related_lead_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          related_client_id?: string | null
          related_contact_id?: string | null
          related_lead_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          related_client_id?: string | null
          related_contact_id?: string | null
          related_lead_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      template_chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          messages: Json | null
          template_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          messages?: Json | null
          template_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          messages?: Json | null
          template_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_chat_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "creative_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_ai_events: {
        Row: {
          action: string
          confidence: number | null
          created_at: string
          direction: string
          id: string
          model: string | null
          payload: Json
          reason: string | null
          ticket_id: string | null
          ticket_message_id: string | null
        }
        Insert: {
          action: string
          confidence?: number | null
          created_at?: string
          direction: string
          id?: string
          model?: string | null
          payload?: Json
          reason?: string | null
          ticket_id?: string | null
          ticket_message_id?: string | null
        }
        Update: {
          action?: string
          confidence?: number | null
          created_at?: string
          direction?: string
          id?: string
          model?: string | null
          payload?: Json
          reason?: string | null
          ticket_id?: string | null
          ticket_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_ai_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_ai_events_ticket_message_id_fkey"
            columns: ["ticket_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string
          display_order: number | null
          examples: string[] | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description: string
          display_order?: number | null
          examples?: string[] | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string
          display_order?: number | null
          examples?: string[] | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean | null
          media_url: string | null
          message_type: string | null
          sender_id: string | null
          sender_name: string | null
          sender_type: string
          ticket_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type: string
          ticket_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type?: string
          ticket_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_whatsapp_message_id_fkey"
            columns: ["whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          alert_count: number
          assignee: string | null
          category: string | null
          category_id: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          channel_name: string | null
          closed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_agent_message_at: string | null
          last_alerted_at: string | null
          last_client_message_at: string | null
          last_message: string | null
          last_message_at: string | null
          llm_last_decision: Json
          llm_summary: string | null
          opened_at: string | null
          opened_by_name: string | null
          opened_by_phone: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          sla_breached: boolean | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tags: string[] | null
          team: Database["public"]["Enums"]["team_type"]
          thread_key: string | null
          updated_at: string
          whatsapp_group_id: string | null
        }
        Insert: {
          alert_count?: number
          assignee?: string | null
          category?: string | null
          category_id?: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          channel_name?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_agent_message_at?: string | null
          last_alerted_at?: string | null
          last_client_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          llm_last_decision?: Json
          llm_summary?: string | null
          opened_at?: string | null
          opened_by_name?: string | null
          opened_by_phone?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_breached?: boolean | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tags?: string[] | null
          team?: Database["public"]["Enums"]["team_type"]
          thread_key?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Update: {
          alert_count?: number
          assignee?: string | null
          category?: string | null
          category_id?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          channel_name?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_agent_message_at?: string | null
          last_alerted_at?: string | null
          last_client_message_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          llm_last_decision?: Json
          llm_summary?: string | null
          opened_at?: string | null
          opened_by_name?: string | null
          opened_by_phone?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_breached?: boolean | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          tags?: string[] | null
          team?: Database["public"]["Enums"]["team_type"]
          thread_key?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_whatsapp_group_id_fkey"
            columns: ["whatsapp_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string
          contact_product_id: string | null
          created_at: string
          description: string | null
          due_date: string
          id: string
          installment_number: number | null
          metadata: Json | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          total_installments: number | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          contact_product_id?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          installment_number?: number | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          total_installments?: number | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          contact_product_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          installment_number?: number | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          total_installments?: number | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_product_id_fkey"
            columns: ["contact_product_id"]
            isOneToOne: false
            referencedRelation: "contact_products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_modules: {
        Row: {
          created_at: string
          id: string
          module: Database["public"]["Enums"]["module_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["module_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["module_type"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_engagement: {
        Row: {
          contact_id: string
          created_at: string
          first_message_at: string | null
          group_id: string
          id: string
          last_message_at: string | null
          message_count: number | null
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          first_message_at?: string | null
          group_id: string
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          first_message_at?: string | null
          group_id?: string
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_engagement_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_engagement_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_members: {
        Row: {
          contact_id: string | null
          created_at: string
          group_id: string
          id: string
          is_admin: boolean | null
          joined_at: string | null
          name: string | null
          phone: string | null
          profile_id: string | null
          whatsapp_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          group_id: string
          id?: string
          is_admin?: boolean | null
          joined_at?: string | null
          name?: string | null
          phone?: string | null
          profile_id?: string | null
          whatsapp_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          group_id?: string
          id?: string
          is_admin?: boolean | null
          joined_at?: string | null
          name?: string | null
          phone?: string | null
          profile_id?: string | null
          whatsapp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          cohort: string | null
          created_at: string
          group_type: Database["public"]["Enums"]["whatsapp_group_type"]
          id: string
          instance_id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          product: Database["public"]["Enums"]["product_type"] | null
          purposes: string[] | null
          updated_at: string
          whatsapp_id: string
        }
        Insert: {
          cohort?: string | null
          created_at?: string
          group_type?: Database["public"]["Enums"]["whatsapp_group_type"]
          id?: string
          instance_id: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          product?: Database["public"]["Enums"]["product_type"] | null
          purposes?: string[] | null
          updated_at?: string
          whatsapp_id: string
        }
        Update: {
          cohort?: string | null
          created_at?: string
          group_type?: Database["public"]["Enums"]["whatsapp_group_type"]
          id?: string
          instance_id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          product?: Database["public"]["Enums"]["product_type"] | null
          purposes?: string[] | null
          updated_at?: string
          whatsapp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          phone_number: string | null
          status: string | null
          teams: Database["public"]["Enums"]["team_type"][]
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          phone_number?: string | null
          status?: string | null
          teams?: Database["public"]["Enums"]["team_type"][]
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          phone_number?: string | null
          status?: string | null
          teams?: Database["public"]["Enums"]["team_type"][]
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string
          group_id: string | null
          id: string
          instance_id: string
          is_from_me: boolean | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          reply_to: string | null
          sender_name: string | null
          sender_phone: string | null
          sent_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          instance_id: string
          is_from_me?: boolean | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          reply_to?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          instance_id?: string
          is_from_me?: boolean | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          reply_to?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_readonly_sql: { Args: { sql_query: string }; Returns: Json }
      get_pending_response_conversations: {
        Args: { minutes_threshold?: number; team_filter?: string }
        Returns: {
          active_tickets: number
          channel_name: string
          channel_type: string
          contact_name: string
          group_name: string
          id: string
          last_client_message_at: string
          last_message: string
          minutes_waiting: number
          ticket_subject: string
        }[]
      }
      get_support_metrics: { Args: { team_filter?: string }; Returns: Json }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_severity: "danger" | "warning" | "success" | "info"
      app_role:
        | "admin"
        | "vendedor"
        | "cs"
        | "marketing"
        | "financeiro"
        | "operacoes"
        | "suporte"
      badge_type: "vip" | "high-ltv" | "whale" | "churn-risk" | "new" | "upsell"
      campaign_platform: "google" | "meta" | "linkedin" | "tiktok"
      campaign_status: "ativo" | "pausado" | "finalizado"
      checkin_status: "pendente" | "concluido" | "cancelado"
      checkin_type: "onboarding" | "quarterly" | "renewal" | "upsell" | "risk"
      contact_status: "lead" | "qualified" | "customer" | "churned"
      contact_type: "person" | "company"
      cs_status: "active" | "paused" | "churned"
      deal_status: "negotiation" | "proposal_sent" | "won" | "lost"
      health_status: "healthy" | "alert" | "monitoring" | "risk"
      interaction_type:
        | "click"
        | "form"
        | "call"
        | "email"
        | "whatsapp"
        | "meeting"
        | "login"
        | "payment"
        | "message"
      journey_stage:
        | "pending_onboard"
        | "onboard_scheduled"
        | "onboard_done"
        | "monitoring_7d"
        | "ongoing"
        | "success"
      lead_status:
        | "captura"
        | "qualificacao"
        | "agendamento"
        | "negociacao"
        | "fechado"
        | "perdido"
      member_role: "sponsor" | "executor" | "viewer"
      member_status: "active" | "inactive" | "pending"
      module_type:
        | "cockpit"
        | "growth"
        | "comercial"
        | "clientes"
        | "financeiro"
        | "operacoes"
        | "cs"
        | "suporte"
      nps_category: "promoter" | "passive" | "detractor"
      objective_status: "pending" | "in_progress" | "completed" | "overdue"
      onboarding_status: "pending" | "in_progress" | "completed"
      organization_status: "active" | "inactive" | "churned"
      organization_type: "individual" | "company"
      payment_method:
        | "pix"
        | "boleto"
        | "cartao"
        | "recorrencia"
        | "transferencia"
        | "outro"
      payment_status: "ativo" | "atrasado" | "cancelado"
      product_status: "ativo" | "concluido" | "cancelado" | "pendente"
      product_type: "imersao" | "pain" | "saas" | "servicos"
      sentiment_type: "positive" | "neutral" | "negative"
      task_priority: "low" | "medium" | "high"
      task_status: "todo" | "doing" | "done"
      team_type: "suporte" | "cs" | "comercial" | "interno"
      ticket_channel:
        | "whatsapp_individual"
        | "whatsapp_grupo"
        | "email"
        | "chat"
      ticket_priority: "baixa" | "media" | "alta" | "urgente"
      ticket_status:
        | "novo"
        | "em_atendimento"
        | "aguardando_cliente"
        | "resolvido"
      touchpoint_channel:
        | "whatsapp"
        | "call"
        | "email"
        | "zoom"
        | "presential"
        | "in_app"
      touchpoint_type: "proactive" | "reactive"
      transaction_status: "pago" | "pendente" | "atrasado" | "cancelado"
      transaction_type: "receita" | "despesa"
      whatsapp_group_type: "customer" | "internal" | "product" | "mixed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["danger", "warning", "success", "info"],
      app_role: [
        "admin",
        "vendedor",
        "cs",
        "marketing",
        "financeiro",
        "operacoes",
        "suporte",
      ],
      badge_type: ["vip", "high-ltv", "whale", "churn-risk", "new", "upsell"],
      campaign_platform: ["google", "meta", "linkedin", "tiktok"],
      campaign_status: ["ativo", "pausado", "finalizado"],
      checkin_status: ["pendente", "concluido", "cancelado"],
      checkin_type: ["onboarding", "quarterly", "renewal", "upsell", "risk"],
      contact_status: ["lead", "qualified", "customer", "churned"],
      contact_type: ["person", "company"],
      cs_status: ["active", "paused", "churned"],
      deal_status: ["negotiation", "proposal_sent", "won", "lost"],
      health_status: ["healthy", "alert", "monitoring", "risk"],
      interaction_type: [
        "click",
        "form",
        "call",
        "email",
        "whatsapp",
        "meeting",
        "login",
        "payment",
        "message",
      ],
      journey_stage: [
        "pending_onboard",
        "onboard_scheduled",
        "onboard_done",
        "monitoring_7d",
        "ongoing",
        "success",
      ],
      lead_status: [
        "captura",
        "qualificacao",
        "agendamento",
        "negociacao",
        "fechado",
        "perdido",
      ],
      member_role: ["sponsor", "executor", "viewer"],
      member_status: ["active", "inactive", "pending"],
      module_type: [
        "cockpit",
        "growth",
        "comercial",
        "clientes",
        "financeiro",
        "operacoes",
        "cs",
        "suporte",
      ],
      nps_category: ["promoter", "passive", "detractor"],
      objective_status: ["pending", "in_progress", "completed", "overdue"],
      onboarding_status: ["pending", "in_progress", "completed"],
      organization_status: ["active", "inactive", "churned"],
      organization_type: ["individual", "company"],
      payment_method: [
        "pix",
        "boleto",
        "cartao",
        "recorrencia",
        "transferencia",
        "outro",
      ],
      payment_status: ["ativo", "atrasado", "cancelado"],
      product_status: ["ativo", "concluido", "cancelado", "pendente"],
      product_type: ["imersao", "pain", "saas", "servicos"],
      sentiment_type: ["positive", "neutral", "negative"],
      task_priority: ["low", "medium", "high"],
      task_status: ["todo", "doing", "done"],
      team_type: ["suporte", "cs", "comercial", "interno"],
      ticket_channel: [
        "whatsapp_individual",
        "whatsapp_grupo",
        "email",
        "chat",
      ],
      ticket_priority: ["baixa", "media", "alta", "urgente"],
      ticket_status: [
        "novo",
        "em_atendimento",
        "aguardando_cliente",
        "resolvido",
      ],
      touchpoint_channel: [
        "whatsapp",
        "call",
        "email",
        "zoom",
        "presential",
        "in_app",
      ],
      touchpoint_type: ["proactive", "reactive"],
      transaction_status: ["pago", "pendente", "atrasado", "cancelado"],
      transaction_type: ["receita", "despesa"],
      whatsapp_group_type: ["customer", "internal", "product", "mixed"],
    },
  },
} as const
