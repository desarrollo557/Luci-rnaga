# Documentos históricos

Auditorías hechas en agosto de 2026, cuando el software todavía corría sobre
MySQL y antes de la mayor parte del trabajo de septiembre. Se conservan porque
explican decisiones que siguen en el código (la centralización de la
configuración en `constants.ts`, por ejemplo, sale de la auditoría del 19 de
agosto), pero **no describen el estado actual**. Para eso están el README y el
resto de `docs/`.

| Documento | Qué revisó |
| --- | --- |
| `2026-08-13-auditoria-de-arquitectura.md` | Rutas, proxy de Vite, CORS y sesión. Menciona una ruta de depuración `__dev_login` que ya no existe. |
| `2026-08-19-auditoria-de-codigo.md` | Valores fijos en el código, con la sugerencia de moverlos a constantes. Casi todo se aplicó. |
