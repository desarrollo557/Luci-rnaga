import { Card, PageHeader } from '@/components/ui';

export default function ProduccionPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Producción" description="Seguimiento de producción y avances" />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}