#!/usr/bin/env node
/**
 * Dev Orchestrator para Luciérnaga Host
 * 
 * Orquesta el arranque simultáneo de backend + frontend con:
 * - Validación automática de puertos
 * - Configuración dinámica de variables de entorno
 * - Logging unificado con prefijos de color
 * - Manejo de señales para apagado limpio
 */

import { spawn, ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const PROJECT_ROOT = resolve(__dirname, '..');
const PORT_CONFIG_DIR = resolve(PROJECT_ROOT, '.port-config');

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────
interface PortConfig {
  backend: { preferred: number; allocated: number };
  frontend: { preferred: number; allocated: number };
  apiTarget: string;
}

interface ServiceConfig {
  name: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  color: string;
  prefix: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Colores ANSI para logging
// ──────────────────────────────────────────────────────────────────────────────
const COLORS = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorize(text: string, color: string): string {
  return `${color}${text}${COLORS.reset}`;
}

function timestamp(): string {
  return new Date().toISOString().split('T')[1]?.split('.')[0] || '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Cargar configuración de puertos
// ──────────────────────────────────────────────────────────────────────────────
function loadPortConfig(): PortConfig {
  const configPath = resolve(PORT_CONFIG_DIR, 'ports.json');
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(`No se encontró configuración de puertos en ${configPath}. Ejecuta primero: npm run ports:check`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Construir configuración de servicios
// ──────────────────────────────────────────────────────────────────────────────
function buildServiceConfigs(portConfig: PortConfig): ServiceConfig[] {
  const backendEnv = {
    PORT: String(portConfig.backend.allocated),
    HOST: '0.0.0.0',
    VITE_API_TARGET: portConfig.apiTarget,
    NODE_ENV: 'development',
  };

  const frontendEnv = {
    VITE_PORT: String(portConfig.frontend.allocated),
    VITE_API_TARGET: portConfig.apiTarget,
    NODE_ENV: 'development',
  };

  const isWin = process.platform === 'win32';
  const backendCmd = isWin ? 'npx.cmd' : 'npx';
  const frontendCmd = isWin ? 'npx.cmd' : 'npx';

  // Backend: tsx watch src/server.ts
  const backendArgs = ['tsx', 'watch', 'src/server.ts'];

  // Frontend: vite --host --port <puerto>
  const frontendArgs = ['vite', '--host', '--port', String(portConfig.frontend.allocated)];

  return [
    {
      name: 'backend',
      cwd: resolve(PROJECT_ROOT, 'backend'),
      command: backendCmd,
      args: backendArgs,
      env: { ...process.env, ...backendEnv },
      color: COLORS.blue,
      prefix: 'BACKEND',
    },
    {
      name: 'frontend',
      cwd: resolve(PROJECT_ROOT, 'frontend'),
      command: frontendCmd,
      args: frontendArgs,
      env: { ...process.env, ...frontendEnv },
      color: COLORS.magenta,
      prefix: 'FRONTEND',
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// Spawn de servicio con logging prefijado
// ──────────────────────────────────────────────────────────────────────────────
function spawnService(config: ServiceConfig): ChildProcess {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsVerbatimArguments: true,
  });

  const prefix = colorize(`[${config.prefix}]`, config.color);
  const timePrefix = colorize(`[${timestamp()}]`, COLORS.gray);

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      if (line.trim()) console.log(`${timePrefix} ${prefix} ${line}`);
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      if (line.trim()) console.error(`${timePrefix} ${colorize(`[${config.prefix}:ERROR]`, COLORS.red)} ${line}`);
    }
  });

  child.on('error', (err) => {
    console.error(`${timePrefix} ${colorize(`[${config.prefix}:SPAWN_ERROR]`, COLORS.red)} ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    const msg = signal ? `señal ${signal}` : `código ${code ?? 'unknown'}`;
    console.log(`${timePrefix} ${colorize(`[${config.prefix}:EXIT]`, COLORS.yellow)} Proceso terminado (${msg})`);
  });

  return child;
}

// ──────────────────────────────────────────────────────────────────────────────
// Manejo de señales para apagado limpio
// ──────────────────────────────────────────────────────────────────────────────
let services: ChildProcess[] = [];
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${colorize(`[ORCHESTRATOR]`, COLORS.cyan)} Recibida ${signal}, apagando servicios...`);

  for (const svc of services) {
    if (!svc.killed) {
      // En Windows, SIGTERM no existe; usar taskkill o SIGINT
      if (process.platform === 'win32') {
        svc.kill('SIGINT');
      } else {
        svc.kill('SIGTERM');
      }
    }
  }

  // Forzar después de 5s
  setTimeout(() => {
    for (const svc of services) {
      if (!svc.killed) svc.kill('SIGKILL');
    }
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(colorize('🚀 Luciérnaga Host - Dev Orchestrator', COLORS.cyan));
  console.log(colorize('═'.repeat(50), COLORS.cyan));

  // 1. Verificar/ejecutar port-checker si no existe config
  try {
    loadPortConfig();
  } catch {
    console.log(`${colorize('[ORCHESTRATOR]', COLORS.cyan)} Configuración de puertos no encontrada, ejecutando port-checker...\n`);
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('npm', ['run', 'ports:check'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (result.status !== 0) {
      console.error(`${colorize('[ORCHESTRATOR:ERROR]', COLORS.red)} port-checker falló`);
      process.exit(1);
    }
  }

  // 2. Cargar configuración final
  const portConfig = loadPortConfig();
  console.log(`${colorize('[ORCHESTRATOR]', COLORS.cyan)} Puertos asignados:`);
  console.log(`  ${colorize('Backend:', COLORS.blue)}  http://localhost:${portConfig.backend.allocated}`);
  console.log(`  ${colorize('Frontend:', COLORS.magenta)} http://localhost:${portConfig.frontend.allocated}`);
  console.log(`  ${colorize('API Target:', COLORS.cyan)} ${portConfig.apiTarget}\n`);

  // 3. Levantar servicios
  const serviceConfigs = buildServiceConfigs(portConfig);
  services = serviceConfigs.map(spawnService);

  console.log(`${colorize('[ORCHESTRATOR]', COLORS.green)} ✅ Ambos servicios iniciados. Presiona Ctrl+C para detener.\n`);

  // 4. Esperar a que terminen (el primero que termine mata al otro)
  await Promise.race(
    services.map((svc) =>
      new Promise<void>((resolve) => {
        svc.on('exit', () => resolve());
      })
    )
  );

  // Si llegamos aquí, uno terminó; apagar el resto
  shutdown('CHILD_EXIT');
}

main().catch((err) => {
  console.error(`${colorize('[ORCHESTRATOR:FATAL]', COLORS.red)} ${err.message}`);
  process.exit(1);
});