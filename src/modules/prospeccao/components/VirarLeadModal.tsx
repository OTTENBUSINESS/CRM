import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Loader2, AlertCircle, CheckCircle2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Pipeline { id: string; name: string; }
interface PipelineStage { id: string; name: string; pipeline_id: string; position: number; }
interface TeamMember { id: string; name: string; }
interface Product { id: string; name: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  leadDescobertoIds: string[];
  leadDescobertoNome?: string;
  leadDescobertoTelefone?: string | null;
}

export function VirarLeadModal({ open, onClose, leadDescobertoIds, leadDescobertoNome, leadDescobertoTelefone }: Props) {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [salesRepId, setSalesRepId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [tag, setTag] = useState("");
  const [phone, setPhone] = useState("");
  const [attachLink, setAttachLink] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-preenche phone do lead descoberto quando modal abre
  useEffect(() => {
    if (open) setPhone(leadDescobertoTelefone || "");
  }, [open, leadDescobertoTelefone]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const [pRes, sRes, tRes, prRes] = await Promise.all([
        supabase.from("sales_pipelines").select("id, name").eq("is_active", true).order("position"),
        supabase.from("sales_pipeline_stages").select("id, name, pipeline_id, position").order("position"),
        supabase.from("team_members").select("id, name").eq("is_active", true).order("name"),
        supabase.from("products").select("id, name").order("name"),
      ]);
      if (!alive) return;
      setPipelines((pRes.data as Pipeline[]) || []);
      setStages((sRes.data as PipelineStage[]) || []);
      setTeamMembers((tRes.data as TeamMember[]) || []);
      setProducts((prRes.data as Product[]) || []);
      // Default: primeiro pipeline ativo (substitua pelo ID do pipeline default do seu CRM se quiser)
      if (pRes.data && pRes.data.length > 0) setPipelineId(pRes.data[0].id);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    const ps = stages.filter((s) => s.pipeline_id === pipelineId);
    if (ps.length > 0) setStageId(ps[0].id);
    else setStageId("");
  }, [pipelineId, stages]);

  const filteredStages = stages.filter((s) => s.pipeline_id === pipelineId);

  const phoneNormalizado = phone.replace(/\D/g, "");
  const phoneValido = phoneNormalizado.length >= 10;

  const handleSubmit = async () => {
    if (!pipelineId || !stageId) return toast.error("Escolhe pipeline e etapa");
    if (leadDescobertoIds.length === 1 && !phoneValido) {
      return toast.error("Telefone obrigatório (mín 10 dígitos com DDD)");
    }
    setSubmitting(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase.functions.invoke("prospeccao-virar-lead", {
        body: {
          lead_descoberto_ids: leadDescobertoIds,
          pipeline_id: pipelineId,
          pipeline_stage_id: stageId,
          sales_rep_id: salesRepId || undefined,
          product_id: productId || undefined,
          tags: tag ? [tag] : [],
          phone_override: phoneValido ? phoneNormalizado : undefined,
          attach_diagnosis_link: attachLink,
          user_id: userId,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const results = (data?.results || []) as Array<{ lead_descoberto_id: string; lead_id?: string; ok: boolean; erro?: string; }>;
      const sucessos = results.filter((r) => r.ok);
      const falhas = results.filter((r) => !r.ok);
      if (sucessos.length > 0) {
        toast.success(`${sucessos.length} lead${sucessos.length > 1 ? "s criados" : " criado"}${falhas.length > 0 ? ` (${falhas.length} falharam)` : ""}`);
      }
      if (falhas.length > 0 && sucessos.length === 0) toast.error(`Falha: ${falhas[0].erro}`);
      if (sucessos.length === 1 && sucessos[0].lead_id) {
        onClose();
        navigate(`/comercial/leads/${sucessos[0].lead_id}`);
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-primary mb-1">
            <Star className="h-3 w-3" />
            VIRAR LEAD NO CRM
          </div>
          <DialogTitle>
            {leadDescobertoIds.length === 1
              ? leadDescobertoNome || "Lead"
              : `${leadDescobertoIds.length} leads selecionados`}
          </DialogTitle>
          <DialogDescription>
            Cria registro em <code>leads</code> + deal no pipeline escolhido.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            <Field label="Pipeline">
              <Select value={pipelineId} onChange={setPipelineId}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Etapa inicial">
              <Select value={stageId} onChange={setStageId}>
                {filteredStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Vendedor responsável">
              <Select value={salesRepId} onChange={setSalesRepId}>
                <option value="">— sem responsável —</option>
                {teamMembers.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </Select>
            </Field>
            {products.length > 0 && (
              <Field label="Produto sugerido (opcional)">
                <Select value={productId} onChange={setProductId}>
                  <option value="">— sem produto —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
            {leadDescobertoIds.length === 1 && (
              <Field label={`Telefone${!leadDescobertoTelefone ? " — não detectado, preencha manual" : ""}`}>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={`pl-9 ${!phoneValido ? "border-amber-500/40 focus-visible:ring-amber-500/30" : ""}`}
                  />
                </div>
                {!phoneValido && phone.length > 0 && (
                  <p className="text-[11px] text-amber-500 mt-1">Mínimo 10 dígitos com DDD</p>
                )}
              </Field>
            )}
            <Field label="Tag (opcional)">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="prospeccao-estetica-sp" />
            </Field>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <Checkbox checked={attachLink} onCheckedChange={(v) => setAttachLink(!!v)} className="mt-0.5" />
              <span>Anexar resumo do diagnóstico nas notas do deal</span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || submitting} className="gap-2">
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Criando...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" />Criar {leadDescobertoIds.length > 1 ? `${leadDescobertoIds.length} leads` : "lead"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode; }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      {children}
    </select>
  );
}
