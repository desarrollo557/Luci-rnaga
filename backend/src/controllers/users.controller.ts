import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, queryResult } from '../config/db.js';
import type { User } from '../types/db.js';
import type { CreateUserDto, UpdateUserDto } from '../types/index.js';

const saltRounds = 10;

const userSafeFields = 'id, cc, nombre, rol, sede, suspendido_hasta, created_at, updated_at';

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await query<User>(`SELECT ${userSafeFields} FROM users`);
  res.json(users);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = await queryOne<User>(`SELECT ${userSafeFields} FROM users WHERE id = ?`, [id]);
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
    const fields: string[] = [];
    const values: unknown[] = [];

    if (contrasena !== undefined && contrasena !== '') {
      fields.push('contrasena = ?');
      values.push(await bcrypt.hash(contrasena, saltRounds));
    }

    fields.push('cc = ?', 'nombre = ?', 'rol = ?', 'sede = ?');
    values.push(cc, nombre, rol, sede, id);

    const result = await queryResult(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }
    res.send('Usuario actualizado');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).send('Error en el servidor');
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await queryResult('DELETE FROM users WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Usuario no encontrado' });
    return;
  }
  res.send('Usuario eliminado');
}

export async function suspenderUsuario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { suspendido_hasta } = req.body as { suspendido_hasta?: string | null };

  if (suspendido_hasta !== undefined && suspendido_hasta !== null && suspendido_hasta !== '') {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(suspendido_hasta)) {
      res.status(400).json({ message: 'Formato de fecha inválido. Use YYYY-MM-DD' });
      return;
    }
    const fechaSusp = new Date(suspendido_hasta);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaSusp < hoy) {
      res.status(400).json({ message: 'La fecha de suspensión no puede ser anterior a hoy' });
      return;
    }
  }

  const valor = suspendido_hasta && suspendido_hasta !== '' ? suspendido_hasta : null;

  const result = await queryResult('UPDATE users SET suspendido_hasta = ? WHERE id = ?', [valor, id]);
  if (result.affectedRows === 0) {
    res.status(404).json({ message: 'Usuario no encontrado' });
    return;
  }

  res.send(valor ? `Usuario suspendido hasta el ${formatDate(valor)}` : 'Usuario reactivado');
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
