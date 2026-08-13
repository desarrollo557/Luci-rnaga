import { useParams } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui';

export default function CajasPage() {
  const { id, mid } = useParams<{ id: string; mid: string }>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cajas"
        description={id ? `Cliente: ${id} · Módulo: ${mid}` : undefined}
      />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}