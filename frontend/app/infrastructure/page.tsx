'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Workspace } from '@/components/Workspace';
import { api } from '@/lib/api';

type Server={server_id:number;hostname:string;location:string|null;total_cpu_cores:number;total_ram_gb:number;total_storage_gb:number;status:string};
type Gpu=Record<string,unknown>;

export default function Infrastructure(){
  const [servers,setServers]=useState<Server[]>([]);
  const [gpus,setGpus]=useState<Gpu[]>([]);
  const [role,setRole]=useState('');
  const [form,setForm]=useState({hostname:'',total_cpu_cores:'32',total_ram_gb:'128',total_storage_gb:'1000',location:''});
  const [gpuForm,setGpuForm]=useState({server_id:'',gpu_index:'0',model_name:'NVIDIA H100',memory_gb:'80',compute_capability:'8.0'});
  const [error,setError]=useState('');

  async function load(){
    try{
      const [serverResult,gpuResult,me]=await Promise.all([
        api<{data:Server[]}>('/servers'),api<{data:Gpu[]}>('/gpus'),api<{user:{role:string}}>('/auth/me')
      ]);
      setServers(serverResult.data);setGpus(gpuResult.data);setRole(me.user.role);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load infrastructure.');}
  }
  useEffect(()=>{void load();},[]);

  async function createServer(e:FormEvent){
    e.preventDefault();setError('');
    try{
      await api('/servers',{method:'POST',body:JSON.stringify({...form,total_cpu_cores:Number(form.total_cpu_cores),total_ram_gb:Number(form.total_ram_gb),total_storage_gb:Number(form.total_storage_gb)})});
      setForm({...form,hostname:''});await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not create server.');}
  }
  async function createGpu(e:FormEvent){
    e.preventDefault();setError('');
    try{
      await api('/gpus',{method:'POST',body:JSON.stringify({...gpuForm,server_id:Number(gpuForm.server_id),gpu_index:Number(gpuForm.gpu_index),memory_gb:Number(gpuForm.memory_gb),compute_capability:Number(gpuForm.compute_capability)})});
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not add GPU.');}
  }
  async function toggleServer(server:Server){
    const status=server.status==='online'?'maintenance':'online';
    try{await api(`/servers/${server.server_id}`,{method:'PATCH',body:JSON.stringify({status})});await load();}
    catch(e){setError(e instanceof Error?e.message:'Server update failed.');}
  }
  async function toggleGpu(gpu:Gpu){
    const current=String(gpu.gpu_status);
    const status=window.prompt('GPU status: available, maintenance, offline',current==='maintenance'?'available':'maintenance');
    if(!status||!['available','maintenance','offline'].includes(status))return;
    try{await api(`/gpus/${String(gpu.gpu_id)}`,{method:'PATCH',body:JSON.stringify({status})});await load();}
    catch(e){setError(e instanceof Error?e.message:'GPU update failed.');}
  }
  async function removeServer(id:number){
    if(!confirm('Delete server and its GPUs?'))return;
    try{await api(`/servers/${id}`,{method:'DELETE'});await load();}
    catch(e){setError(e instanceof Error?e.message:'Server delete failed.');}
  }
  async function removeGpu(id:string){
    if(!confirm('Delete this GPU? GPUs with allocation history cannot be deleted.'))return;
    try{await api(`/gpus/${id}`,{method:'DELETE'});await load();}
    catch(e){setError(e instanceof Error?e.message:'GPU delete failed.');}
  }

  return <Workspace>
    <div className="section-title"><div><div className="eyebrow">Fleet administration</div><h1>Infrastructure</h1></div></div>
    {error&&<p className="error">{error}</p>}
    {role==='admin'&&<>
      <section className="panel">
        <h2>Add compute server</h2>
        <form className="form-grid" onSubmit={createServer}>
          <label className="field">Hostname<input required value={form.hostname} onChange={e=>setForm({...form,hostname:e.target.value})}/></label>
          <label className="field">Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
          <label className="field">CPU cores<input type="number" min="1" value={form.total_cpu_cores} onChange={e=>setForm({...form,total_cpu_cores:e.target.value})}/></label>
          <label className="field">RAM GB<input type="number" min="1" value={form.total_ram_gb} onChange={e=>setForm({...form,total_ram_gb:e.target.value})}/></label>
          <label className="field">Storage GB<input type="number" min="1" value={form.total_storage_gb} onChange={e=>setForm({...form,total_storage_gb:e.target.value})}/></label>
          <div><button className="button primary">Add server</button></div>
        </form>
      </section>
      <section className="panel">
        <h2>Add GPU</h2>
        <form className="form-grid" onSubmit={createGpu}>
          <label className="field">Server<select required value={gpuForm.server_id} onChange={e=>setGpuForm({...gpuForm,server_id:e.target.value})}><option value="">Choose server</option>{servers.map(s=><option key={s.server_id} value={s.server_id}>{s.hostname}</option>)}</select></label>
          <label className="field">GPU index<input type="number" min="0" max="255" required value={gpuForm.gpu_index} onChange={e=>setGpuForm({...gpuForm,gpu_index:e.target.value})}/></label>
          <label className="field">Model<input required value={gpuForm.model_name} onChange={e=>setGpuForm({...gpuForm,model_name:e.target.value})}/></label>
          <label className="field">Memory GB<input type="number" min="1" required value={gpuForm.memory_gb} onChange={e=>setGpuForm({...gpuForm,memory_gb:e.target.value})}/></label>
          <label className="field">Compute capability<input type="number" min="0.1" step="0.1" required value={gpuForm.compute_capability} onChange={e=>setGpuForm({...gpuForm,compute_capability:e.target.value})}/></label>
          <div><button className="button primary" disabled={!servers.length}>Add GPU</button></div>
        </form>
      </section>
    </>}
    <section className="panel">
      <h2>Servers</h2>
      {!servers.length?<div className="empty">No servers are registered.</div>:<div className="table-wrap"><table><thead><tr><th>Host</th><th>Location</th><th>CPU</th><th>RAM</th><th>Storage</th><th>Status</th>{role==='admin'&&<th>Actions</th>}</tr></thead><tbody>{servers.map(s=><tr key={s.server_id}><td>{s.hostname}</td><td>{s.location}</td><td>{s.total_cpu_cores}</td><td>{s.total_ram_gb} GB</td><td>{s.total_storage_gb} GB</td><td><span className={`status ${s.status}`}>{s.status}</span></td>{role==='admin'&&<td><div className="row"><button className="button" onClick={()=>toggleServer(s)}>Edit status</button><button className="button" onClick={()=>removeServer(s.server_id)}>Delete</button></div></td>}</tr>)}</tbody></table></div>}
    </section>
    <section className="panel">
      <h2>GPU inventory</h2>
      {!gpus.length?<div className="empty">No GPUs are registered.</div>:<div className="table-wrap"><table><thead><tr><th>GPU</th><th>Host</th><th>Memory</th><th>Compute</th><th>Utilization</th><th>Status</th>{role==='admin'&&<th>Actions</th>}</tr></thead><tbody>{gpus.map(g=><tr key={String(g.gpu_id)}><td>{String(g.model_name)} · #{String(g.gpu_index)}</td><td>{String(g.hostname)}</td><td>{String(g.memory_gb)} GB</td><td>{String(g.compute_capability)}</td><td>{String(g.utilization_pct)}%</td><td><span className={`status ${String(g.gpu_status)}`}>{String(g.gpu_status)}</span></td>{role==='admin'&&<td><div className="row"><button className="button" disabled={String(g.gpu_status)==='allocated'} onClick={()=>toggleGpu(g)}>Change status</button><button className="button" onClick={()=>removeGpu(String(g.gpu_id))}>Delete</button></div></td>}</tr>)}</tbody></table></div>}
    </section>
  </Workspace>;
}
