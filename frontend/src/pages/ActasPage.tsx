import { useParams } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui';

export default function ActasPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <PageHeader title="Actas" description={id ? `Cliente: ${id}` : undefined} />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}