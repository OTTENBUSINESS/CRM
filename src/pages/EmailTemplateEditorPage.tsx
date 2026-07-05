import { useNavigate, useParams } from "react-router-dom";
import EmailTemplateEditorWrapper from "@/components/email-marketing/EmailTemplateEditorWrapper";

const EmailTemplateEditorPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Rota /marketing/templates/novo → sem id (undefined = criação)
  // Rota /marketing/templates/:id → edição do template existente
  const templateId = id === "novo" ? undefined : id;

  return (
    <EmailTemplateEditorWrapper
      templateId={templateId}
      onBack={() => navigate("/marketing/templates")}
    />
  );
};

export default EmailTemplateEditorPage;
