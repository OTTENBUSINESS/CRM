/**
 * AgentOrgChartPage — organograma de agentes via ReactFlow.
 * Rota: /agentes/organograma
 *
 * Adaptado do /gestao/organograma (HumanNode/AINode) mas:
 * - Nodes vêm do banco (agents_registry) não hardcoded
 * - Clica no nó → drawer com prompt + tools + ações
 * - Hierarquia via parent_agent_id + tier
 */

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, Handle, Position, NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Bot, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAgentsList, type AgentConfig } from '../hooks/useAgentConfig';
import { AgentDetailDrawer } from '../components/AgentDetailDrawer';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { List, Network } from 'lucide-react';

/* ──────────── Custom Node ──────────── */

function AgentNodeView({ data, selected }: NodeProps<{ agent: AgentConfig; onClick: () => void }>) {
  const { agent, onClick } = data;
  const color = agent.avatar_color || 'amber';
  const colorMap: Record<string, string> = {
    amber: '#f97316', blue: '#3b82f6', green: '#10b981',
    red: '#ef4444', purple: '#a855f7', pink: '#ec4899',
    teal: '#14b8a6', gray: '#6b7280',
  };
  const borderColor = colorMap[color] || colorMap.amber;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 14,
        padding: 14,
        minWidth: 200,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: selected ? `0 0 0 2px ${borderColor}40` : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: borderColor, width: 7, height: 7, border: 'none' }} />

      {/* Online dot */}
      {agent.is_active && (
        <div
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 7, height: 7, borderRadius: '50%',
            background: '#22c55e',
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: `linear-gradient(135deg, ${borderColor}40, ${borderColor})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff', fontWeight: 600,
          }}
        >
          {agent.emoji || agent.display_name.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ textAlign: 'center', maxWidth: 180 }}>
          <div style={{ color: '#0a0a0a', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>
            {agent.display_name}
          </div>
          <div style={{ color: '#737373', fontSize: 11, marginTop: 2, lineHeight: 1.3 }}>
            {agent.description?.slice(0, 50) || 'Agente IA'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span
            style={{
              background: `${borderColor}20`,
              color: borderColor,
              fontSize: 9, fontWeight: 600,
              padding: '2px 8px', borderRadius: 999,
              letterSpacing: 0.5, textTransform: 'uppercase',
            }}
          >
            {agent.tier}
          </span>
          <span style={{ color: '#a3a3a3', fontSize: 10, fontFamily: 'monospace' }}>
            v{agent.version}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: borderColor, width: 7, height: 7, border: 'none' }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNodeView };

/* ──────────── Layout ──────────── */

const COL_W = 240;
const ROW_H = 200;

function buildGraph(agents: AgentConfig[], onClick: (a: AgentConfig) => void): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Agrupar por tier
  const ceos = agents.filter((a) => a.tier === 'ceo');
  const managers = agents.filter((a) => a.tier === 'manager');
  const specialists = agents.filter((a) => a.tier === 'specialist');

  // Layout simples: tiers em níveis Y, distribuir X uniformemente
  const layout = (group: AgentConfig[], y: number) => {
    const total = group.length;
    const startX = -((total - 1) / 2) * COL_W;
    group.forEach((agent, i) => {
      nodes.push({
        id: agent.id,
        type: 'agentNode',
        position: { x: startX + i * COL_W, y },
        data: { agent, onClick: () => onClick(agent) },
      });
    });
  };

  layout(ceos, 0);
  layout(managers, ROW_H);
  layout(specialists, ROW_H * 2);

  // Edges: parent → child
  for (const agent of agents) {
    if (agent.parent_agent_id) {
      edges.push({
        id: `${agent.parent_agent_id}-${agent.id}`,
        source: agent.parent_agent_id,
        target: agent.id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'rgba(249, 115, 22, 0.3)', strokeWidth: 1.5 },
      });
    } else if (agent.tier !== 'ceo' && ceos[0]) {
      // Sem parent explícito → conecta ao primeiro CEO
      edges.push({
        id: `${ceos[0].id}-${agent.id}`,
        source: ceos[0].id,
        target: agent.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: 'rgba(249, 115, 22, 0.15)', strokeWidth: 1, strokeDasharray: '4,4' },
      });
    }
  }

  return { nodes, edges };
}

/* ──────────── Page ──────────── */

export default function AgentOrgChartPage() {
  const { data: allAgents = [], isLoading } = useAgentsList();
  // Organograma mostra só agentes REAIS — templates (moldes) ficam de fora.
  const agents = useMemo(() => allAgents.filter((a) => !a.is_template), [allAgents]);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);

  const graph = useMemo(() => buildGraph(agents, (a) => setSelectedAgent(a)), [agents]);
  const [nodes, , onNodesChange] = useNodesState(graph.nodes);
  const [edges, , onEdgesChange] = useEdgesState(graph.edges);

  // Atualiza quando agents mudam
  useMemo(() => {
    const fresh = buildGraph(agents, (a) => setSelectedAgent(a));
    // @ts-expect-error react-flow internal
    setTimeout(() => { onNodesChange(fresh.nodes.map((n) => ({ type: 'reset', item: n }))); }, 0);
  }, [agents]);

  const onInit = useCallback((instance: any) => {
    setTimeout(() => instance.fitView({ padding: 0.2 }), 100);
  }, []);

  return (
    <AppLayout>
      <div style={{ width: '100%', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header com toggle de view */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Agentes IA</h1>
              <p className="text-xs text-muted-foreground">{agents.length} agentes ativos</p>
            </div>
          </div>

          {/* Toggle view */}
          <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
            <Button asChild variant="ghost" size="sm" className="h-7 px-3 hover:bg-background">
              <Link to="/agentes" className="gap-1.5 text-xs">
                <List className="h-3.5 w-3.5" /> Lista
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-3 bg-background shadow-sm">
              <span className="gap-1.5 text-xs flex items-center font-medium">
                <Network className="h-3.5 w-3.5 text-primary" /> Organograma
              </span>
            </Button>
          </div>
        </div>

        {/* ReactFlow */}
        <div style={{ flex: 1, background: '#fafaf9' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onInit={onInit}
              fitView
              minZoom={0.2} maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="rgba(0,0,0,0.04)" gap={32} size={1} />
              <Controls style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10 }} />
              <MiniMap
                style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10 }}
                nodeColor="#f97316"
                maskColor="rgba(255,255,255,0.7)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Drawer ao selecionar */}
        {selectedAgent && (
          <AgentDetailDrawer agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </div>
    </AppLayout>
  );
}
