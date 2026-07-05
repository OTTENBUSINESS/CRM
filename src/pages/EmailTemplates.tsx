import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { LayoutTemplate, Plus } from "lucide-react";
import EmailTemplateGallery from "@/components/email-marketing/EmailTemplateGallery";

const EmailTemplates = () => {
  const navigate = useNavigate();

  return (
    <AppLayout
      title="Templates de Email"
      subtitle="Modelos reutilizáveis para suas campanhas"
      icon={<LayoutTemplate className="h-6 w-6" />}
      breadcrumbs={[
        { label: "Marketing", href: "/marketing" },
        { label: "Templates" },
      ]}
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-end">
          <Button onClick={() => navigate("/marketing/templates/novo")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </div>

        <EmailTemplateGallery
          onNewTemplate={() => navigate("/marketing/templates/novo")}
          onEditTemplate={(id) => navigate(`/marketing/templates/${id}`)}
        />
      </div>
    </AppLayout>
  );
};

export default EmailTemplates;
