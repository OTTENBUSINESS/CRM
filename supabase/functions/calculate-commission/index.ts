import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CommissionRule {
  id: string;
  name: string;
  sales_rep_id: string | null;
  product_id: string | null;
  commission_type: "percentage" | "fixed";
  commission_value: number;
  payment_trigger: "on_deal_won" | "on_payment" | "on_full_payment";
  is_active: boolean;
  priority: number;
  valid_from: string | null;
  valid_to: string | null;
  calculate_on: "gross" | "net";
}

interface Deal {
  id: string;
  contact_id: string;
  sales_rep_id: string;
  product_id: string;
  negotiated_price: number;
  total_paid: number;
  payment_status: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      deal_id,
      deal_payment_id,
      trigger,
    } = await req.json();

    if (!deal_id) {
      return new Response(
        JSON.stringify({ error: "deal_id e obrigatorio" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!trigger || !["deal_won", "payment", "full_payment"].includes(trigger)) {
      return new Response(
        JSON.stringify({ error: "trigger invalido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get deal with sales rep and product
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: "Deal nao encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!deal.sales_rep_id) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Deal nao tem vendedor atribuido",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get payment info if this is a payment trigger
    let paymentAmount = 0;
    let paymentGateway = "";
    let paymentBillingType = "";
    if (deal_payment_id) {
      const { data: payment } = await supabase
        .from("deal_payments")
        .select("amount, gateway, billing_type")
        .eq("id", deal_payment_id)
        .single();

      if (payment) {
        paymentAmount = payment.amount;
        paymentGateway = payment.gateway || "";
        // Map new CC types to credit_card for fee lookup
        const rawBillingType = payment.billing_type || "";
        paymentBillingType = ["credit_card_no_anticipation", "credit_card_recurring"].includes(rawBillingType)
          ? "credit_card"
          : rawBillingType;
      }
    }

    // Map trigger names
    const triggerMap: Record<string, string> = {
      deal_won: "on_deal_won",
      payment: "on_payment",
      full_payment: "on_full_payment",
    };
    const paymentTrigger = triggerMap[trigger];

    // Get all active commission rules for this trigger
    const { data: rules, error: rulesError } = await supabase
      .from("commission_rules")
      .select("*")
      .eq("is_active", true)
      .eq("payment_trigger", paymentTrigger)
      .order("priority", { ascending: false });

    if (rulesError || !rules || rules.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Nenhuma regra de comissao ativa para este trigger",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Filter rules by date range (payment date must fall within valid_from/valid_to)
    const today = new Date().toISOString().split("T")[0];
    const validRules = (rules as CommissionRule[]).filter((rule) => {
      if (rule.valid_from && today < rule.valid_from) return false;
      if (rule.valid_to && today > rule.valid_to) return false;
      return true;
    });

    if (validRules.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Nenhuma regra de comissao valida para a data atual",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find the best matching rule (highest priority that matches)
    let bestRule: CommissionRule | null = null;

    for (const rule of validRules) {
      const repMatches =
        rule.sales_rep_id === null || rule.sales_rep_id === deal.sales_rep_id;
      const productMatches =
        rule.product_id === null || rule.product_id === deal.product_id;

      if (repMatches && productMatches) {
        const currentSpecificity =
          (rule.sales_rep_id ? 2 : 0) + (rule.product_id ? 1 : 0);
        const bestSpecificity = bestRule
          ? (bestRule.sales_rep_id ? 2 : 0) + (bestRule.product_id ? 1 : 0)
          : -1;

        if (
          currentSpecificity > bestSpecificity ||
          (currentSpecificity === bestSpecificity &&
            rule.priority > (bestRule?.priority || 0))
        ) {
          bestRule = rule;
        }
      }
    }

    if (!bestRule) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Nenhuma regra de comissao aplicavel encontrada",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate base amount based on trigger
    let baseAmount: number;
    if (trigger === "payment" && paymentAmount > 0) {
      baseAmount = paymentAmount;
    } else {
      baseAmount = deal.negotiated_price;
    }

    // Calculate gateway fee
    let gatewayFeeAmount = 0;
    if (paymentGateway && paymentBillingType) {
      // Look up gateway fee from the database
      const { data: gwData } = await supabase
        .from("payment_gateways")
        .select("id")
        .eq("slug", paymentGateway)
        .single();

      if (gwData) {
        const { data: feeData } = await supabase
          .from("payment_gateway_fees")
          .select("fee_percent, fee_fixed")
          .eq("gateway_id", gwData.id)
          .eq("billing_type", paymentBillingType)
          .single();

        if (feeData) {
          gatewayFeeAmount =
            (baseAmount * Number(feeData.fee_percent)) / 100 +
            Number(feeData.fee_fixed);
        }
      }
    }

    // Calculate net amount
    const netAmount = baseAmount - gatewayFeeAmount;

    // Determine commission base depending on rule's calculate_on
    const commissionBase =
      bestRule.calculate_on === "net" ? netAmount : baseAmount;

    // Calculate commission amount
    let commissionAmount: number;
    if (bestRule.commission_type === "percentage") {
      commissionAmount = (commissionBase * bestRule.commission_value) / 100;
    } else {
      commissionAmount = bestRule.commission_value;
    }

    // Round to 2 decimal places
    commissionAmount = Math.round(commissionAmount * 100) / 100;
    const roundedGatewayFee = Math.round(gatewayFeeAmount * 100) / 100;
    const roundedNetAmount = Math.round(netAmount * 100) / 100;

    // Check if commission already exists for this deal/payment combination
    // Ignore cancelled commissions - they should allow recalculation
    let existingQuery = supabase
      .from("commissions")
      .select("id")
      .eq("deal_id", deal_id)
      .eq("sales_rep_id", deal.sales_rep_id)
      .neq("status", "cancelled");

    if (deal_payment_id) {
      existingQuery = existingQuery.eq("deal_payment_id", deal_payment_id);
    } else {
      existingQuery = existingQuery.is("deal_payment_id", null);
    }

    const { data: existingCommission } = await existingQuery.maybeSingle();

    if (existingCommission) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Comissao ja foi calculada para este deal/pagamento",
          existing_commission_id: existingCommission.id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determinar data de competência (data da venda, não do cálculo)
    const referenceDate = deal.won_at || deal.created_at || new Date().toISOString();

    // Create commission record
    const { data: commission, error: commissionError } = await supabase
      .from("commissions")
      .insert({
        deal_id: deal_id,
        deal_payment_id: deal_payment_id || null,
        sales_rep_id: deal.sales_rep_id,
        commission_rule_id: bestRule.id,
        base_amount: baseAmount,
        gateway_fee_amount: roundedGatewayFee,
        net_amount: roundedNetAmount,
        commission_amount: commissionAmount,
        status: "pending",
        reference_date: referenceDate,
      })
      .select()
      .single();

    if (commissionError) {
      console.error("Error creating commission:", commissionError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar comissao" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- SDR Commission (second pass) ---
    let sdrCommissionId: string | null = null;
    let sdrCommissionAmount = 0;

    if (deal.sdr_id && deal.sdr_id !== deal.sales_rep_id) {
      // Check if SDR commission already exists
      let existingSdrQuery = supabase
        .from("commissions")
        .select("id")
        .eq("deal_id", deal_id)
        .eq("sales_rep_id", deal.sdr_id)
        .neq("status", "cancelled");

      if (deal_payment_id) {
        existingSdrQuery = existingSdrQuery.eq("deal_payment_id", deal_payment_id);
      } else {
        existingSdrQuery = existingSdrQuery.is("deal_payment_id", null);
      }

      const { data: existingSdrCommission } = await existingSdrQuery.maybeSingle();

      if (!existingSdrCommission) {
        // Find SDR-specific rule, or use default 0.04%
        let sdrRule: CommissionRule | null = null;

        for (const rule of validRules) {
          const repMatches =
            rule.sales_rep_id === deal.sdr_id;
          const productMatches =
            rule.product_id === null || rule.product_id === deal.product_id;

          if (repMatches && productMatches) {
            if (!sdrRule || rule.priority > sdrRule.priority) {
              sdrRule = rule;
            }
          }
        }

        // Calculate SDR commission
        const sdrCommBase = bestRule.calculate_on === "net" ? netAmount : baseAmount;
        if (sdrRule) {
          sdrCommissionAmount = sdrRule.commission_type === "percentage"
            ? (sdrCommBase * sdrRule.commission_value) / 100
            : sdrRule.commission_value;
        } else {
          // Default SDR rate: 0.04%
          sdrCommissionAmount = (sdrCommBase * 0.04) / 100;
        }

        sdrCommissionAmount = Math.round(sdrCommissionAmount * 100) / 100;

        const { data: sdrCommission, error: sdrError } = await supabase
          .from("commissions")
          .insert({
            deal_id: deal_id,
            deal_payment_id: deal_payment_id || null,
            sales_rep_id: deal.sdr_id,
            commission_rule_id: sdrRule?.id || bestRule.id,
            base_amount: baseAmount,
            gateway_fee_amount: roundedGatewayFee,
            net_amount: roundedNetAmount,
            commission_amount: sdrCommissionAmount,
            status: "pending",
            reference_date: referenceDate,
          })
          .select()
          .single();

        if (sdrError) {
          console.error("Error creating SDR commission:", sdrError);
        } else {
          sdrCommissionId = sdrCommission.id;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        commission_id: commission.id,
        commission_amount: commissionAmount,
        rule_applied: bestRule.name,
        base_amount: baseAmount,
        gateway_fee_amount: roundedGatewayFee,
        net_amount: roundedNetAmount,
        calculate_on: bestRule.calculate_on,
        sdr_commission_id: sdrCommissionId,
        sdr_commission_amount: sdrCommissionAmount,
        message: "Comissao calculada com sucesso",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
