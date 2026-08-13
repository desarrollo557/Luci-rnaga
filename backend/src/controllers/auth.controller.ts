import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne } from '../config/db.js';
import type { User } from '../types/db.js';
import type { LoginRequest, LoginResponse } from '../types/index.js';

const saltRounds = 10;

export async function currentUser(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  res.json({ cc: user.cc, nombre: user.nombre, rol: user.rol, sede: user.sede });
}

export async function checkAuth(req: Request, res: Response): Promise<void> {
  if (req.session.user) {
    res.status(200).send('Autenticado');
  } else {
    res.status(401).send('No autenticado');
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { cc, contrasena } = req.body as LoginRequest;

  try {
    const user = await queryOne<User>('SELECT * FROM users WHERE cc = ?', [cc]);

    if (!user) {
      res.status(200).json({ success: false, message: 'Usuario o contraseña incorrectos' } satisfies LoginResponse);
      return;
    }

    const isPasswordEncrypted = user.contrasena?.startsWith('$2b$');
    let match = false;
    if (isPasswordEncrypted) {
      match = await bcrypt.compare(contrasena, user.contrasena);
    } else {
      match = contrasena === user.contrasena;
    }

    if (!match) {
      res.status(200).json({ success: false, message: 'Usuario o contraseña incorrectos' } satisfies LoginResponse);
      return;
    }

    req.session.user = {
      id: user.id,
      cc: user.cc,
      nombre: user.nombre,
      rol: user.rol,
      sede: user.sede ?? '',
    };

    if (user.rol === 'ADMIN') {
      res.status(200).json({ success: true, redirect: '/admin' } satisfies LoginResponse);
    } else if (['TECNICA', 'LIDER', 'CALIDAD'].includes(user.rol)) {
      res.status(200).json({ success: true, redirect: '/clientes' } satisfies LoginResponse);
    } else {
      res.status(200).json({ success: false, message: 'Rol no autorizado' } satisfies LoginResponse);
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' } satisfies LoginResponse);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      res.status(500).send('Error en el servidor');
      return;
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true });
  });
}

export { saltRounds };
