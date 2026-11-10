export const API_URL=process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api';
export function token():string|null{return typeof window==='undefined'?null:localStorage.getItem('ai-crms-token');}
export async function api<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers);headers.set('content-type','application/json');
  const current=token();if(current)headers.set('authorization',`Bearer ${current}`);
  const response=await fetch(`${API_URL}${path}`,{...init,headers,cache:'no-store'});
  if(response.status===204)return undefined as T;
  const body=await response.json();
  if(!response.ok)throw new Error(body?.error?.message??`Request failed (${response.status})`);
  return body as T;
}
export function signOut():void{localStorage.removeItem('ai-crms-token');window.location.href='/login';}
