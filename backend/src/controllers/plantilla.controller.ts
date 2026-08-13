import type { Request, Response } from 'express';
import { generarPlantilla } from '../services/plantilla.service.js';

export async function generatePlantilla(req: Request, res: Response): Promise<void> {
  try {
    const { fileName, filtros } = req.body as { fileName: string; filtros: { caja?: string; entidad_remitente?: string } };
    if (!fileName) {
      res.status(400).json({ error: 'El campo fileName es requerido' });
      return;
    }
    const { outputPath, count } = await generarPlantilla(fileName, filtros ?? {});
    res.download(outputPath, `${fileName}.xlsx`, (err) => {
      if (err && !res.headersSent) {
        console.error('Error al enviar el archivo:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
      }
    });
    console.log(`Plantilla generada: ${outputPath} (${count} filas)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error al generar la plantilla:', message);
    if (message.includes('No se encontraron datos')) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes('plantilla no existe')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
