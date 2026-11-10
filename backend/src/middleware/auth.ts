import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env.js';
import { appPool } from '../db/pools.js';

export type AppRole = 'admin' | 'researcher' | 'student';
interface ActiveUserRow extends RowDataPacket { role:AppRole;is_active:number }
export interface Principal { userId: number; username: string; role: AppRole }
declare global { namespace Express { interface Request { principal?: Principal } } }

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in is required.' } }); return; }
  let claims:jwt.JwtPayload;
  let userId:number;
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof claims.sub !== 'string' || !['admin','researcher','student'].includes(String(claims.role))) throw new Error('invalid claims');
    userId=Number(claims.sub);
    if(!Number.isSafeInteger(userId)||userId<1)throw new Error('invalid user ID');
  } catch {
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'The access token is invalid or expired.' } });
    return;
  }
  try{
    const [rows]=await appPool.execute<ActiveUserRow[]>('SELECT role,is_active FROM users WHERE user_id=? LIMIT 1',[userId]);
    const user=rows[0];
    if(!user||!user.is_active){res.status(401).json({error:{code:'ACCOUNT_INACTIVE',message:'This account is no longer active.'}});return;}
    req.principal = { userId, username: String(claims.username), role: user.role };
    next();
  }catch(error){next(error);}
}

export function allowRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal || !roles.includes(req.principal.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your role cannot perform this action.' } }); return;
    }
    next();
  };
}
