'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function RegisterPage(){
  const router=useRouter();const [form,setForm]=useState({username:'',email:'',full_name:'',password:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  function change(key:keyof typeof form,value:string){setForm(current=>({...current,[key]:value}));}
  async function submit(event:React.FormEvent){event.preventDefault();setError('');setBusy(true);try{await api('/auth/register',{method:'POST',body:JSON.stringify(form)});const result=await api<{token:string}>('/auth/login',{method:'POST',body:JSON.stringify({email:form.email,password:form.password})});localStorage.setItem('ai-crms-token',result.token);router.push('/dashboard');}catch(e){setError(e instanceof Error?e.message:'Registration failed.');}finally{setBusy(false);}}
  return <main className="shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">A</span>AI-CRMS</Link><Link className="navlinks" href="/login">Sign in</Link></header><form className="panel form-card stack" onSubmit={submit}><div><div className="eyebrow">Start with a student account</div><h1>Create account</h1><p className="muted">An administrator can promote your role later.</p></div><label className="field">Full name<input required maxLength={100} value={form.full_name} onChange={e=>change('full_name',e.target.value)}/></label><label className="field">Username<input required minLength={3} maxLength={50} value={form.username} onChange={e=>change('username',e.target.value)}/></label><label className="field">Email<input required type="email" value={form.email} onChange={e=>change('email',e.target.value)}/></label><label className="field">Password<input required type="password" minLength={10} maxLength={72} value={form.password} onChange={e=>change('password',e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button className="button primary" disabled={busy}>{busy?'Creating…':'Create student account'}</button></form></main>
}
