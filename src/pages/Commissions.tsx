import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CommissionSummaryCard,
  CommissionsTable,
  CommissionRulesTable,
} from "@/components/sales/commissions";
import { DollarSign, Settings, List } from "lucide-react";

const Commissions = () => {
  const [activeTab, setActiveTab] = useState("commissions");

  return (
    <AppLayout
      title="Comissoes"
      subtitle="Gerencie comissoes e regras de pagamento"
      icon={<DollarSign className="h-6 w-6" />}
      breadcrumbs={[
        { label: "Comercial", href: "/comercial" },
        { label: "Comissoes" },
      ]}
    >
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <CommissionSummaryCard />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="commissions" className="gap-2">
              <List className="h-4 w-4" />
              Comissoes
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <Settings className="h-4 w-4" />
              Regras
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commissions" className="mt-6">
            <CommissionsTable />
          </TabsContent>

          <TabsContent value="rules" className="mt-6">
            <CommissionRulesTable />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Commissions;
