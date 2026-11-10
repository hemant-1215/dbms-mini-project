import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { appPool } from '../db/pools.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';

export const authRouter = Router();
interface LoginRow extends RowDataPacket { user_id:number;username:string;email:string;full_name:string;role:'admin'|'researcher'|'student';password_hash:string;is_active:number }
interface MeRow extends RowDataPacket { user_id:number;username:string;email:string;full_name:string;role:string;is_active:number }
const registerSchema = z.object({ username: z.string().min(3).max(50), email: z.email().max(120), full_name: z.string().min(1).max(100), password: z.string().min(10).max(72) });
const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(72) });

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const [result] = await appPool.execute('INSERT INTO users(username,email,password_hash,full_name) VALUES(?,?,?,?)', [input.username, input.email.toLowerCase(), hash, input.full_name]);
    res.status(201).json({ user_id: Number((result as { insertId: number }).insertId), username: input.username, email: input.email.toLowerCase(), full_name: input.full_name, role: 'student' });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const [rows] = await appPool.execute<LoginRow[]>(
      'SELECT user_id,username,email,full_name,role,password_hash,is_active FROM users WHERE email=? LIMIT 1', [input.email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(input.password, user.password_hash))) {
      res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Email or password is incorrect.' } }); return;
    }
    const token = jwt.sign({ username: user.username, role: user.role }, env.JWT_SECRET, { subject: String(user.user_id), expiresIn: '8h' });
    res.json({ token, user: { user_id: user.user_id, username: user.username, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (error) { next(error); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await appPool.execute<MeRow[]>(
      'SELECT user_id,username,email,full_name,role,is_active FROM users WHERE user_id=?', [req.principal!.userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) { res.status(401).json({ error: { code: 'ACCOUNT_INACTIVE', message: 'This account is not active.' } }); return; }
    res.json({ user });
  } catch (error) { next(error); }
});
