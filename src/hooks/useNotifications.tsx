import React, { useEffect, useState, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth, TeamMember } from '@/contexts/AuthContext';
import { ToastAction } from '@/components/ui/toast';

// Navegação client-side sem depender do useNavigate (que exige BrowserRouter acima)
// Dispara evento customizado que é escutado pelo NavigationListener dentro do BrowserRouter
function navigateTo(url: string) {
  window.dispatchEvent(new CustomEvent('app-navigate', { detail: url }));
}

// Som de notificação (pode ser substituído por um arquivo de áudio personalizado)
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// Re-exportar call mode do módulo isolado (para quem já importava daqui)
export { setCallMode, isCallModeActive } from '@/lib/call-mode';

// Importar para uso local
import { isCallModeActive as _isCallModeActive } from '@/lib/call-mode';
import { isNotificationsMuted } from '@/lib/notification-mute';

// Solicitar permissão para notificações do navegador
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// Tocar som de notificação (silenciado durante call mode ou mute manual)
function playNotificationSound() {
  if (_isCallModeActive() || isNotificationsMuted()) return;
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Ignora erro se não conseguir tocar (ex: autoplay bloqueado)
    });
  } catch (e) {
    // Ignora erro
  }
}

// Enviar notificação do navegador (silenciada durante call mode ou mute manual)
function sendBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (_isCallModeActive() || isNotificationsMuted()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'whatsapp-message',
    renotify: true,
  });

  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }

  // Auto-close after 10 seconds
  setTimeout(() => notification.close(), 10000);
}

