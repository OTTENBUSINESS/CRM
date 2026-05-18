import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkingHours,
  useUpdateWorkingHours,
  useCalendarBlocks,
  useCreateBlock,
  useDeleteBlock,
  getDayName,
  defaultWorkingHours,
  type WorkingHours,
  type CreateBlockInput,
} from "@/hooks/useCalendarSettings";
import { Clock, Lock, Trash2, Plus, Calendar, CheckCircle2, XCircle } from "lucide-react";

interface CalendarSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarSettingsSheet({ open, onOpenChange }: CalendarSettingsSheetProps) {
  const { teamMember } = useAuth();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurar Agenda</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="hours" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="hours" className="flex-1 text-xs">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Horário
            </TabsTrigger>
            <TabsTrigger value="blocks" className="flex-1 text-xs">
              <Lock className="h-3.5 w-3.5 mr-1" />
              Bloqueios
            </TabsTrigger>
            <TabsTrigger value="meetings" className="flex-1 text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Reuniões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hours" className="mt-4">
            <WorkingHoursTab />
          </TabsContent>

          <TabsContent value="blocks" className="mt-4">
            <BlocksTab />
          </TabsContent>

          <TabsContent value="meetings" className="mt-4">
            <MeetingsTab />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── Tab: Horário de Trabalho ──────────────────────────────────────────

function WorkingHoursTab() {
  const { data: settings, isLoading } = useWorkingHours();
  const updateWH = useUpdateWorkingHours();
  const [localHours, setLocalHours] = useState<WorkingHours>(defaultWorkingHours());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.working_hours) {
      setLocalHours(settings.working_hours);
      setDirty(false);
    }
  }, [settings]);

  const toggleDay = (day: string) => {
    setLocalHours(prev => ({
      ...prev,
      [day]: prev[day] ? null : { start: "09:00", end: "18:00" },
    }));
    setDirty(true);
  };

  const updateTime = (day: string, field: "start" | "end", value: string) => {
    setLocalHours(prev => ({
      ...prev,
      [day]: prev[day] ? { ...prev[day]!, [field]: value } : { start: "09:00", end: "18:00", [field]: value },
    }));
    setDirty(true);
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4 text-center">Carregando...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure seus dias e horários de trabalho. O agente IA usará essas informações para agendar reuniões.
      </p>

      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map(day => {
          const dayStr = String(day);
          const config = localHours[dayStr];
          return (
            <div key={day} className="flex items-center gap-3 py-2 border-b last:border-b-0">
              <Switch
                checked={!!config}
                onCheckedChange={() => toggleDay(dayStr)}
              />
              <span className="w-10 text-sm font-medium">{getDayName(day)}</span>
              {config ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={config.start}
                    onChange={e => updateTime(dayStr, "start", e.target.value)}
                    className="h-8 w-28 text-sm"
                  />
                  <span className="text-muted-foreground text-sm">até</span>
                  <Input
                    type="time"
                    value={config.end}
                    onChange={e => updateTime(dayStr, "end", e.target.value)}
                    className="h-8 w-28 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Folga</span>
              )}
            </div>
          );
        })}
      </div>

      <Button
        onClick={() => updateWH.mutate({ working_hours: localHours })}
        disabled={!dirty || updateWH.isPending}
        className="w-full"
      >
        {updateWH.isPending ? "Salvando..." : "Salvar horário"}
      </Button>
    </div>
  );
}

// ── Tab: Bloqueios ───────────────────────────────────────────────────

