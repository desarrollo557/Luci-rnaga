#!/usr/bin/env node
/**
 * Port Checker & Allocator para Luciérnaga Host
 * 
 * Valida puertos antes de levantar servicios, asigna alternativas si están ocupados,
 * y exporta configuración para backend y frontend.
 */

import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ──────────────────────────────────────────────────────────────────────────────
// Configuración por defecto
// ──────────────────────────────────────────────────────────────────────────────
interface PortConfig {
  backend: { preferred: number; allocated: number };
  frontend: { preferred: number; allocated: number };
  apiTarget: string; // para Vite proxy
}

const DEFAULT_CONFIG: PortConfig = {
  backend: { preferred: 3000, allocated: 3000 },
  frontend: { preferred: 5173, allocated: 5173 },
  apiTarget: 'http://localhost:3000',
};

// ──────────────────────────────────────────────────────────────────────────────
// Utilidades de red
// ──────────────────────────────────────────────────────────────────────────────
function isPortFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findFreePort(start: number, maxAttempts = 50): Promise<number> {
  for (let port = start; port < start + maxAttempts; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No se encontró puerto libre en rango ${start}-${start + maxAttempts - 1}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Lógica principal
// ──────────────────────────────────────────────────────────────────────────────
async function allocatePorts(config: PortConfig): Promise<PortConfig> {
  const result = { ...config };

  // 1. Backend: validar/asignar puerto
  const backendFree = await isPortFree(config.backend.preferred);
  if (backendFree) {
    result.backend.allocated = config.backend.preferred;
    console.log(`✅ Backend: puerto ${config.backend.preferred} libre`);
  } else {
    const alt = await findFreePort(config.backend.preferred + 1);
    result.backend.allocated = alt;
    console.log(`⚠️  Backend: puerto ${config.backend.preferred} ocupado → usando ${alt}`);
  }

  // 2. Frontend: validar/asignar puerto (debe ser distinto al backend)
  const frontendStart = config.frontend.preferred;
  const frontendFree = await isPortFree(frontendStart);
  if (frontendFree && frontendStart !== result.backend.allocated) {
    result.frontend.allocated = frontendStart;
    console.log(`✅ Frontend: puerto ${frontendStart} libre`);
  } else {
    const alt = await findFreePort(Math.max(frontendStart, result.backend.allocated) + 1);
    result.frontend.allocated = alt;
    console.log(`⚠️  Frontend: puerto ${frontendStart} ocupado/conflicto → usando ${alt}`);
  }

  // 3. Actualizar apiTarget para Vite proxy
  result.apiTarget = `http://localhost:${result.backend.allocated}`;

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Generación de archivos de configuración dinámicos
// ──────────────────────────────────────────────────────────────────────────────
function generateBackendEnv(config: PortConfig): string {
  return `# Generado automáticamente por port-checker - NO EDITAR MANUALMENTE
PORT=${config.backend.allocated}
HOST=0.0.0.0
VITE_API_TARGET=${config.apiTarget}
`;
}

function generateFrontendEnv(config: PortConfig): string {
  return `# Generado automáticamente por port-checker - NO EDITAR MANUALMENTE
VITE_PORT=${config.frontend.allocated}
VITE_API_TARGET=${config.apiTarget}
`;
}

function generateRootEnv(config: PortConfig): string {
  return `# Generado automáticamente por port-checker - NO EDITAR MANUALMENTE
BACKEND_PORT=${config.backend.allocated}
FRONTEND_PORT=${config.frontend.allocated}
VITE_API_TARGET=${config.apiTarget}
`;
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const outputDir = args[0] || resolve(process.cwd(), '.port-config');
  
  console.log('🔍 Validando puertos para Luciérnaga Host...\n');

  try {
    const config = await allocatePorts(DEFAULT_CONFIG);
    
    console.log('\n📋 Configuración final:');
    console.log(`   Backend:  http://localhost:${config.backend.allocated}`);
    console.log(`   Frontend: http://localhost:${config.frontend.allocated}`);
    console.log(`   API Target: ${config.apiTarget}\n`);

    // Asegurar directorio de salida
    mkdirSync(outputDir, { recursive: true });

    // Escribir archivos de configuración
    writeFileSync(resolve(outputDir, 'backend.env'), generateBackendEnv(config));
    writeFileSync(resolve(outputDir, 'frontend.env'), generateFrontendEnv(config));
    writeFileSync(resolve(outputDir, 'root.env'), generateRootEnv(config));
    
    // También escribir JSON para consumo programático
    writeFileSync(
      resolve(outputDir, 'ports.json'),
      JSON.stringify(config, null, 2)
    );

    console.log(`💾 Configuración guardada en ${outputDir}/`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();