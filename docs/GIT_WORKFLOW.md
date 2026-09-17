# Flujo de trabajo en Git

Tres ramas, un solo sentido y un pipeline que corre en cada cambio. Este
documento cuenta cómo llega un cambio desde el equipo de quien lo escribe hasta
Render.

## Las ramas

| Rama | Qué es | Quién escribe en ella |
| --- | --- | --- |
| `develop` | El día a día. Es lo que cada quien tiene en local. | Las ramas de trabajo, por PR. |
| `main` | Integración. Todo pasa por aquí antes de producción, y su historial es el que se lee para saber qué se publicó y cuándo. | Solo `develop`, por PR. |
| `production` | Lo que corre en Render. Cada push a esta rama despliega. | Solo `main`. |

El flujo es **unidireccional**: `develop` → `main` → `production`. Nunca al
revés. El repositorio llegó a tener merges cruzados (`production` devolviendo
commits a `main`, `develop` y `main` fusionándose mutuamente) y cada vuelta
atrás añadía un merge que no aportaba nada y enredaba la lectura del historial.
Cuando se puso orden, las tres quedaron alineadas en el mismo commit, y así se
mantienen: en un momento tranquilo, las tres apuntan al mismo sitio.

Las tres ramas están protegidas en GitHub con las mismas reglas: no admiten
force push, exigen que el commit haya pasado los checks `Backend — typecheck +
build` y `Frontend — typecheck + build` sobre la base actual, y las reglas
aplican también a los administradores. No exigen PR ni aprobaciones, pero la
exigencia de checks hace que en la práctica todo entre por PR: un commit que no
ha pasado por el CI no se puede empujar.

## El camino normal

1. Partir siempre de `develop` al día:

   ```bash
   git checkout develop
   git pull
   git checkout -b fix/lo-que-se-arregla
   ```

   Los nombres de rama llevan el tipo delante: `feat/`, `fix/`, `docs/`,
   `chore/`, `refactor/`, `test/`. Con guiones y en español, como los commits.

2. Trabajar y hacer commits pequeños. Cada uno cuenta **qué pasaba y por qué se
   cambia**, no solo qué se tocó; el cuerpo es prosa, no una lista de archivos.
   La primera línea sigue la forma `tipo(ámbito): resumen en minúsculas`, por
   ejemplo `fix(seguimiento): el informe salía vacío porque la consulta
   descartaba datos`.

3. Subir la rama y abrir el PR hacia `develop`:

   ```bash
   git push -u origin fix/lo-que-se-arregla
   gh pr create --base develop
   ```

   La descripción del PR sigue la misma idea que el commit: qué pasaba, qué
   cambia y qué se comprobó. El pipeline corre solo sobre el PR.

4. Con el CI en verde, fusionar con merge (no squash: el historial conserva los
   commits tal como se escribieron) y borrar la rama de trabajo. Las únicas
   ramas que viven de forma permanente son las tres de arriba.

5. Cuando `develop` está listo para publicarse, abrir el PR `develop` → `main`
   y fusionarlo. Suele hacerse justo después de cada cambio terminado, para
   que `main` no acumule cosas a medio probar.

6. Llevar `main` a producción. Como `production` no exige PR y el commit ya
   pasó los checks en `main`, basta con un fast-forward:

   ```bash
   git push origin main:production
   ```

   También vale un PR `main` → `production`; el resultado es el mismo. Render
   detecta el push, construye y despliega. El primer arranque después del
   despliegue aplica los ajustes de esquema (ver [`ENTORNOS.md`](ENTORNOS.md)).

## Antes de llevar algo a producción

Hay una regla que no la impone GitHub y conviene tener en la cabeza: **no se
despliega nada que dependa de un paso manual sin haber dado antes ese paso**. Si
un cambio necesita un script de `database/supabase/` que el servidor no puede
aplicar solo, el script se ejecuta primero en Supabase y después se empuja
`production`. Al revés, la aplicación se queda rota hasta que alguien se acuerde
del SQL pendiente, que es exactamente lo que pasó una vez con la columna del
segundo perfil.

## Emergencia en producción

Si hay que arreglar algo en producción sin esperar a lo que haya en `develop`:

```bash
git checkout main
git pull
git checkout -b fix/arreglo-urgente
# corregir, commitear, push
gh pr create --base main
# con el CI en verde: fusionar y empujar main a production
git push origin main:production
# y después llevar el mismo arreglo a develop
gh pr create --base develop --head fix/arreglo-urgente
```

El PR hacia `develop` es lo que evita que el arreglo se pierda en la siguiente
publicación. Es la única situación en la que un cambio entra en `main` sin haber
pasado antes por `develop`.

## Lo que corre el pipeline

Un solo workflow, `.github/workflows/ci.yml`, se dispara en cada push y cada PR
a cualquiera de las tres ramas. Tiene tres trabajos en paralelo y un cuarto que
espera a los otros:

| Trabajo | Qué hace | Falla si |
| --- | --- | --- |
| Backend — typecheck + build | `npm ci`, `tsc --noEmit`, `tsc` | Errores de tipos o de compilación |
| Backend — pruebas | `npm test` (Vitest, con PGlite para las consultas) | Alguna prueba falla |
| Frontend — typecheck + build | `npm ci`, typecheck, lint de hooks, `npm test`, build de Vite | Errores de tipos, un hook después de un `return`, una prueba que falla o un build roto |
| Orquestador — gate final | Confirma que los tres anteriores pasaron | Cualquiera de ellos |

Las ramas protegidas exigen hoy los dos trabajos de typecheck + build. Las
pruebas del backend corren en el mismo pipeline, pero no están en la lista de
checks obligatorios de GitHub: si se quiere que una prueba rota bloquee el
merge, hay que añadir `Backend — pruebas` en la configuración de cada rama
(Settings → Branches). Las del frontend sí bloquean, porque van dentro del
trabajo de typecheck + build.

## Cosas que conviene saber

- `git status --ignored`, `find` o `grep -r` sobre el repositorio con
  `node_modules` presente son lentos; con `--exclude-dir=node_modules` van bien.
- Los archivos del repositorio se guardan con finales de línea LF y Git los
  convierte a CRLF en Windows (`core.autocrlf`). Los avisos "LF will be replaced
  by CRLF" al hacer commit son normales y no indican ningún problema.
- Si dos personas (o dos sesiones de trabajo) comparten el mismo directorio de
  trabajo, cada una debe confirmar sus cambios en su propia rama antes de que la
  otra cambie de rama: `git checkout` se niega a cambiar si un archivo
  modificado difiere entre las dos ramas.
