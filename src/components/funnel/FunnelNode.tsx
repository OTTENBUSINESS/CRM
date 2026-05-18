import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Facebook,
  Instagram,
  Mail,
  Globe,
  ShoppingCart,
  MessageCircle,
  FileText,
  Video,
  CheckCircle,
  Zap,
  Pencil,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mapa de icones por canal/tipo
const iconMap: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  google: <Globe className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
  checkout: <ShoppingCart className="h-4 w-4" />,
  landing_page: <FileText className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  conversion: <CheckCircle className="h-4 w-4" />,
  action: <Zap className="h-4 w-4" />,
};

// Cores por tipo de node
const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
  acquisition: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700' },
  landing: { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-700' },
  conversion: { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-700' },
  retention: { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700' },
  decision: { bg: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-700' },
  action: { bg: 'bg-gray-50', border: 'border-gray-500', text: 'text-gray-700' },
};

interface FunnelNodeData {
  label: string;
  type: string;
  channel?: string;
  icon?: string;
  metrics?: {
    value?: string | number;
    label?: string;
  };
}

export const FunnelNode = memo(({ data, selected, id }: NodeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const nodeData = data as unknown as FunnelNodeData;
  const nodeType = nodeData.type || 'action';
  const colors = nodeColors[nodeType] || nodeColors.action;
  const icon = iconMap[nodeData.channel || nodeData.icon || nodeType] || iconMap.action;

  return (
    <>
      <Handle type="target" position={Position.Left} className="w-3 h-3" />

      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative"
      >
        <Card
          className={cn(
            'min-w-[180px] border-2 transition-all',
            colors.bg,
            colors.border,
            selected && 'ring-2 ring-primary ring-offset-2'
          )}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('p-1.5 rounded', colors.bg)}>
                {icon}
              </div>
              <span className={cn('font-semibold text-sm flex-1', colors.text)}>
                {nodeData.label}
              </span>
            </div>

            {nodeData.metrics && (
              <div className="mt-2 pt-2 border-t border-current/20">
                <div className="text-xs text-muted-foreground">
                  {nodeData.metrics.label}: <span className="font-semibold">{nodeData.metrics.value}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Botoes de acao aparecem no hover */}
        {isHovered && (
          <div className="absolute -top-2 -right-2 flex gap-1">
            <Button
              size="icon"
              variant="secondary"
              className="h-6 w-6 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                // Dispatch custom event para abrir dialog de edicao
                window.dispatchEvent(new CustomEvent('editNode', { detail: { id, data: nodeData } }));
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-6 w-6 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                // Dispatch custom event para deletar
                window.dispatchEvent(new CustomEvent('deleteNode', { detail: { id } }));
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </>
  );
});

FunnelNode.displayName = 'FunnelNode';

// Node de decisao (losango)
export const DecisionNode = memo(({ data, selected, id }: NodeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const nodeData = data as unknown as FunnelNodeData;

  return (
    <>
      <Handle type="target" position={Position.Left} className="w-3 h-3" />

      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative"
      >
        <div
          className={cn(
            'relative w-32 h-32 flex items-center justify-center',
            selected && 'ring-2 ring-primary ring-offset-2 rounded'
          )}
        >
          <div className="absolute inset-0 bg-yellow-100 border-2 border-yellow-500 transform rotate-45" />
          <div className="relative z-10 text-center px-4">
            <p className="text-xs font-semibold text-yellow-700">{nodeData.label}</p>
          </div>
        </div>

        {/* Botoes de acao aparecem no hover */}
        {isHovered && (
          <div className="absolute -top-2 -right-2 flex gap-1 z-20">
            <Button
              size="icon"
              variant="secondary"
              className="h-6 w-6 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('editNode', { detail: { id, data: nodeData } }));
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-6 w-6 rounded-full shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('deleteNode', { detail: { id } }));
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </>
  );
});

DecisionNode.displayName = 'DecisionNode';
