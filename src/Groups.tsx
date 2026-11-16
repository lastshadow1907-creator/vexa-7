import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Plus,Send,Users,Settings,UserPlus,LogOut,Shield,ShieldOff,UserMinus,Save,X,Search} from 'lucide-react';
import {supabase} from './supabase';

type Profile={id:string;display_name?:string|null};
type Group={id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null};
type Member={user_id:string;role:string};
type Message={id:string;group_id:string;sender_id:string;body:string;created_at:string};
type Props={
 userId:string;profiles:Profile[];onClose?:()=>void;mode?:'full'|'list'|'chat';
 activeGroupId?:string|null;onSelectGroup?:(id:string|null)=>void;
 activeGroup?:Group|null;onSelectGroupData?:(group:Group|null)=>void
};
const name=(p?:Profile)=>p?.display_name?.trim()||'Vexa kullanıcısı';
let channelIndex=0;

export default function Groups({userId,profiles,onClose,mode='full',activeGroupId,onSelectGroup,activeGroup,onSelectGroupData}:Props){
 const [groups,setGroups]=useState<Group[]>([]);
 const [localGroup,setLocalGroup]=useState<Group|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [members,setMembers]=useState<Member[]>([]);
 const [draft,setDraft]=useState('');
 const [newName,setNewName]=useState('');
 const [description,setDescription]=useState('');
 const [avatar,setAvatar]=useState('');
 const [creating,setCreating]=useState(false);
 const [settings,setSettings]=useState(false);
 const [adding,setAdding]=useState(false);
 const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const groupId=mode==='full'?localGroup?.id:activeGroupId||undefined;
 const group=mode==='full'?localGroup:groups.find(g=>g.id===groupId)||((activeGroup?.id===groupId)?activeGroup:null);
 const isOwner=group?.created_by===userId;
 const isAdmin=isOwner||members.some(m=>m.user_id===userId&&m.role==='admin');
 const candidates=useMemo(()=>profiles.filter(p=>p.id!==userId&&!members.some(m=>m.user_id===p.id)&&name(p).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).slice(0,30),[profiles,members,search,userId]);
 const person=(id:string)=>name(profiles.find(p=>p.id===id));
 const refreshGroups=useCallback(async()=>{
  const r=await supabase.from('vexa_group_members').select('group_id,group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);
  if(r.error){setError(r.error.message);return}
  const list=(r.data||[]).flatMap((item:any)=>item.group?[item.group as Group]:[]);
  setGroups(list);
  setLocalGroup(prev=>prev?list.find(g=>g.id===prev.id)||null:null);
 },[userId]);
 const refreshChat=useCallback(async()=>{
  if(!groupId)return;
  const [m,u]=await Promise.all([
   supabase.from('vexa_group_messages').select('id,group_id,sender_id,body,created_at').eq('group_id',groupId).order('created_at',{ascending:true}).limit(250),
   supabase.from('vexa_group_members').select('user_id,role').eq('group_id',groupId)
  ]);
  if(m.error)setError(m.error.message);else setMessages((m.data||[]) as Message[]);
  if(u.error)setError(u.error.message);else setMembers((u.data||[]) as Member[]);
 },[groupId]);
 useEffect(()=>{void refreshGroups()},[refreshGroups]);
 useEffect(()=>{
  if(!groupId){setMessages([]);setMembers([]);return}
  void refreshChat();
  const channel=supabase.channel(`vexa-groups-new-${groupId}-${++channelIndex}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_messages',filter:`group_id=eq.${groupId}`},()=>void refreshChat())
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_members',filter:`group_id=eq.${groupId}`},()=>{void refreshChat();void refreshGroups()})
   .subscribe();
  return()=>{void supabase.removeChannel(channel)};
 },[groupId,refreshChat,refreshGroups]);
 useEffect(()=>{
  if(group){setNewName(group.title);setDescription(group.description||'');setAvatar(group.avatar_url||'')}
 },[group?.id,group?.title,group?.description,group?.avatar_url]);
 async function callRpc(fn:string,args:Record<string,unknown>,success:string){
  setBusy(true);setError('');setNotice('');
  try{
   const r=await supabase.rpc(fn,args);
   if(r.error)throw r.error;
   setNotice(success);
   await Promise.all([refreshGroups(),refreshChat()]);
   return true;
  }catch(e){setError(e instanceof Error?e.message:String(e));return false}
  finally{setBusy(false)}
 }
 async function create(){
  if(newName.trim().length<3)return;
  const title=newName.trim();
  if(await callRpc('vexa8_group_create',{p_title:title},'Grup oluşturuldu.')){
   setCreating(false);
   const r=await supabase.from('vexa_group_members').select('group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);
   const g=(r.data||[]).flatMap((item:any)=>item.group?[item.group as Group]:[]).find(x=>x.title===title&&x.created_by===userId);
   if(g)select(g);
  }
 }
 function select(g:Group|null){
  setLocalGroup(g);onSelectGroup?.(g?.id||null);onSelectGroupData?.(g);
  setSettings(false);setAdding(false);setError('');
 }
 async function send(){
  const body=draft.trim();if(!groupId||!body||busy)return;
  setBusy(true);setError('');
  const r=await supabase.from('vexa_group_messages').insert({group_id:groupId,sender_id:userId,body});
  setBusy(false);
  if(r.error)setError(r.error.message);else{setDraft('');await refreshChat()}
 }
 async function leave(){
  if(!groupId||!window.confirm('Gruptan ayrılmak istiyor musun?'))return;
  if(await callRpc('vexa8_group_leave',{p_group_id:groupId},'Gruptan ayrıldın.'))select(null);
 }
 const input:React.CSSProperties={width:'100%',background:'var(--panel2,#20352a)',color:'var(--text,#fff)',border:'1px solid var(--line,#3b5544)',padding:10,borderRadius:10};
 const button:React.CSSProperties={background:'var(--panel2,#274632)',color:'var(--text,#fff)',padding:'9px 12px',borderRadius:10,display:'inline-flex',gap:7,alignItems:'center'};
 return <div className={`vexa-groups-layout vexa91-mode-${mode} ${group?'group-open':''}`}>
  {mode!=='chat'&&<aside className="vexa-groups-sidebar">
   <header className="vexa-groups-list-header">
    {mode==='full'&&<button onClick={onClose} title="Geri"><ArrowLeft size={20}/></button>}
    <h2>Gruplar</h2><button onClick={()=>setCreating(v=>!v)} title="Grup oluştur"><Plus size={20}/></button>
   </header>
   {creating&&<div className="vexa-group-create"><input style={input} value={newName} onChange={e=>setNewName(e.target.value)} maxLength={50} placeholder="Yeni grup adı"/><button style={button} disabled={busy||newName.trim().length<3} onClick={()=>void create()}>Oluştur</button></div>}
   <div className="vexa-groups-list">{groups.map(g=><button key={g.id} className={`vexa-group-row ${groupId===g.id?'active':''}`} onClick={()=>select(g)}>
    <span className="vexa-group-avatar vexa-group-avatar-fallback"><Users size={21}/></span>
    <span className="vexa-group-row-text"><strong>{g.title}</strong><small>Grup sohbeti</small></span>
   </button>)}{!groups.length&&<p className="hint">Henüz grubun yok. + ile oluştur.</p>}</div>
  </aside>}
  {mode!=='list'&&<main className="vexa-groups-conversation">
   {group?<>
    <header className="vexa-groups-chat-header">
     <button className="vexa-group-back" onClick={()=>select(null)} title="Geri"><ArrowLeft size={21}/></button>
     <span className="vexa-group-avatar vexa-group-avatar-fallback"><Users size={20}/></span>
     <button className="vexa-group-chat-title" onClick={()=>setSettings(v=>!v)}><strong>{group.title}</strong><small>{members.length} üye · Üyeleri gör</small></button>
     <a className="vexa14-group-call" href={`https://meet.jit.si/vexa-group-${encodeURIComponent(group.id)}`} target="_blank" rel="noopener noreferrer">📞 Görüşme</a>
     <button onClick={()=>setSettings(v=>!v)} title="Grup ayarları"><Settings size={20}/></button>
    </header>
    {settings?<section className="vexa-groups-settings">
     <h3>Grup bilgileri</h3><p>{group.description||'Açıklama yok'}</p>
     {isAdmin&&<>
      <label>Grup adı<input style={input} value={newName} maxLength={50} onChange={e=>setNewName(e.target.value)}/></label>
      <label>Açıklama<textarea style={input} value={description} maxLength={500} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Fotoğraf bağlantısı<input style={input} value={avatar} onChange={e=>setAvatar(e.target.value)}/></label>
      <button style={button} disabled={busy||newName.trim().length<3} onClick={()=>void callRpc('vexa8_group_edit',{p_group_id:group.id,p_title:newName.trim(),p_description:description.trim(),p_avatar_url:avatar.trim()||null},'Grup güncellendi.')}><Save size={16}/> Kaydet</button>
      <button style={button} onClick={()=>setAdding(v=>!v)}><UserPlus size={16}/> Üye ekle</button>
     </>}
     {adding&&isAdmin&&<div><input style={input} placeholder="Kişi ara" value={search} onChange={e=>setSearch(e.target.value)}/>{candidates.map(p=><div key={p.id} className="vexa-group-member-row"><span>{name(p)}</span><button style={button} disabled={busy} onClick={()=>void callRpc('vexa8_group_add_member',{p_group_id:group.id,p_user_id:p.id},'Üye eklendi.')}><UserPlus size={15}/> Ekle</button></div>)}</div>}
     <h3>Üyeler ({members.length})</h3>
     {members.map(m=><div key={m.user_id} className="vexa-group-member-row" style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',padding:8}}>
      <span>{person(m.user_id)} {group.created_by===m.user_id?'(Kurucu)':m.role==='admin'?'(Yönetici)':''}</span>
      {isOwner&&m.user_id!==userId&&<button style={button} disabled={busy} onClick={()=>void callRpc('vexa8_group_set_role',{p_group_id:group.id,p_user_id:m.user_id,p_role:m.role==='admin'?'member':'admin'},'Yetki değiştirildi.')}>{m.role==='admin'?<ShieldOff size={15}/>:<Shield size={15}/>} {m.role==='admin'?'Yetkiyi al':'Yönetici yap'}</button>}
      {isAdmin&&m.user_id!==userId&&<button style={button} disabled={busy} onClick={()=>{if(window.confirm('Üye gruptan çıkarılsın mı?'))void callRpc('vexa8_group_remove_member',{p_group_id:group.id,p_user_id:m.user_id},'Üye çıkarıldı.')}}><UserMinus size={15}/></button>}
     </div>)}
     <button style={button} disabled={busy} onClick={()=>void leave()}><LogOut size={16}/> Gruptan ayrıl</button>
     <button style={button} onClick={()=>setSettings(false)}><X size={16}/> Sohbete dön</button>
    </section>:<>
     <div className="vexa-group-messages" style={{flex:1,overflowY:'auto',padding:16}}>
      {messages.map(m=><div key={m.id} className={`vexa-group-message ${m.sender_id===userId?'mine':''}`} style={{marginBottom:12}}>
       <strong>{person(m.sender_id)}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p><small>{new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</small>
      </div>)}
      {!messages.length&&<p className="hint">Henüz mesaj yok.</p>}
     </div>
     <form className="vexa-group-compose" onSubmit={e=>{e.preventDefault();void send()}} style={{display:'flex',gap:8,padding:12}}>
      <input style={{...input,flex:1}} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Gruba mesaj yaz..."/>
      <button style={button} disabled={busy||!draft.trim()} title="Gönder"><Send size={19}/></button>
     </form>
    </>}
   </>:<div className="hint" style={{padding:24}}><Search size={24}/><p>Bir grup seç.</p></div>}
  </main>}
  {(error||notice)&&<div role="status" style={{padding:8,color:error?'#ff9b9b':'var(--text,#fff)'}}>{error||notice}</div>}
 </div>;
}
