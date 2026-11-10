'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Workspace } from '@/components/Workspace';
import { api } from '@/lib/api';

type User={user_id:number;username:string;email:string;full_name:string;role:'admin'|'researcher'|'student';is_active:boolean};

export default function UsersPage(){
  const [rows,setRows]=useState<User[]>([]);
  const [form,setForm]=useState({username:'',email:'',full_name:'',password:'',role:'student' as User['role']});
  const [error,setError]=useState('');
  async function load(){
    try{setRows((await api<{data:User[]}>('/users')).data);}
    catch(e){setError(e instanceof Error?e.message:'Could not load users.');}
  }
  useEffect(()=>{void load();},[]);
  async function create(e:FormEvent){
    e.preventDefault();setError('');
    try{
      await api('/users',{method:'POST',body:JSON.stringify(form)});
      setForm({username:'',email:'',full_name:'',password:'',role:'student'});await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not create account.');}
  }
  async function edit(user:User,changes:Partial<User>){
    setError('');
    try{await api(`/users/${user.user_id}`,{method:'PATCH',body:JSON.stringify(changes)});await load();}
    catch(e){setError(e instanceof Error?e.message:'Account update failed.');}
  }
  async function changeRole(user:User){
    const role=window.prompt('Role: admin, researcher, or student',user.role);
    if(!role||!['admin','researcher','student'].includes(role))return;
    await edit(user,{role:role as User['role']});
  }
  async function remove(user:User){
    if(!confirm(`Delete ${user.username}? Accounts referenced by projects or jobs cannot be deleted.`))return;
    setError('');
    try{await api(`/users/${user.user_id}`,{method:'DELETE'});await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not delete account.');}
  }

  return <Workspace>
    <div className="section-title"><div><div className="eyebrow">Access control</div><h1>User management</h1></div></div>
    {error&&<p className="error">{error}</p>}
    <section className="panel">
      <h2>Create account</h2>
      <form className="form-grid" onSubmit={create}>
        <label className="field">Username<input required minLength={3} maxLength={50} value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
        <label className="field">Email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label className="field">Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
        <label className="field">Temporary password<input required type="password" minLength={10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
        <label className="field">Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value as User['role']})}><option value="student">Student</option><option value="researcher">Researcher</option><option value="admin">Admin</option></select></label>
        <div><button className="button primary">Create account</button></div>
      </form>
    </section>
    <section className="panel">
      <h2>Accounts</h2>
      {!rows.length?<div className="empty">No accounts available.</div>:<div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead><tbody>{rows.map(user=><tr key={user.user_id}><td>{user.full_name}<div className="muted">@{user.username}</div></td><td>{user.email}</td><td><span className="status">{user.role}</span></td><td>{user.is_active?'Yes':'No'}</td><td><div className="row"><button className="button" onClick={()=>void changeRole(user)}>Change role</button><button className="button" onClick={()=>void edit(user,{is_active:!user.is_active})}>{user.is_active?'Deactivate':'Activate'}</button><button className="button" onClick={()=>void remove(user)}>Delete</button></div></td></tr>)}</tbody></table></div>}
    </section>
  </Workspace>;
}
