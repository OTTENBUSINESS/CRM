import { Node, Edge } from '@xyflow/react';

export type FunnelNodeType =
  | 'acquisition'
  | 'landing'
  | 'conversion'
  | 'retention'
  | 'decision'
  | 'action';

export type AcquisitionChannel =
  | 'facebook'
  | 'instagram'
  | 'google'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'email'
  | 'organic'
  | 'other';

export interface AcquisitionNodeData {
  label: string;
  channel: AcquisitionChannel;
  metrics?: {
    impressions?: number;
    clicks?: number;
    cost?: number;
    ctr?: number;
  };
}

export interface LandingNodeData {
  label: string;
  type: 'landing_page' | 'popup' | 'form' | 'video';
  url?: string;
  conversionRate?: number;
}

export interface ConversionNodeData {
  label: string;
  type: 'checkout' | 'payment' | 'registration' | 'booking';
  platform?: string;
  conversionRate?: number;
}

export interface RetentionNodeData {
  label: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'push';
  automationType?: 'immediate' | 'delayed' | 'scheduled';
}

export interface DecisionNodeData {
  label: string;
  condition: string;
}

export interface ActionNodeData {
  label: string;
  description?: string;
}

export type FunnelNodeData =
  | AcquisitionNodeData
  | LandingNodeData
  | ConversionNodeData
  | RetentionNodeData
  | DecisionNodeData
  | ActionNodeData;

export interface FunnelData {
  nodes: Node[];
  edges: Edge[];
}

export interface ProjectFunnel {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  funnel_data: FunnelData;
  created_at: string;
  updated_at: string;
}
