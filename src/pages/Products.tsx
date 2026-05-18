import { AppLayout } from "@/components/layout/AppLayout";
import { ProductsTable } from "@/components/products";
import { Package } from "lucide-react";

const Products = () => {
  return (
    <AppLayout
      title="Produtos"
      subtitle="Gerencie os produtos disponiveis para venda"
      icon={<Package className="h-6 w-6" />}
      breadcrumbs={[
        { label: "Comercial", href: "/comercial" },
        { label: "Produtos" },
      ]}
    >
      <div className="p-6">
        <ProductsTable />
      </div>
    </AppLayout>
  );
};

export default Products;
