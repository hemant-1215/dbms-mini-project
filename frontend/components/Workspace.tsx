'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, LogOut } from 'lucide-react';
import { api, signOut, token } from '@/lib/api';

type User={username:string;full_name:string;role:'admin'|'researcher'|'student'};
const links=[['/dashboard','Overview'],['/projects','Projects'],['/catalog/models','Models'],['/catalog/datasets','Datasets'],['/catalog/experiments','Experiments'],['/jobs','Jobs'],['/infrastructure','Infrastructure'],['/monitoring','Monitoring'],['/search','Semantic search'],['/analytics','Analytics'],['/audit','Audit']];

export function Workspace({children}:{children:React.ReactNode}){
  const router=useRouter();const pathname=usePathname();const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{if(!token()){router.replace('/login');return;}api<{user:User}>('/auth/me').then(x=>setUser(x.user)).catch(()=>{localStorage.removeItem('ai-crms-token');router.replace('/login');}).finally(()=>setLoading(false));},[router]);
  if(loading||!user)return <div className="loading">Loading your workspace…</div>;
  const visible=user.role==='admin'?[...links,['/users','Users']]:links;
  return <div className="shell"><header className="topbar"><Link href="/dashboard" className="brand"><span className="brand-mark">A</span>AI-CRMS</Link><nav className="navlinks">{visible.map(([href,label])=><Link key={href} className={pathname===href?'active':''} href={href}>{label}</Link>)}</nav><div className="row"><span className="pill">{user.full_name} · {user.role}</span><button className="button ghost" onClick={()=>signOut()} aria-label="Sign out"><LogOut size={16}/></button></div></header><main className="content">{children}</main><footer className="footer">Database-backed operations · <Activity size={12} style={{verticalAlign:'middle'}}/> live API</footer></div>;
}
