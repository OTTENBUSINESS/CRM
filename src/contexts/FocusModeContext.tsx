import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/contexts/CallContext';
import { useFocusQueue, FocusItem } from '@/hooks/useFocusQueue';

interface FocusModeContextType {
  isActive: boolean;
  currentItem: FocusItem | null;
  queue: FocusItem[];
  queuePosition: number;
  totalItems: number;

  completeItem: () => void;
  skipItem: () => void;
  showLeadDetail: (leadId: string) => void;
  hideLeadDetail: () => void;
  dismiss: () => void;

  isShowingLeadDetail: boolean;
  detailLeadId: string | null;
  isShowingInlineChat: boolean;
  inlineChatLeadId: string | null;
  inlineChatLeadName: string | null;
  inlineChatLeadPhone: string | null;
  showInlineChat: (leadId: string, name: string, phone: string | null) => void;
  hideInlineChat: () => void;
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const { teamMember } = useAuth();
  const { activeCall } = useCall();
  const isComercial = teamMember?.team === 'comercial';
  const focusEnabled = !!teamMember?.focus_mode_enabled;

  const { data: queue = [] } = useFocusQueue(
    isComercial && focusEnabled ? teamMember?.id : undefined
  );

  const [dismissed, setDismissed] = useState(false);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [isShowingLeadDetail, setIsShowingLeadDetail] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [isShowingInlineChat, setIsShowingInlineChat] = useState(false);
  const [inlineChatLeadId, setInlineChatLeadId] = useState<string | null>(null);
  const [inlineChatLeadName, setInlineChatLeadName] = useState<string | null>(null);
  const [inlineChatLeadPhone, setInlineChatLeadPhone] = useState<string | null>(null);

  // Filter queue to only non-processed items
  const activeQueue = queue.filter(item => !processedIds.has(item.id));
  const currentItem = activeQueue[0] || null;
  const queuePosition = activeQueue.length > 0 ? queue.length - activeQueue.length + 1 : 0;

  // Determine if overlay should be active (stays visible during calls — call modals layer above)
  const isActive = focusEnabled && isComercial && !dismissed && activeQueue.length > 0;

  // When call ends, reactivate overlay (unless dismissed)
  const hasCall = !!activeCall;
  useEffect(() => {
    if (!hasCall && focusEnabled && isComercial && activeQueue.length > 0) {
      setDismissed(false);
    }
  }, [hasCall]);

  // When new items appear in queue (polling detected new leads), reactivate
  useEffect(() => {
    if (queue.length > 0 && focusEnabled && isComercial && !hasCall) {
      setDismissed(false);
    }
  }, [queue.length]);

  const completeItem = useCallback(() => {
    if (currentItem) {
      setProcessedIds(prev => new Set(prev).add(currentItem.id));
    }
    setIsShowingLeadDetail(false);
    setDetailLeadId(null);
    setIsShowingInlineChat(false);
    setInlineChatLeadId(null);
    setInlineChatLeadName(null);
    setInlineChatLeadPhone(null);
  }, [currentItem]);

  const skipItem = useCallback(() => {
    if (currentItem) {
      setProcessedIds(prev => new Set(prev).add(currentItem.id));
    }
    setIsShowingLeadDetail(false);
    setDetailLeadId(null);
    setIsShowingInlineChat(false);
  }, [currentItem]);

  const showLeadDetail = useCallback((leadId: string) => {
    setDetailLeadId(leadId);
    setIsShowingLeadDetail(true);
    setIsShowingInlineChat(false);
  }, []);

  const hideLeadDetail = useCallback(() => {
    setIsShowingLeadDetail(false);
    setDetailLeadId(null);
  }, []);

  const showInlineChat = useCallback((leadId: string, name: string, phone: string | null) => {
    setInlineChatLeadId(leadId);
    setInlineChatLeadName(name);
    setInlineChatLeadPhone(phone);
    setIsShowingInlineChat(true);
    setIsShowingLeadDetail(false);
  }, []);

  const hideInlineChat = useCallback(() => {
    setIsShowingInlineChat(false);
    setInlineChatLeadId(null);
    setInlineChatLeadName(null);
    setInlineChatLeadPhone(null);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setIsShowingLeadDetail(false);
    setDetailLeadId(null);
    setIsShowingInlineChat(false);
  }, []);

  return (
    <FocusModeContext.Provider value={{
      isActive,
      currentItem,
      queue: activeQueue,
      queuePosition,
      totalItems: queue.length,
      completeItem,
      skipItem,
      showLeadDetail,
      hideLeadDetail,
      dismiss,
      isShowingLeadDetail,
      detailLeadId,
      isShowingInlineChat,
      inlineChatLeadId,
      inlineChatLeadName,
      inlineChatLeadPhone,
      showInlineChat,
      hideInlineChat,
    }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  const context = useContext(FocusModeContext);
  if (context === undefined) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return context;
}
