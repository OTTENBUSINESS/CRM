-- =====================================================================
-- FIX: meetings.activity_id travava exclusão de tarefas
-- =====================================================================
-- A FK meetings_activity_id_fkey era NO ACTION: com o fluxo "Sala própria"
-- criando meetings vinculadas à tarefa, excluir a tarefa dava erro
-- ("Erro ao excluir tarefa"). Agora ON DELETE SET NULL: a reunião (e a
-- gravação) sobrevivem; só o vínculo com a tarefa é limpo.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_activity_id_fkey;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES public.company_activities(id) ON DELETE SET NULL;
