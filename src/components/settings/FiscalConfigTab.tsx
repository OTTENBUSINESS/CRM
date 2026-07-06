import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFiscalConfig, useUpdateFiscalConfig } from "@/hooks/useNFSe";
import { Building2, Loader2, MessageSquare, Plug, Save } from "lucide-react";

interface FiscalFormState {
  // Prestador
  razao_social: string;
  cnpj: string;
  inscricao_municipal: string;
  regime_tributario: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  codigo_municipio: string;
  // Focus NFe
  api_token: string;
  ambiente: string;
  natureza_operacao: string;
  serie_rps: string;
  codigo_opcao_simples_nacional: string;
  regime_especial_tributacao: string;
  ultimo_numero_dps: string;
  // Cobranca
  pix_key: string;
  pix_type: string;
  pix_name: string;
  billing_reminder_template: string;
}

const EMPTY_FORM: FiscalFormState = {
  razao_social: "",
  cnpj: "",
  inscricao_municipal: "",
  regime_tributario: "simples_nacional",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  codigo_municipio: "",
  api_token: "",
  ambiente: "homologacao",
  natureza_operacao: "Prestacao de servicos",
  serie_rps: "900",
  codigo_opcao_simples_nacional: "1",
  regime_especial_tributacao: "0",
  ultimo_numero_dps: "200",
  pix_key: "",
  pix_type: "",
  pix_name: "",
  billing_reminder_template: "",
};

