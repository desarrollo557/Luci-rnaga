# =============================================================================
#  reinstalar_bd.ps1  --  Reinstala la base de Luciérnaga con los datos REALES
#
#  Qué hace, en orden:
#    1. Lee la conexión de backend/.env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
#    2. Respalda la base actual en database/respaldos/<base>_<fecha>.sql.
#    3. Prepara schema.sql sin los bloques DELIMITER truncados del volcado
#       (ver el aviso del README).
#    4. Pide confirmación (escribe SI), BORRA la base y la crea vacía (utf8mb4).
#    5. Importa el volcado real.
#    6. Aplica las migraciones idempotentes en el orden del README.
#    7. Muestra los conteos finales.
#
#  NO carga ninguna semilla: la base queda únicamente con los datos del volcado
#  (usuarios reales, clientes, actas, cajas, FUID y asignaciones).
#
#  Uso (PowerShell normal, desde cualquier carpeta):
#    powershell -NoProfile -ExecutionPolicy Bypass -File "<proyecto>\database\reinstalar_bd.ps1"
#    ... -SoloRespaldo   -> solo respalda y prepara el volcado filtrado; no borra nada.
# =============================================================================
param([switch]$SoloRespaldo)

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
# La contraseña viaja por MYSQL_PWD y nunca por argumento (los argumentos se ven
# en la lista de procesos de toda la máquina).
$env:MYSQL_PWD = $cfg['DB_PASSWORD']
$conn = @('-h', $dbHost, '-u', $dbUser, '--protocol=TCP', '--default-character-set=utf8mb4')
$connTexto = "-h $dbHost -u $dbUser --protocol=TCP --default-character-set=utf8mb4"

Write-Host "1/7  Probando la conexión como $dbUser@$dbHost ..."
$version = & $mysql @conn -N -B -e 'SELECT VERSION();'
if ($LASTEXITCODE -ne 0) {
    Write-Host 'No conecta. Revisa DB_HOST, DB_USER y DB_PASSWORD en backend/.env' -ForegroundColor Red
    $env:MYSQL_PWD = $null
    exit 1
}
Write-Host "     MySQL $version"

# --- 2. Respaldo de la base actual ------------------------------------------
$respaldos = Join-Path $carpetaDb 'respaldos'
New-Item -ItemType Directory -Force -Path $respaldos | Out-Null
$respaldo = Join-Path $respaldos ('{0}_{1}.sql' -f $dbName, (Get-Date -Format 'yyyyMMdd_HHmmss'))
Write-Host "2/7  Respaldando la base actual en $respaldo ..."
$existe = & $mysql @conn -N -B -e "SHOW DATABASES LIKE '$dbName';"
if ($existe) {
    cmd /c ($q + $mysqldump + $q + " $connTexto --routines --triggers --single-transaction $dbName > " + $q + $respaldo + $q)
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'El respaldo falló; no se toca nada.' -ForegroundColor Red
        $env:MYSQL_PWD = $null
        exit 1
    }
    Write-Host ('     {0:N1} MB' -f ((Get-Item $respaldo).Length / 1MB))
} else {
    Write-Host '     La base no existe todavía; no hay nada que respaldar.'
    $respaldo = '(ninguno)'
}

