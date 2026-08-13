import { Card, PageHeader } from '@/components/ui';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Administración"
        description="Usuarios, módulos y configuración del sistema"
      />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}