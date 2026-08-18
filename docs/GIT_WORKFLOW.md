# Flujo de Trabajo en Git — Luciérnaga Host

Este documento define la secuencia de trabajo con las ramas `develop`, `production` y `main`, y los pipelines que validan cada cambio antes de llegar a ellas.

## Modelo de ramas

| Rama | Uso | Quién escribe | Pipeline |
| --- | --- | --- | --- |
| `develop` | Integración diaria de features y fixes | Features branches vía PR | `CI — develop` |
| `production` | Versión estable lista para deploy | Solo merges desde `develop` o hotfixes | `CI — production` |
| `main` | Historial de releases (tags `vX.Y.Z`) | Solo merges desde `production` | `CI — main` |

## Secuencia rápida (happy path)

```mermaid
gitGraph
    commit id: "inicio"
    branch develop
    checkout develop
    branch feat/mi-feature
    commit id: "feature"
    checkout develop
    merge feat/mi-feature tag: "CI develop ✔"
    checkout production
    merge develop tag: "CI production ✔"
    checkout main
    merge production tag: "CI main ✔ (v1.0.0)"
```

### Paso a paso

1. **Siempre partir de `develop` actualizada**

   ```bash
   git checkout develop
   git pull
   git checkout -b feat/mi-feature
   ```

2. **Desarrollar y commitear en la feature branch** (commits pequeños y descriptivos).

3. **Subir la feature branch y abrir PR hacia `develop`**

   ```bash
   git push -u origin feat/mi-feature
   ```

   El pipeline **CI — develop** corre automáticamente sobre el PR. Solo se mergea si pasa ✅.

4. **Cuando `develop` está listo para producción**: abrir PR `develop` → `production`. Corre **CI — production**. Solo se mergea si pasa ✅.

5. **Al publicar una versión**: abrir PR `production` → `main` y crear el tag de versión (`git tag v1.0.0`).

## Reglas de oro

- **Nunca** commitees directo a `develop`, `production` o `main`. Todo entra por PR validado.
- **Nunca** mergees una rama hacia atrás (ej. `production` → `develop`) salvo hotfixes.
- **Hotfix urgente**: rama desde `production` → PR → `production`, y después backport del mismo fix a `develop`.
- Si un pipeline falla, el PR queda bloqueado hasta corregir y volver a pasar.

## Hotfix (emergencia en producción)

```bash
git checkout production
git pull
git checkout -b hotfix/arreglo-urgente
# corregir, commitear, push
git push -u origin hotfix/arreglo-urgente
# PR: hotfix/arreglo-urgente → production (CI production ✔ → merge)
# PR: hotfix/arreglo-urgente → develop (backport, CI develop ✔ → merge)
```

## Lo que valida el pipeline orquestador

Cada pipeline corre las mismas validaciones sobre el código, en este orden:

| Paso | Comando | Falla si |
| --- | --- | --- |
| Instalación | `npm ci` (backend + frontend) | Dependencias rotas o lockfile desactualizado |
| Typecheck backend | `npm --prefix backend run typecheck` | Errores de tipos en TypeScript |
| Typecheck frontend | `npm --prefix frontend run typecheck` | Errores de tipos en TypeScript |
| Build backend | `npm --prefix backend run build` | Compilación fallida |
| Build frontend | `npm --prefix frontend run build` | Compilación de producción fallida |

Si cualquiera de estos pasos falla, el pipeline reporta ❌ y el PR no puede mergearse.

## Protección de ramas (recomendado, configuración en GitHub)

En `Settings → Branches → Add rule`, para cada rama (`develop`, `production`, `main`):

- [ ] Require a pull request before merging
- [ ] Require status checks to pass before merging
- [ ] Seleccionar los checks del pipeline correspondiente
- [ ] (opcional) Require approvals y `Do not allow bypassing`

Esto hace que el pipeline sea **obligatorio**, no solo informativo.