# --- 3. Volcado sin los triggers truncados ----------------------------------
# phpMyAdmin exportó 11 triggers cortados en su primer ";" dentro de bloques
# DELIMITER $$ ... DELIMITER ; . Importados tal cual abortan con ERROR 1064, así
# que se omiten; triggers_y_auditoria.sql restaura los que sobrevivieron.
Write-Host '3/7  Preparando schema.sql sin los bloques DELIMITER truncados ...'
$origen   = Join-Path $carpetaDb 'schema.sql'
$filtrado = Join-Path $env:TEMP 'luciernaga_schema_sin_triggers.sql'
$dentro   = $false
$salida   = New-Object System.Collections.Generic.List[string]
$totalLineas = 0
foreach ($linea in [System.IO.File]::ReadLines($origen)) {
    $totalLineas++
    if ($linea -match '^DELIMITER \$\$') { $dentro = $true; continue }
    if ($linea -match '^DELIMITER ;' -and $dentro) { $dentro = $false; continue }
    if (-not $dentro) { $salida.Add($linea) }
}
[System.IO.File]::WriteAllLines($filtrado, $salida, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ('     {0} líneas conservadas de {1}' -f $salida.Count, $totalLineas)

if ($SoloRespaldo) {
    Write-Host ''
    Write-Host 'Modo -SoloRespaldo: no se borró nada.' -ForegroundColor Green
    Write-Host "Respaldo: $respaldo"
    Write-Host "Volcado filtrado listo en: $filtrado"
    $env:MYSQL_PWD = $null
    exit 0
}

# --- 4. Confirmación y recreación -------------------------------------------
Write-Host ''
Write-Host "Se va a BORRAR la base '$dbName' y a recrearla con los datos reales de schema.sql." -ForegroundColor Yellow
Write-Host 'Desaparecerán los usuarios DEV, los inventarios de demostración y las cajas/FUID de prueba.'
$r = Read-Host 'Escribe SI para continuar'
if ($r -ne 'SI') { Write-Host 'Cancelado. No se tocó nada.'; $env:MYSQL_PWD = $null; exit 0 }

Write-Host "4/7  Recreando la base $dbName ..."
& $mysql @conn -e "DROP DATABASE IF EXISTS ``$dbName``; CREATE DATABASE ``$dbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo recrear la base.' -ForegroundColor Red; $env:MYSQL_PWD = $null; exit 1 }

function Importar([string]$archivo, [string]$etiqueta) {
    Write-Host ('     -> {0}' -f $etiqueta)
    # "source" es un comando del cliente interactivo y no viaja por -e: el archivo
    # entra por la entrada estándar, y en PowerShell 5.1 la redirección a un
    # ejecutable nativo la hace cmd.
    cmd /c ($q + $mysql + $q + " $connTexto $dbName < " + $q + $archivo + $q)
    if ($LASTEXITCODE -ne 0) { throw "Falló la importación de $etiqueta" }
}

try {
    Write-Host '5/7  Importando el volcado real (81.000 registros FUID; tarda unos minutos) ...'
    Importar $filtrado 'schema.sql (sin triggers truncados)'

    Write-Host '6/7  Aplicando migraciones ...'
    $migraciones = @(
        'timestamps_auditoria.sql',
        'asignacion_upd.sql',
        'inventario_auditoria_zoho.sql',
        'triggers_y_auditoria.sql',
        'indices_velocidad.sql',
        'indices_dashboard.sql',
        'suspension_usuario.sql',
        'rangos_upd.sql',
        'caja_modulo_unica.sql'
    )
    foreach ($m in $migraciones) { Importar (Join-Path $carpetaDb $m) $m }
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "La base puede haber quedado incompleta. El respaldo previo está en: $respaldo"
    $env:MYSQL_PWD = $null
    exit 1
}

# --- 7. Verificación --------------------------------------------------------
Write-Host '7/7  Conteos finales:'
& $mysql @conn -t $dbName -e "SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM users UNION ALL SELECT 'clientes', COUNT(*) FROM sub_modulos UNION ALL SELECT 'actas', COUNT(*) FROM moduloscliente UNION ALL SELECT 'cajas', COUNT(*) FROM modulos_caja UNION ALL SELECT 'fuid', COUNT(*) FROM fuiddatosreal UNION ALL SELECT 'asignaciones_tecnica', COUNT(*) FROM asignacion_caja_tecnica UNION ALL SELECT 'asignaciones_calidad', COUNT(*) FROM asignacion_caja_calidad;"
$env:MYSQL_PWD = $null

Write-Host ''
Write-Host 'LISTO. La base contiene únicamente los datos reales del volcado.' -ForegroundColor Green
Write-Host "Respaldo de la base anterior: $respaldo"
Write-Host 'Reinicia el backend (npm run dev) para que tome la base recreada.'
