import { Card, PageHeader } from '@/components/ui';

export default function InventarioPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Inventario" description="Gestión de inventario" />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}