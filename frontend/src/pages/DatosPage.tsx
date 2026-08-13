import { useParams } from 'react-router-dom';
import { Card, PageHeader } from '@/components/ui';

export default function DatosPage() {
  const { cajaId } = useParams<{ cajaId: string }>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datos"
        description={cajaId ? `Digitación de la caja: ${cajaId}` : undefined}
      />
      <Card>
        <p className="text-slate-500">En construcción</p>
      </Card>
    </div>
  );
}