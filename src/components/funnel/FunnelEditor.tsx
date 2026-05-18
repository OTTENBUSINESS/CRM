import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Plus, Save, Loader2 } from 'lucide-react';
import { FunnelNode, DecisionNode } from './FunnelNode';
import NodeEditDialog from './NodeEditDialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FunnelData } from '@/types/funnel.types';

const db = supabase as any;

const nodeTypes = {
  funnel: FunnelNode,
  decision: DecisionNode,
};

interface FunnelEditorProps {
  projectId: string;
}

function FunnelEditorContent({ projectId }: FunnelEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [funnelId, setFunnelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { setViewport } = useReactFlow();

  // Estados para edicao de node
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeData, setEditingNodeData] = useState<any>(null);

  // Carregar funil existente
  useEffect(() => {
    loadFunnel();
  }, [projectId]);

  // Event listeners para editar e deletar nodes
  useEffect(() => {
    const handleEditNode = (e: any) => {
      const { id, data } = e.detail;
      setEditingNodeId(id);
      setEditingNodeData(data);
      setEditDialogOpen(true);
    };

    const handleDeleteNode = (e: any) => {
      const { id } = e.detail;
      setNodes((nds) => nds.filter((node) => node.id !== id));
      toast.success('Etapa removida');
    };

    window.addEventListener('editNode', handleEditNode);
    window.addEventListener('deleteNode', handleDeleteNode);

    return () => {
      window.removeEventListener('editNode', handleEditNode);
      window.removeEventListener('deleteNode', handleDeleteNode);
    };
  }, [setNodes]);

  const loadFunnel = async () => {
    try {
      const { data, error } = await db
        .from('project_funnels')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const funnel = data[0];
        setFunnelId(funnel.id);
        const funnelData = funnel.funnel_data as FunnelData;

        console.log('Funil carregado:', funnelData);

        setNodes(funnelData.nodes || []);
        setEdges(funnelData.edges || []);
      } else {
        // Criar funil inicial vazio
        createInitialFunnel();
      }
    } catch (error) {
      console.error('Erro ao carregar funil:', error);
      toast.error('Erro ao carregar funil');
    } finally {
      setLoading(false);
    }
  };

  const createInitialFunnel = async () => {
    const initialNodes = [
      {
        id: 'start',
        type: 'funnel',
        position: { x: 100, y: 100 },
        data: {
          label: 'Inicio',
          type: 'action',
          icon: 'action',
        },
      },
    ];

    try {
      const { data, error } = await db
        .from('project_funnels')
        .insert({
          project_id: projectId,
          name: 'Funil Principal',
          funnel_data: {
            nodes: initialNodes,
            edges: [],
          },
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setFunnelId(data.id);
        setNodes(initialNodes);
      }
    } catch (error) {
      console.error('Erro ao criar funil:', error);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleSave = async () => {
    if (!funnelId) return;

    setSaving(true);
    try {
      const { error } = await db
        .from('project_funnels')
        .update({
          funnel_data: {
            nodes,
            edges,
          },
        })
        .eq('id', funnelId);

      if (error) throw error;

      toast.success('Funil salvo com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar funil:', error);
      toast.error('Erro ao salvar funil');
    } finally {
      setSaving(false);
    }
  };

  const addNode = (type: string) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: type === 'decision' ? 'decision' : 'funnel',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: type === 'decision' ? 'Decisao?' : 'Nova Etapa',
        type: type,
        icon: type,
      },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  // Funcao para deletar nodes selecionados
  const onNodesDelete = useCallback((deleted: any[]) => {
    console.log('Nodes deletados:', deleted);
  }, []);

  const onEdgesDelete = useCallback((deleted: any[]) => {
    console.log('Edges deletadas:', deleted);
  }, []);

  // Funcao para salvar edicao de node
  const handleSaveNodeEdit = (nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: newData };
        }
        return node;
      })
    );
    toast.success('Etapa atualizada!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[600px] border rounded-lg bg-background relative">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>

        <div className="flex gap-1 ml-2">
          <Button onClick={() => addNode('acquisition')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Aquisicao
          </Button>
          <Button onClick={() => addNode('landing')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Landing
          </Button>
          <Button onClick={() => addNode('conversion')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Conversao
          </Button>
          <Button onClick={() => addNode('retention')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Retencao
          </Button>
          <Button onClick={() => addNode('decision')} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Decisao
          </Button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
        className="bg-background"
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

      {/* Dialog de edicao de node */}
      <NodeEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        nodeId={editingNodeId}
        nodeData={editingNodeData}
        onSave={handleSaveNodeEdit}
      />
    </div>
  );
}

export default function FunnelEditor({ projectId }: FunnelEditorProps) {
  return (
    <ReactFlowProvider>
      <FunnelEditorContent projectId={projectId} />
    </ReactFlowProvider>
  );
}
