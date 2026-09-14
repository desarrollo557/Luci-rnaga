# =============================================================================
#  limpiar_bd.ps1  --  Deja la base de Luciérnaga VACÍA conservando solo los usuarios
#
#  Qué hace, en orden:
#    1. Lee la conexión de backend/.env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
#    2. Respalda la base actual en database/respaldos/<base>_<fecha>.sql.
#    3. Pide confirmación (escribe SI) salvo que se pase -Confirmar.
#    4. Ejecuta database/limpiar_bd.sql: vacía clientes, actas, cajas, FUID,
#       inventario, historial, auditoría, asignaciones y rangos. La tabla users
#       NO se toca.
#    5. Aplica caja_modulo_unica.sql (índice único del número de caja).
#    6. Muestra los conteos finales.
#
#  Uso (PowerShell normal):
#    powershell -NoProfile -ExecutionPolicy Bypass -File "<proyecto>\database\limpiar_bd.ps1"
#    ... -Confirmar   -> no pregunta (para ejecuciones sin consola interactiva)
# =============================================================================
param([switch]$Confirmar)

$ErrorActionPreference = 'Stop'

$raiz      = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$carpetaDb = Join-Path $raiz 'database'
$envFile   = Join-Path $raiz 'backend\.env'
$bin       = 'C:\Program Files\MySQL\MySQL Server 9.7\bin'
$mysql     = Join-Path $bin 'mysql.exe'
$mysqldump = Join-Path $bin 'mysqldump.exe'
$q         = [char]34

if (-not (Test-Path $mysql))   { Write-Host "No encuentro $mysql" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $envFile)) { Write-Host "No encuentro $envFile" -ForegroundColor Red; exit 1 }

# --- 1. Conexión desde backend/.env -----------------------------------------
$cfg = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_]+)\s*=\s*(.*)$') {
        $cfg[$matches[1]] = $matches[2].Trim().Trim($q).Trim("'")
    }
}
$dbHost = if ($cfg['DB_HOST']) { $cfg['DB_HOST'] } else { 'localhost' }
$dbUser = if ($cfg['DB_USER']) { $cfg['DB_USER'] } else { 'root' }
$dbName = if ($cfg['DB_NAME']) { $cfg['DB_NAME'] } else { 'fuiddatosluciernaga' }
$env:MYSQL_PWD = $cfg['DB_PASSWORD']
$conn = @('-h', $dbHost, '-u', $dbUser, '--protocol=TCP', '--default-character-set=utf8mb4')
$connTexto = "-h $dbHost -u $dbUser --protocol=TCP --default-character-set=utf8mb4"

Write-Host "1/6  Probando la conexión como $dbUser@$dbHost ..."
$version = & $mysql @conn -N -B -e 'SELECT VERSION();'
if ($LASTEXITCODE -ne 0) {
    Write-Host 'No conecta. Revisa DB_HOST, DB_USER y DB_PASSWORD en backend/.env' -ForegroundColor Red
    $env:MYSQL_PWD = $null
    exit 1
}
Write-Host "     MySQL $version"

# --- 2. Respaldo ------------------------------------------------------------
$respaldos = Join-Path $carpetaDb 'respaldos'
New-Item -ItemType Directory -Force -Path $respaldos | Out-Null
$respaldo = Join-Path $respaldos ('{0}_{1}.sql' -f $dbName, (Get-Date -Format 'yyyyMMdd_HHmmss'))
Write-Host "2/6  Respaldando la base actual en $respaldo ..."
cmd /c ($q + $mysqldump + $q + " $connTexto --routines --triggers --single-transaction --set-gtid-purged=OFF $dbName > " + $q + $respaldo + $q)
if ($LASTEXITCODE -ne 0) {
    Write-Host 'El respaldo falló; no se toca nada.' -ForegroundColor Red
    $env:MYSQL_PWD = $null
    exit 1
}
Write-Host ('     {0:N1} MB' -f ((Get-Item $respaldo).Length / 1MB))

# --- 3. Confirmación --------------------------------------------------------
Write-Host ''
Write-Host "Se van a VACIAR todas las tablas de '$dbName' excepto users." -ForegroundColor Yellow
Write-Host '     Usuarios que se conservan:'
& $mysql @conn -t $dbName -e 'SELECT id, cc, nombre, rol, sede FROM users ORDER BY id;'
if (-not $Confirmar) {
    $r = Read-Host 'Escribe SI para continuar'
    if ($r -ne 'SI') { Write-Host 'Cancelado. No se tocó nada.'; $env:MYSQL_PWD = $null; exit 0 }
}

function Importar([string]$archivo, [string]$etiqueta) {
    Write-Host ('     -> {0}' -f $etiqueta)
    cmd /c ($q + $mysql + $q + " $connTexto $dbName < " + $q + $archivo + $q)
    if ($LASTEXITCODE -ne 0) { throw "Falló $etiqueta" }
}

try {
    Write-Host '4/6  Vaciando las tablas de negocio ...'
    Importar (Join-Path $carpetaDb 'limpiar_bd.sql') 'limpiar_bd.sql'
    Write-Host '5/6  Índice único del número de caja ...'
    Importar (Join-Path $carpetaDb 'caja_modulo_unica.sql') 'caja_modulo_unica.sql'
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "El respaldo previo está en: $respaldo"
    $env:MYSQL_PWD = $null
    exit 1
}

# --- 6. Verificación --------------------------------------------------------
Write-Host '6/6  Conteos finales:'
& $mysql @conn -t $dbName -e "SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM users UNION ALL SELECT 'clientes', COUNT(*) FROM sub_modulos UNION ALL SELECT 'actas', COUNT(*) FROM moduloscliente UNION ALL SELECT 'cajas', COUNT(*) FROM modulos_caja UNION ALL SELECT 'fuid', COUNT(*) FROM fuiddatosreal UNION ALL SELECT 'inventario', COUNT(*) FROM inventario UNION ALL SELECT 'historial', COUNT(*) FROM historial UNION ALL SELECT 'auditoria', COUNT(*) FROM auditoria UNION ALL SELECT 'asignaciones_tecnica', COUNT(*) FROM asignacion_caja_tecnica UNION ALL SELECT 'asignaciones_calidad', COUNT(*) FROM asignacion_caja_calidad;"
$env:MYSQL_PWD = $null

Write-Host ''
Write-Host 'LISTO. La base quedó vacía; solo se conservaron los usuarios.' -ForegroundColor Green
Write-Host "Respaldo de la base anterior: $respaldo"
