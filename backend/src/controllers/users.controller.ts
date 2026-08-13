import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../config/db.js';
import type { User } from '../types/db.js';
import type { CreateUserDto, UpdateUserDto } from '../types/index.js';

const saltRounds = 10;

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await query<User>('SELECT * FROM users');
  res.json(users);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = await queryOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) {
    res.status(404).json({ message: 'Usuario no encontrado' });
    return;
  }
  res.json(user);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { cc, nombre, contrasena, rol, sede } = req.body as CreateUserDto;
  try {
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    await query('INSERT INTO users (cc, nombre, contrasena, rol, sede) VALUES (?, ?, ?, ?, ?)', [
      cc,
      nombre,
      hashedPassword,
      rol,
      sede,
    ]);
    res.status(201).send('Usuario creado');
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).send('Error en el servidor');
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { cc, nombre, contrasena, rol, sede } = req.body as UpdateUserDto;
  try {
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    await query('UPDATE users SET cc = ?, nombre = ?, contrasena = ?, rol = ?, sede = ? WHERE id = ?', [
      cc,
      nombre,
      hashedPassword,
      rol,
      sede,
      id,
    ]);
    res.send('Usuario actualizado');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).send('Error en el servidor');
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM users WHERE id = ?', [id]);
  res.send('Usuario eliminado');
}
