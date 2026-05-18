import { useState } from 'react';
import { CoachPlaybookList } from './CoachPlaybookList';
import { CoachPlaybookForm } from './CoachPlaybookForm';
import type { CoachPlaybook } from '@/types/coach.types';

type ViewMode = 'list' | 'create' | 'edit';

export function CoachPlaybooksTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPlaybook, setSelectedPlaybook] = useState<CoachPlaybook | null>(null);

  const handleEdit = (playbook: CoachPlaybook) => {
    setSelectedPlaybook(playbook);
    setViewMode('edit');
  };

  const handleCreate = () => {
    setSelectedPlaybook(null);
    setViewMode('create');
  };

  const handleBack = () => {
    setSelectedPlaybook(null);
    setViewMode('list');
  };

  if (viewMode === 'list') {
    return <CoachPlaybookList onEdit={handleEdit} onCreate={handleCreate} />;
  }

  return <CoachPlaybookForm playbook={selectedPlaybook} onBack={handleBack} />;
}