function BlocksTab() {
  const { data: blocks = [], isLoading } = useCalendarBlocks();
  const createBlock = useCreateBlock();
  const deleteBlock = useDeleteBlock();

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"one_time" | "recurring">("one_time");
  const [title, setTitle] = useState("Bloqueio");
  const [startDT, setStartDT] = useState("");
  const [endDT, setEndDT] = useState("");
  const [recDays, setRecDays] = useState<number[]>([]);
  const [recStart, setRecStart] = useState("12:00");
  const [recEnd, setRecEnd] = useState("13:00");

  const resetForm = () => {
    setTitle("Bloqueio");
    setStartDT("");
    setEndDT("");
    setRecDays([]);
    setRecStart("12:00");
    setRecEnd("13:00");
    setShowForm(false);
  };

  const handleCreate = () => {
    const input: CreateBlockInput = {
      title,
      block_type: formType,
    };

    if (formType === "one_time") {
      if (!startDT || !endDT) return;
      input.start_datetime = new Date(startDT).toISOString();
      input.end_datetime = new Date(endDT).toISOString();
    } else {
      if (!recDays.length) return;
      input.recurrence_days = recDays;
      input.recurrence_start_time = recStart;
      input.recurrence_end_time = recEnd;
    }

    createBlock.mutate(input, { onSuccess: resetForm });
  };

  const toggleRecDay = (d: number) => {
    setRecDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bloqueie horários na sua agenda. O agente IA não agendará reuniões nesses períodos.
      </p>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Novo bloqueio
        </Button>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex gap-2">
            <Button
              variant={formType === "one_time" ? "default" : "outline"}
              size="sm"
              onClick={() => setFormType("one_time")}
            >
              Único
            </Button>
            <Button
              variant={formType === "recurring" ? "default" : "outline"}
              size="sm"
              onClick={() => setFormType("recurring")}
            >
              Recorrente
            </Button>
          </div>

          <div>
            <Label className="text-xs">Motivo do bloqueio</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-8 text-sm mt-1"
              placeholder="Ex: Almoço, médico, compromisso..."
            />
          </div>

          {formType === "one_time" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início</Label>
                <Input
                  type="datetime-local"
                  value={startDT}
                  onChange={e => setStartDT(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input
                  type="datetime-local"
                  value={endDT}
                  onChange={e => setEndDT(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs mb-1 block">Dias da semana</Label>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5, 6].map(d => (
                    <button
                      key={d}
                      onClick={() => toggleRecDay(d)}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                        recDays.includes(d)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {getDayName(d).charAt(0)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Hora início</Label>
                  <Input
                    type="time"
                    value={recStart}
                    onChange={e => setRecStart(e.target.value)}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Hora fim</Label>
                  <Input
                    type="time"
                    value={recEnd}
                    onChange={e => setRecEnd(e.target.value)}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" className="flex-1" onClick={resetForm}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" onClick={handleCreate} disabled={createBlock.isPending}>
              {createBlock.isPending ? "Criando..." : "Criar bloqueio"}
            </Button>
          </div>
        </Card>
      )}

      {/* List existing blocks */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-4">Carregando...</div>
      ) : blocks.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">Nenhum bloqueio configurado</div>
      ) : (
        <div className="space-y-2">
          {blocks.map(block => (
            <div key={block.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{block.title}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {block.block_type === "one_time" ? "Único" : "Recorrente"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 pl-5">
                  {block.block_type === "one_time" && block.start_datetime && block.end_datetime ? (
                    <>
                      {new Date(block.start_datetime).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      {" → "}
                      {new Date(block.end_datetime).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </>
                  ) : (
                    <>
                      {block.recurrence_days.map(d => getDayName(d)).join(", ")}
                      {" · "}
                      {block.recurrence_start_time?.slice(0, 5)} – {block.recurrence_end_time?.slice(0, 5)}
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => deleteBlock.mutate(block.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Reuniões & Google ────────────────────────────────────────────

function MeetingsTab() {
  const { teamMember } = useAuth();
  const { data: settings } = useWorkingHours();
  const updateWH = useUpdateWorkingHours();
  const [duration, setDuration] = useState("45");

  useEffect(() => {
    if (settings?.meeting_duration_minutes) {
      setDuration(String(settings.meeting_duration_minutes));
    }
  }, [settings]);

  const googleConnected = teamMember?.google_calendar_connected || false;

  return (
    <div className="space-y-6">
      {/* Meeting duration */}
      <div className="space-y-2">
        <Label>Duração padrão das reuniões</Label>
        <p className="text-xs text-muted-foreground">
          O agente IA usará essa duração ao agendar reuniões.
        </p>
        <div className="flex items-center gap-2">
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="45">45 min</SelectItem>
              <SelectItem value="60">60 min</SelectItem>
              <SelectItem value="90">90 min</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => updateWH.mutate({
              working_hours: settings?.working_hours || defaultWorkingHours(),
              meeting_duration_minutes: Number(duration),
            })}
            disabled={updateWH.isPending || String(settings?.meeting_duration_minutes) === duration}
          >
            Salvar
          </Button>
        </div>
      </div>

      {/* Google Calendar status */}
      <div className="space-y-2">
        <Label>Google Calendar</Label>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            {googleConnected ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Conectado</p>
                  <p className="text-xs text-muted-foreground">
                    Eventos do Google Calendar aparecem na sua agenda e são considerados pelo agente IA.
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Não conectado</p>
                  <p className="text-xs text-muted-foreground">
                    Conecte sua conta Google em Configurações para sincronizar eventos.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
