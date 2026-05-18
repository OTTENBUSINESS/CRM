import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  useDealContacts,
  useAddDealContact,
  useUpdateDealContact,
  useRemoveDealContact,
  useSetPrimaryContact,
  CONTACT_ROLES,
} from "@/hooks/useDealContacts";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Plus,
  Star,
  MoreVertical,
  Trash2,
  Phone,
  Mail,
  UserPlus,
  Search,
  Crown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DealContactsTabProps {
  dealId: string;
  primaryLeadId?: string; // Lead principal do deal (se já tiver)
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function DealContactsTab({ dealId, primaryLeadId }: DealContactsTabProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", phone: "", email: "", instagram: "" });
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const { data: contacts, isLoading } = useDealContacts(dealId);
  const addContact = useAddDealContact();
  const updateContact = useUpdateDealContact();
  const removeContact = useRemoveDealContact();
  const setPrimary = useSetPrimaryContact();

  // Busca direta no banco com debounce
  const existingLeadIds = new Set(contacts?.map((c) => c.lead_id) || []);

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Limpar telefone para busca
        const cleanPhone = searchTerm.replace(/\D/g, "");
        const searchFilter = cleanPhone.length >= 4
          ? `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${cleanPhone}%`
          : `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`;

        const { data } = await supabase
          .from("leads")
          .select("id, name, email, phone")
          .or(searchFilter)
          .limit(20);

        const filtered = (data || []).filter((l) => !existingLeadIds.has(l.id));
        setSearchResults(filtered);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, contacts]);

  const filteredLeads = searchResults;

  // Garante que o lead principal do deal esteja em deal_contacts antes de adicionar outro
  const ensurePrimaryContactExists = async () => {
    if (!primaryLeadId || !contacts) return;
    const alreadyExists = contacts.some((c) => c.lead_id === primaryLeadId);
    if (alreadyExists) return;

    // Buscar lead_id do deal (o lead principal)
    const { data: deal } = await (supabase
      .from("deals" as any)
      .select("lead_id")
      .eq("id", dealId)
      .single() as any);

    const leadIdToAdd = deal?.lead_id || primaryLeadId;
    if (!leadIdToAdd) return;

    await addContact.mutateAsync({
      dealId,
      leadId: leadIdToAdd,
      role: "decisor",
      isPrimary: true,
    });
  };

  const handleAddContact = async () => {
    if (!selectedLeadId) {
      toast({ title: "Selecione um contato", variant: "destructive" });
      return;
    }

    try {
      await ensurePrimaryContactExists();
      await addContact.mutateAsync({
        dealId,
        leadId: selectedLeadId,
        role: selectedRole || undefined,
      });
      toast({ title: "Contato adicionado!" });
      setShowAddModal(false);
      setSelectedLeadId("");
      setSelectedRole("");
      setSearchTerm("");
    } catch (error) {
      toast({ title: "Erro ao adicionar contato", variant: "destructive" });
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newLeadForm.name.trim() || !newLeadForm.phone.trim()) {
      toast({ title: "Nome e telefone são obrigatórios", variant: "destructive" });
      return;
    }

    setIsSubmittingNew(true);
    try {
      const { data: newLead, error } = await supabase
        .from("leads")
        .insert({
          name: newLeadForm.name.trim(),
          phone: newLeadForm.phone.trim(),
          email: newLeadForm.email.trim() || null,
          instagram: newLeadForm.instagram.trim() || null,
          sales_stage: "new",
        })
        .select("id")
        .single();

      if (error || !newLead) {
        console.error("Erro ao criar lead:", error);
        throw error;
      }

      await ensurePrimaryContactExists();
      await addContact.mutateAsync({
        dealId,
        leadId: newLead.id,
        role: selectedRole || undefined,
      });

      toast({ title: "Novo decisor criado e vinculado!" });
      setShowAddModal(false);
      setIsCreatingNew(false);
      setNewLeadForm({ name: "", phone: "", email: "", instagram: "" });
      setSelectedRole("");
      setSearchTerm("");
    } catch (error: any) {
      console.error("Erro completo:", error);
      toast({
        title: "Erro ao criar contato",
        description: error?.message || "Verifique os dados e tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleSetPrimary = async (contactId: string) => {
    try {
      await setPrimary.mutateAsync({ id: contactId, dealId });
      toast({ title: "Contato definido como principal!" });
    } catch (error) {
      toast({ title: "Erro ao definir contato principal", variant: "destructive" });
    }
  };

  const handleRemove = async (contactId: string) => {
    try {
      await removeContact.mutateAsync({ id: contactId, dealId });
      toast({ title: "Contato removido do deal" });
    } catch (error) {
      toast({ title: "Erro ao remover contato", variant: "destructive" });
    }
  };

  const handleRoleChange = async (contactId: string, role: string) => {
    try {
      await updateContact.mutateAsync({ id: contactId, role });
      toast({ title: "Papel atualizado!" });
    } catch (error) {
      toast({ title: "Erro ao atualizar papel", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando contatos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts?.length || 0} contato(s) na negociação
        </p>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Adicionar Contato
        </Button>
      </div>

      {/* Lista de contatos */}
      {contacts && contacts.length > 0 ? (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={cn(
                "flex items-center justify-between p-3 border rounded-lg transition-all",
                contact.is_primary && "border-primary bg-primary/5"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10">
                      {getInitials(contact.lead?.name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  {contact.is_primary && (
                    <Crown className="h-4 w-4 text-amber-500 absolute -top-1 -right-1" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{contact.lead?.name || "Sem nome"}</p>
                    {contact.role && (
                      <Badge variant="secondary" className="text-xs">
                        {CONTACT_ROLES.find((r) => r.value === contact.role)?.label ||
                          contact.role}
                      </Badge>
                    )}
                    {contact.is_primary && (
                      <Badge className="bg-amber-100 text-amber-700 text-xs">
                        Principal
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {contact.lead?.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {contact.lead.email}
                      </span>
                    )}
                    {contact.lead?.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.lead.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!contact.is_primary && (
                    <DropdownMenuItem onClick={() => handleSetPrimary(contact.id)}>
                      <Star className="h-4 w-4 mr-2" />
                      Definir como Principal
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-muted-foreground">
                    <Select
                      value={contact.role || ""}
                      onValueChange={(v) => handleRoleChange(contact.id, v)}
                    >
                      <SelectTrigger className="border-0 p-0 h-auto shadow-none">
                        <SelectValue placeholder="Definir papel..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => handleRemove(contact.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover do Deal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhum contato adicional</p>
          <p className="text-xs mt-1">
            Adicione outras pessoas envolvidas na negociação
          </p>
        </div>
      )}

      {/* Modal para adicionar contato */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Contato ao Deal</DialogTitle>
            <DialogDescription>
              Selecione um lead existente para adicionar à negociação
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Lista de leads disponíveis */}
            <div className="border rounded-lg max-h-[200px] overflow-y-auto">
              {isSearching ? (
                <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </div>
              ) : filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left",
                      selectedLeadId === lead.id && "bg-primary/10"
                    )}
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(lead.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[lead.phone, lead.email].filter(Boolean).join(" · ") || "Sem contato"}
                      </p>
                    </div>
                    {selectedLeadId === lead.id && (
                      <Badge variant="default" className="text-xs">
                        Selecionado
                      </Badge>
                    )}
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {searchTerm && searchTerm.length >= 2
                    ? "Nenhum lead encontrado"
                    : "Digite pelo menos 2 caracteres para buscar"}
                </div>
              )}
            </div>

            {/* Botão criar novo lead */}
            {!isCreatingNew && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-primary"
                onClick={() => {
                  setIsCreatingNew(true);
                  setNewLeadForm(f => ({ ...f, name: searchTerm.length >= 2 ? searchTerm : "" }));
                  setSelectedLeadId("");
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar novo contato
              </Button>
            )}

            {/* Formulário de novo lead inline */}
            {isCreatingNew && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Novo contato / decisor</p>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreatingNew(false)}>
                    <span className="text-xs">✕</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Nome *"
                    value={newLeadForm.name}
                    onChange={(e) => setNewLeadForm(f => ({ ...f, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Telefone (WhatsApp) *"
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm(f => ({ ...f, phone: e.target.value }))}
                  />
                  <Input
                    placeholder="Email (opcional)"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm(f => ({ ...f, email: e.target.value }))}
                  />
                  <Input
                    placeholder="Instagram (opcional)"
                    value={newLeadForm.instagram}
                    onChange={(e) => setNewLeadForm(f => ({ ...f, instagram: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Papel do contato */}
            <div className="space-y-2">
              <Label>Papel na negociação (opcional)</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o papel..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); setIsCreatingNew(false); }}>
              Cancelar
            </Button>
            {isCreatingNew ? (
              <Button
                onClick={handleCreateAndAdd}
                disabled={!newLeadForm.name.trim() || !newLeadForm.phone.trim() || isSubmittingNew}
              >
                {isSubmittingNew ? "Criando..." : "Criar e Adicionar"}
              </Button>
            ) : (
              <Button
                onClick={handleAddContact}
                disabled={!selectedLeadId || addContact.isPending}
              >
                {addContact.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
