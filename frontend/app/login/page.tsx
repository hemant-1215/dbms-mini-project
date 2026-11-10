'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage(){
  const router=useRouter();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setError('');setBusy(true);try{const result=await api<{token:string}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('ai-crms-token',result.token);router.push('/dashboard');}catch(e){setError(e instanceof Error?e.message:'Sign in failed.');}finally{setBusy(false);}}
  return <main className="shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">A</span>AI-CRMS</Link><Link className="navlinks" href="/register">Create account</Link></header><form className="panel form-card stack" onSubmit={submit}><div><div className="eyebrow">Welcome back</div><h1>Sign in</h1><p className="muted">Open your research compute workspace.</p></div><label className="field">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field">Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button className="button primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><div className="muted" style={{fontSize:13}}>New to AI-CRMS? <Link href="/register" style={{color:'var(--accent)'}}>Create a student account</Link></div></form></main>
}
