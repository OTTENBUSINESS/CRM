import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, UserX } from "lucide-react";
import EmailCampaignList from "@/components/email-marketing/EmailCampaignList";
import EmailUnsubscribeList from "@/components/email-marketing/EmailUnsubscribeList";
import EmailCampaignForm from "@/components/email-marketing/EmailCampaignForm";

const EmailMarketingHub = () => {
  const navigate = useNavigate();
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleEditCampaign = (id: string) => {
    setEditId(id);
    setFormOpen(true);
  };

  return (
    <AppLayout
      title="Campanhas de Email"
      subtitle="Gerencie campanhas e descadastros"
      icon={<Megaphone className="h-6 w-6" />}
      breadcrumbs={[
        { label: "Marketing", href: "/marketing" },
        { label: "Campanhas" },
      ]}
    >
      <div className="p-6">
        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="unsubscribes" className="gap-2">
              <UserX className="h-4 w-4" />
              Descadastros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="mt-6">
            <EmailCampaignList
              onNewCampaign={() => navigate("/marketing/campanhas/nova")}
              onEditCampaign={handleEditCampaign}
            />
          </TabsContent>

          <TabsContent value="unsubscribes" className="mt-6">
            <EmailUnsubscribeList />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de edição de campanha */}
      <EmailCampaignForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditId(null);
        }}
        editId={editId}
      />
    </AppLayout>
  );
};

export default EmailMarketingHub;