export interface Notification {
  id: string;
  type: 'onboarding_completed' | 'task_due' | 'task_created' | 'client_risk' | 'general' | 'whatsapp_message';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
  data?: Record<string, any>;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadWhatsAppCount, setUnreadWhatsAppCount] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, teamMember } = useAuth();
  const hasRequestedPermissionRef = useRef(false);

  // Solicitar permissão de notificação do navegador na primeira vez
  useEffect(() => {
    if (!hasRequestedPermissionRef.current && user) {
      hasRequestedPermissionRef.current = true;
      requestNotificationPermission();
    }
  }, [user]);

  // Adicionar notificação
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'read' | 'created_at'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      created_at: new Date().toISOString(),
    };

    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Manter últimas 50
    setUnreadCount(prev => prev + 1);

    // Criar action se houver link (especialmente para WhatsApp)
    // Usa navigate() do React Router para navegação client-side (não recarrega a página)
    // Isso preserva o estado do app, incluindo chamadas WaVoIP ativas
    const toastAction = notification.link
      ? React.createElement(ToastAction, {
          altText: 'Ver',
          onClick: () => {
            navigateTo(notification.link!);
          },
          className: 'bg-green-500 hover:bg-green-600 text-white border-0',
        }, 'Ver conversa')
      : undefined;

    // Mostrar toast (suprimido se muted — notificação ainda vai pro bell)
    if (!isNotificationsMuted()) {
      toast({
        title: notification.title,
        description: notification.message,
        duration: 10000,
        action: toastAction,
      });
    }

    return newNotification;
  }, [toast]);

  // Marcar como lida
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Marcar todas como lidas
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  // Limpar notificações
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Escutar criação de tarefas em tempo real
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('task-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'company_activities',
        },
        async (payload) => {
          const newTask = payload.new as any;

          // Buscar dados do responsável para verificar se é o usuário atual
          // e buscar nome do lead/organização
          const { data: task } = await supabase
            .from('company_activities')
            .select(`
              *,
              responsavel:team_members!company_activities_responsavel_id_fkey(id, name, auth_user_id),
              lead:leads!company_activities_lead_id_fkey(id, name),
              organization:organizations!company_activities_organization_id_fkey(id, name)
            `)
            .eq('id', newTask.id)
            .single();

          if (!task) return;

          // Só notificar o responsável pela tarefa
          // FIX: team_members usa auth_user_id, não user_id (campo não existia, filtro estava sempre falso)
          const isResponsavel = task.responsavel?.auth_user_id === user.id;
          if (!isResponsavel) return;

          const clientName = task.lead?.name || task.organization?.name || '';
          const taskTypeLabels: Record<string, string> = {
            call: "Ligação",
            whatsapp: "WhatsApp",
            email: "Email",
            meeting: "Reunião",
            onboarding: "Onboarding",
            follow_up: "Follow-up",
            support: "Suporte",
            checkin: "Check-in",
          };
          const taskLabel = taskTypeLabels[task.task_type] || task.task_type;

          addNotification({
            type: 'task_created',
            title: `📋 Nova Tarefa: ${taskLabel}`,
            message: `${task.name}${clientName ? ` - ${clientName}` : ''}`,
            link: '/tarefas',
            data: {
              task_id: task.id,
              task_type: task.task_type,
              responsavel_id: task.responsavel_id,
            },
          });

          // Invalidar queries de tarefas
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, addNotification, queryClient]);

  // Escutar mudanças em tempo real nos onboardings
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('onboarding-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'onboardings',
        },
        async (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          // Verificar se o status mudou para client_completed (cliente preencheu formulário)
          if (
            oldRecord.status !== 'client_completed' &&
            newRecord.status === 'client_completed'
          ) {
            // Buscar dados da organização
            const { data: onboarding } = await supabase
              .from('onboardings')
              .select('*, organization:organizations(id, name)')
              .eq('id', newRecord.id)
              .single();

            const orgName = onboarding?.organization?.name || 'Cliente';

            addNotification({
              type: 'onboarding_completed',
              title: '🎉 Formulário Preenchido!',
              message: `${orgName} completou o formulário de onboarding`,
              link: `/clientes/${onboarding?.organization?.id}?tab=onboarding`,
              data: {
                onboarding_id: newRecord.id,
                organization_id: onboarding?.organization?.id,
                organization_name: orgName,
              },
            });

            // Invalidar queries relacionadas
            queryClient.invalidateQueries({ queryKey: ['pending-onboarding-approvals'] });
            queryClient.invalidateQueries({ queryKey: ['onboardings'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          }

          // Verificar se mudou para pending_review (após processar transcrição)
          if (
            oldRecord.status !== 'pending_review' &&
            newRecord.status === 'pending_review'
          ) {
            const { data: onboarding } = await supabase
              .from('onboardings')
              .select('*, organization:organizations(id, name)')
              .eq('id', newRecord.id)
              .single();

            const orgName = onboarding?.organization?.name || 'Cliente';

            addNotification({
              type: 'onboarding_completed',
              title: '📋 Dossiê Pronto para Revisão',
              message: `O dossiê de ${orgName} está pronto para aprovação`,
              link: `/clientes/${onboarding?.organization?.id}?tab=onboarding`,
              data: {
                onboarding_id: newRecord.id,
                organization_id: onboarding?.organization?.id,
                organization_name: orgName,
              },
            });

            queryClient.invalidateQueries({ queryKey: ['pending-onboarding-approvals'] });
            queryClient.invalidateQueries({ queryKey: ['onboardings'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, addNotification, queryClient]);

  // Escutar novas mensagens de WhatsApp em tempo real
  useEffect(() => {
    if (!user || !teamMember) return;

    const channel = supabase
      .channel('whatsapp-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: 'is_from_me=eq.false', // Apenas mensagens recebidas (do cliente)
        },
        async (payload) => {
          const newMessage = payload.new as any;

          // Ignorar mensagens de grupo
          if (newMessage.group_id) return;

          // ========== FILTRO POR INSTÂNCIA ==========
          // Se eu tenho uma instância de WhatsApp vinculada, só notificar
          // mensagens que vieram pela minha instância
          const myInstanceId = teamMember.whatsapp_instance_id;
          if (myInstanceId && newMessage.instance_id && newMessage.instance_id !== myInstanceId) {
            // Mensagem veio de outra instância - não notificar
            return;
          }
          // ==========================================

          // Buscar dados do lead
          const { data: lead } = await supabase
            .from('leads')
            .select('id, name, phone, sales_rep_id')
            .eq('id', newMessage.lead_id)
            .single();

          // ========== FILTRO POR DONO ==========
          // FIX: TODO mundo só recebe notificação dos PRÓPRIOS leads (incluindo admin)
          // CS recebe leads que não são do comercial (não têm sales_rep_id)
          const myTeam = teamMember.team;
          const isMyLead = lead?.sales_rep_id === teamMember.id;
          const isUnassignedLead = !lead?.sales_rep_id;

          if (myTeam === 'cs') {
            // CS só recebe leads SEM sales_rep (não são do comercial)
            if (!isUnassignedLead) {
              return;
            }
          } else {
            // Todo mundo (admin, comercial, closer, sdr) só recebe os próprios
            if (!isMyLead) {
              return;
            }
          }
          // =====================================

          const senderName = lead?.name || newMessage.sender_name || newMessage.sender_phone || 'Cliente';
          const messagePreview = newMessage.content?.slice(0, 80) || '[Mídia]';

          // Incrementar contador de WhatsApp não lido
          setUnreadWhatsAppCount(prev => prev + 1);

          // Determinar link baseado no time do USUÁRIO atual, não do lead
          // Assim comercial sempre vai para inbox comercial, CS sempre para inbox CS
          const inboxUrl = myTeam === 'comercial' || myTeam === 'admin'
            ? `/comercial/inbox?lead=${newMessage.lead_id}`
            : `/inbox?lead=${newMessage.lead_id}`;

          // Adicionar notificação
          addNotification({
            type: 'whatsapp_message',
            title: `💬 ${senderName}`,
            message: messagePreview,
            link: inboxUrl,
            data: {
              lead_id: newMessage.lead_id,
              message_id: newMessage.id,
              sender_phone: newMessage.sender_phone,
            },
          });

          // Tocar som
          playNotificationSound();

          // Enviar notificação do navegador (quando aba não está ativa)
          // Usa navigate() para não recarregar a página e manter chamadas ativas
          if (document.hidden) {
            sendBrowserNotification(
              `💬 Nova mensagem de ${senderName}`,
              messagePreview,
              () => {
                navigateTo(inboxUrl);
              }
            );
          }

          // Invalidar queries de mensagens e leads
          queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, teamMember, addNotification, queryClient]);

  // Escutar novos deals (leads novos no pipeline) para notificar SDR/closers
  useEffect(() => {
    if (!user || !teamMember) return;

    // Só notifica roles relevantes: sdr, closer, comercial, admin
    const notifyRoles = ['sdr', 'closer', 'comercial', 'admin'];
    if (!notifyRoles.includes(teamMember.role)) return;

    const channel = supabase
      .channel('new-deal-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deals',
        },
        async (payload) => {
          const newDeal = payload.new as any;

          // Suprimir se em call mode
          if (_isCallModeActive()) return;

          // FIX: Só notificar o dono do deal (TODOS, incluindo admin)
          // Antes: TODOS os vendedores recebiam notificação + som de qualquer deal novo
          if (newDeal.sales_rep_id !== teamMember.id) {
            return;
          }

          // Buscar nome do lead
          let leadName = 'Novo lead';
          if (newDeal.lead_id) {
            const { data: lead } = await supabase
              .from('leads')
              .select('name')
              .eq('id', newDeal.lead_id)
              .single();
            if (lead?.name) leadName = lead.name;
          }

          const dealValue = newDeal.negotiated_price
            ? ` - R$ ${Number(newDeal.negotiated_price).toLocaleString('pt-BR')}`
            : '';

          const dealUrl = `/comercial/pipeline`;

          addNotification({
            type: 'general',
            title: `🔔 Novo lead no pipeline`,
            message: `${leadName}${dealValue}`,
            link: dealUrl,
            data: {
              deal_id: newDeal.id,
              lead_id: newDeal.lead_id,
            },
          });

          // Tocar som
          playNotificationSound();

          // Browser notification
          if (document.hidden) {
            sendBrowserNotification(
              '🔔 Novo lead no pipeline',
              `${leadName}${dealValue}`,
              () => navigateTo(dealUrl)
            );
          }

          // Invalidar pipeline para atualizar kanban
          queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
          queryClient.invalidateQueries({ queryKey: ['cockpit-queue'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, teamMember, addNotification, queryClient]);

  // Marcar WhatsApp como lido (quando abre o inbox)
  const markWhatsAppAsRead = useCallback(() => {
    setUnreadWhatsAppCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    unreadWhatsAppCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    markWhatsAppAsRead,
    clearNotifications,
  };
}

// Provider para compartilhar estado de notificações
interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  unreadWhatsAppCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'created_at'>) => Notification;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  markWhatsAppAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notificationState = useNotifications();

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
}
