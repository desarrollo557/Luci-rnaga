-- Usuarios de DESARROLLO para el acceso rápido de frontend/src/pages/Login.tsx
-- (ese panel solo se renderiza bajo import.meta.env.DEV, nunca en el build de producción).
-- Script idempotente. NO EJECUTAR EN PRODUCCIÓN.
-- Las contraseñas son las que el propio Login.tsx muestra en el panel de dev.
--
-- Fueron cuatro cuentas. La de CALIDAD se quitó al retirarse ese perfil del
-- software: el login rechaza ese rol, así que la cuenta se creaba para no poder
-- entrar con ella.

INSERT INTO users (cc, nombre, contrasena, rol, sede)
SELECT '1085040904', 'DEV ADMINISTRADOR', '$2b$10$V.2CpWQCj/01kKAAhiCZDedOwT4XZVJhgJ7GVYmRuSM0QnwC3tIbG', 'ADMIN', 'BARRANQUILLA'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE cc = '1085040904');

INSERT INTO users (cc, nombre, contrasena, rol, sede)
SELECT '12345678910', 'DEV LIDER', '$2b$10$3EIfHwUB7lvECa8kSkBKBurT6./h8zBAj0Vu7nWZEvDzvdAfdOPTK', 'LIDER', 'BARRANQUILLA'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE cc = '12345678910');

INSERT INTO users (cc, nombre, contrasena, rol, sede)
SELECT '123456789', 'DEV TECNICA', '$2b$10$cHMjkvoado0KoDxHf1D92OkxFLz4LWELD8dU51WGWmdAuj9ajt3dS', 'TECNICA', 'BARRANQUILLA'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE cc = '123456789');