export function FiscalConfigTab() {
  const { data: config, isLoading } = useFiscalConfig();
  const updateConfig = useUpdateFiscalConfig();
  const [form, setForm] = useState<FiscalFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!config) return;
    setForm({
      razao_social: config.razao_social || "",
      cnpj: config.cnpj || "",
      inscricao_municipal: config.inscricao_municipal || "",
      regime_tributario: config.regime_tributario || "simples_nacional",
      logradouro: config.logradouro || "",
      numero: config.numero || "",
      complemento: config.complemento || "",
      bairro: config.bairro || "",
      cidade: config.cidade || "",
      uf: config.uf || "",
      cep: config.cep || "",
      codigo_municipio: config.codigo_municipio || "",
      api_token: config.api_token || "",
      ambiente: config.ambiente || "homologacao",
      natureza_operacao: config.natureza_operacao || "Prestacao de servicos",
      serie_rps: config.serie_rps || "900",
      codigo_opcao_simples_nacional: String(config.codigo_opcao_simples_nacional ?? 1),
      regime_especial_tributacao: String(config.regime_especial_tributacao ?? 0),
      ultimo_numero_dps: String(config.ultimo_numero_dps ?? 200),
      pix_key: config.pix_key || "",
      pix_type: config.pix_type || "",
      pix_name: config.pix_name || "",
      billing_reminder_template: config.billing_reminder_template || "",
    });
  }, [config]);

  const setField =
    (field: keyof FiscalFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setSelect = (field: keyof FiscalFormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.razao_social.trim() || !form.cnpj.trim()) {
      toast.error("Campos obrigatorios", {
        description: "Preencha pelo menos a razao social e o CNPJ do prestador.",
      });
      return;
    }

    try {
      await updateConfig.mutateAsync({
        razao_social: form.razao_social.trim(),
        cnpj: form.cnpj.trim(),
        inscricao_municipal: form.inscricao_municipal.trim() || null,
        regime_tributario: form.regime_tributario || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim() || null,
        cep: form.cep.trim() || null,
        codigo_municipio: form.codigo_municipio.trim() || null,
        api_token: form.api_token.trim() || null,
        ambiente: form.ambiente || "homologacao",
        natureza_operacao: form.natureza_operacao.trim() || null,
        serie_rps: form.serie_rps.trim() || null,
        codigo_opcao_simples_nacional: parseInt(form.codigo_opcao_simples_nacional) || 1,
        regime_especial_tributacao: parseInt(form.regime_especial_tributacao) || 0,
        ultimo_numero_dps: parseInt(form.ultimo_numero_dps) || 0,
        pix_key: form.pix_key.trim() || null,
        pix_type: form.pix_type || null,
        pix_name: form.pix_name.trim() || null,
        billing_reminder_template: form.billing_reminder_template || null,
      });
      toast.success("Configuracao fiscal salva!");
    } catch (error: any) {
      toast.error("Erro ao salvar configuracao", { description: error?.message });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ Prestador ═══ */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-blue-500" />
            Dados do Prestador (sua empresa)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Razao social *</Label>
              <Input
                placeholder="Sua Empresa LTDA"
                value={form.razao_social}
                onChange={setField("razao_social")}
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={setField("cnpj")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inscricao municipal</Label>
              <Input
                placeholder="12345"
                value={form.inscricao_municipal}
                onChange={setField("inscricao_municipal")}
              />
            </div>
            <div className="space-y-2">
              <Label>Regime tributario</Label>
              <Select value={form.regime_tributario} onValueChange={setSelect("regime_tributario")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Logradouro</Label>
              <Input
                placeholder="Rua Exemplo"
                value={form.logradouro}
                onChange={setField("logradouro")}
              />
            </div>
            <div className="space-y-2">
              <Label>Numero</Label>
              <Input placeholder="123" value={form.numero} onChange={setField("numero")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Complemento</Label>
              <Input
                placeholder="Sala 101"
                value={form.complemento}
                onChange={setField("complemento")}
              />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input placeholder="Centro" value={form.bairro} onChange={setField("bairro")} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input placeholder="Sao Paulo" value={form.cidade} onChange={setField("cidade")} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input placeholder="SP" maxLength={2} value={form.uf} onChange={setField("uf")} />
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input placeholder="00000-000" value={form.cep} onChange={setField("cep")} />
            </div>
            <div className="space-y-2">
              <Label>Cod. IBGE municipio</Label>
              <Input
                placeholder="3550308"
                value={form.codigo_municipio}
                onChange={setField("codigo_municipio")}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O codigo IBGE do municipio e obrigatorio pra emissao. Consulte em ibge.gov.br ou no
            site da sua prefeitura.
          </p>
        </CardContent>
      </Card>

      {/* ═══ Focus NFe ═══ */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-5 w-5 text-purple-500" />
            Focus NFe (emissao de NFS-e)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Token da API *</Label>
              <Input
                type="password"
                placeholder="Token da Focus NFe"
                value={form.api_token}
                onChange={setField("api_token")}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={form.ambiente} onValueChange={setSelect("ambiente")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologacao (testes)</SelectItem>
                  <SelectItem value="producao">Producao (notas reais)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Natureza da operacao</Label>
            <Input
              placeholder="Prestacao de servicos"
              value={form.natureza_operacao}
              onChange={setField("natureza_operacao")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Serie RPS</Label>
              <Input placeholder="900" value={form.serie_rps} onChange={setField("serie_rps")} />
            </div>
            <div className="space-y-2">
              <Label>Opcao Simples Nacional</Label>
              <Select
                value={form.codigo_opcao_simples_nacional}
                onValueChange={setSelect("codigo_opcao_simples_nacional")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Nao optante</SelectItem>
                  <SelectItem value="2">2 — MEI</SelectItem>
                  <SelectItem value="3">3 — ME/EPP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ultimo numero DPS</Label>
              <Input
                type="number"
                placeholder="200"
                value={form.ultimo_numero_dps}
                onChange={setField("ultimo_numero_dps")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Regime especial de tributacao</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.regime_especial_tributacao}
                onChange={setField("regime_especial_tributacao")}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O numero DPS auto-incrementa a cada emissao. So altere se souber o ultimo numero usado
            na prefeitura. Teste sempre em homologacao antes de ir pra producao.
          </p>
        </CardContent>
      </Card>

      {/* ═══ Cobranca ═══ */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-green-500" />
            Cobranca (PIX + lembrete WhatsApp)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Chave PIX</Label>
              <Input
                placeholder="Chave PIX da empresa"
                value={form.pix_key}
                onChange={setField("pix_key")}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo da chave</Label>
              <Select value={form.pix_type} onValueChange={setSelect("pix_type")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVP">Aleatoria (EVP)</SelectItem>
                  <SelectItem value="CPF">CPF</SelectItem>
                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                  <SelectItem value="PHONE">Telefone</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome do recebedor</Label>
              <Input
                placeholder="Sua Empresa"
                value={form.pix_name}
                onChange={setField("pix_name")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Template do lembrete de cobranca (WhatsApp)</Label>
            <Textarea
              rows={6}
              placeholder={"Ola {{primeiro_nome}}! Passando pra lembrar do pagamento da {{parcela}} no valor de R$ {{valor}}, vencimento {{vencimento}}..."}
              value={form.billing_reminder_template}
              onChange={setField("billing_reminder_template")}
            />
            <p className="text-xs text-muted-foreground">
              {"Variaveis disponiveis: {{cliente}}, {{primeiro_nome}}, {{valor}}, {{parcela}}, {{vencimento}}, {{total_parcelas}}, {{produto}}."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar configuracao fiscal
        </Button>
      </div>
    </div>
  );
}
