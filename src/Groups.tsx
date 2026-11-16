import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {ArrowLeft,Plus,Send,Users,Settings,UserPlus,LogOut,Shield,ShieldOff,UserMinus,Save,X,Search,Bell,BellOff} from 'lucide-react';
import {supabase} from './supabase';

type Profile={id:string;display_name?:string|null};
type Group={id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null};
type Member={user_id:string;role:'admin'|'member'};
type GroupMessage={id:string;group_id:string;sender_id:string;body:string;created_at:string};
const clock=(v:string)=>new Date(v).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const display=(p?:Profile)=>p?.display_name?.trim()||'Vexa kullanıcısı';
const mutedKey=(id:string)=>`vexa-group-muted-${id}`;
let channelSequence=0;

export default function Groups({userId,profiles,onClose,mode='full',activeGroupId,onSelectGroup,activeGroup,onSelectGroupData}:{userId:string;profiles:Profile[];onClose?:()=>void;mode?:'full'|'list'|'chat';activeGroupId?:string|null;onSelectGroup?:(id:string|null)=>void;activeGroup?:Group|null;onSelectGroupData?:(group:Group|null)=>void}){
 const [groups,setGroups]=useState<Group[]>([]);
 const [groupLoading,setGroupLoading]=useState(true);
 const [groupLoadError,setGroupLoadError]=useState('');
 const [selected,setSelected]=useState<Group|null>(null);
 const [messages,setMessages]=useState<GroupMessage[]>([]);
 const [members,setMembers]=useState<Member[]>([]);
 const [draft,setDraft]=useState('');
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [avatarUrl,setAvatarUrl]=useState('');
 const [creating,setCreating]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [settings,setSettings]=useState(false);
 const [addOpen,setAddOpen]=useState(false);
 const [find,setFind]=useState('');
 const [muted,setMuted]=useState(false);
 const [confirmRemove,setConfirmRemove]=useState<string|null>(null);
 const bottomRef=useRef<HTMLDivElement|null>(null);
 const instanceId=useRef(++channelSequence);
 const selectedId=mode==='full'?selected?.id:(activeGroupId||undefined);
 const currentGroup=mode==='full'?selected:(groups.find(g=>g.id===activeGroupId)||((activeGroup?.id===activeGroupId)?activeGroup:null));
 const me=members.find(m=>m.user_id===userId);
 const admin=!!currentGroup&&(currentGroup.created_by===userId||me?.role==='admin');
 const owner=currentGroup?.created_by===userId;
 const people=useMemo(()=>profiles.filter(p=>p.id!==userId&&!members.some(m=>m.user_id===p.id)&&display(p).toLocaleLowerCase('tr-TR').includes(find.toLocaleLowerCase('tr-TR'))).slice(0,50),[profiles,members,find,userId]);
 const person=(id:string)=>display(profiles.find(p=>p.id===id));
 const clearMessages=()=>{setError('');setNotice('')};

 const loadGroups=useCallback(async()=>{
  const {data,error:e}=await supabase.from('vexa_group_members').select('group_id,group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);
  if(e){setError(e.message);setGroupLoadError(e.message);setGroupLoading(false);return}
  setGroupLoadError('');setGroupLoading(false);
  let list=(data||[]).flatMap((r:any)=>r.group?[r.group as Group]:[]);
  if(mode==='chat' && activeGroupId && !list.some(g=>g.id===activeGroupId)){
   const {data:direct,error:directError}=await supabase.from('vexa_groups').select('id,title,created_by,avatar_url,description').eq('id',activeGroupId).maybeSingle();
   if(direct)list=[...list,direct as Group];
   else if(directError)setGroupLoadError(directError.message);
  }
  setGroups(list);
  setSelected(prev=>prev?list.find(g=>g.id===prev.id)||null:null);
 },[userId,mode,activeGroupId]);
 const loadMessages=useCallback(async()=>{
  if(!selectedId)return;
  const {data,error:e}=await supabase.from('vexa_group_messages').select('id,group_id,sender_id,body,created_at').eq('group_id',selectedId).order('created_at',{ascending:true}).limit(250);
  if(e)setError(e.message);else setMessages((data||[]) as GroupMessage[]);
 },[selectedId]);
 const loadMembers=useCallback(async()=>{
  if(!selectedId)return;
  const {data,error:e}=await supabase.from('vexa_group_members').select('user_id,role').eq('group_id',selectedId);
  if(e)setError(e.message);else setMembers((data||[]) as Member[]);
 },[selectedId]);
 useEffect(()=>{void loadGroups()},[loadGroups]);
 useEffect(()=>{
  if(!selectedId){setMembers([]);setMessages([]);return}
  setMuted(localStorage.getItem(mutedKey(selectedId))==='1');
  void loadMessages();void loadMembers();
  const c=supabase.channel(`vexa8-group-${selectedId}-${instanceId.current}-${++channelSequence}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_messages',filter:`group_id=eq.${selectedId}`},()=>void loadMessages())
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_members',filter:`group_id=eq.${selectedId}`},()=>{void loadMembers();void loadGroups()})
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_groups',filter:`id=eq.${selectedId}`},()=>void loadGroups())
   .subscribe();
  return()=>{void supabase.removeChannel(c)};
 },[selectedId,loadGroups,loadMessages,loadMembers]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages.length,selectedId]);
 useEffect(()=>{if(currentGroup){setTitle(currentGroup.title);setDescription(currentGroup.description||'');setAvatarUrl(currentGroup.avatar_url||'')}},[selectedId]);

 async function rpc(name:string,args:Record<string,unknown>,success:string){
  setBusy(true);clearMessages();
  try{
   const {error:e}=await supabase.rpc(name,args);if(e)throw e;
   setNotice(success);await Promise.all([loadGroups(),loadMembers()]);return true;
  }catch(e){setError((e as Error).message);return false}
  finally{setBusy(false)}
 }
 async function create(){
  if(title.trim().length<3)return;
  const newTitle=title.trim();
  const ok=await rpc('vexa8_group_create',{p_title:newTitle},'Grup oluşturuldu.');
  if(ok){setCreating(false);setTitle('');const {data}=await supabase.from('vexa_group_members').select('group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);const match=(data||[]).map((r:any)=>r.group as Group).find(g=>g?.title===newTitle&&g.created_by===userId);if(match){setSelected(match);onSelectGroup?.(match.id);setSettings(false)}await loadGroups()}
 }
 async function send(){
  if(!selectedId||!draft.trim()||busy)return;
  const body=draft.trim();setDraft('');setError('');
  const {error:e}=await supabase.from('vexa_group_messages').insert({group_id:selectedId,sender_id:userId,body});
  if(e){setDraft(body);setError(e.message)}else await loadMessages();
 }
 async function saveGroup(){
  if(!selectedId||title.trim().length<3)return;
  const ok=await rpc('vexa8_group_edit',{p_group_id:selectedId,p_title:title.trim(),p_description:description.trim(),p_avatar_url:avatarUrl.trim()||null},'Grup bilgileri kaydedildi.');
  if(ok)await loadGroups();
 }
 async function addMember(id:string){
  if(!selectedId)return;
  const ok=await rpc('vexa8_group_add_member',{p_group_id:selectedId,p_user_id:id},'Üye eklendi.');
  if(ok){setAddOpen(false);setFind('');await loadMembers()}
 }
 async function removeMember(id:string){
  if(!selectedId)return;
  const ok=await rpc('vexa8_group_remove_member',{p_group_id:selectedId,p_user_id:id},'Üye çıkarıldı.');
  if(ok){setConfirmRemove(null);await loadMembers()}
 }
 async function changeRole(id:string,role:'admin'|'member'){
  if(!selectedId)return;
  await rpc('vexa8_group_set_role',{p_group_id:selectedId,p_user_id:id,p_role:role},'Yetki güncellendi.');
 }
 async function leaveGroup(){
  if(!selectedId)return;
  const ok=await rpc('vexa8_group_leave',{p_group_id:selectedId},'Gruptan ayrıldın.');
  if(ok){setSelected(null);onSelectGroupData?.(null);onSelectGroup?.(null);setSettings(false);await loadGroups()}
 }
 const btnStyle:CSSProperties={background:'#304939',color:'#eaf5ed',borderRadius:9,padding:'8px 11px',display:'inline-flex',alignItems:'center',gap:6};
 const inputStyle:CSSProperties={width:'100%',padding:'11px',borderRadius:10,background:'#223529',color:'#eaf5ed',border:'1px solid #3b5944'};
 return <div className={'vexa-groups-layout '+(currentGroup?'group-open':'')+' vexa91-mode-'+mode}>
  {mode!=='chat'&&<aside className="vexa-groups-sidebar">
   <header className="vexa-groups-list-header">{mode==='full'&&<button aria-label="Sohbetlere dön" onClick={onClose}><ArrowLeft size={20}/></button>}<h2>Gruplar</h2><button title="Yeni grup" onClick={()=>setCreating(v=>!v)}><Plus size={20}/></button></header>
   {creating&&<div className="vexa-group-create"><input value={title} maxLength={50} onChange={e=>setTitle(e.target.value)} placeholder="Grup adı"/><button disabled={busy||title.trim().length<3} onClick={()=>void create()}>Grubu oluştur</button></div>}
   <div className="vexa-groups-list">{groups.map(g=><button key={g.id} className={'vexa-group-row '+(selectedId===g.id?'active':'')} onClick={()=>{clearMessages();setSelected(g);onSelectGroupData?.(g);onSelectGroup?.(g.id);setSettings(false)}}>
    {g.avatar_url?.startsWith('https://')?<img src={g.avatar_url} alt="" className="vexa-group-avatar"/>:<span className="vexa-group-avatar vexa-group-avatar-fallback"><Users size={22}/></span>}
    <span className="vexa-group-row-text"><strong>{g.title}</strong><small>Grup sohbetini aç</small></span>
   </button>)}{!groups.length&&<p className="hint" style={{padding:16}}>Henüz grubun yok. + ile oluşturabilirsin.</p>}</div>
   </aside>}
   {mode!=='list'&&<main className="vexa-groups-conversation">
   {currentGroup ? <>
   <header className="vexa-groups-chat-header">
    <button className="vexa-group-back" aria-label="Grup listesine dön" onClick={()=>{setSelected(null);onSelectGroupData?.(null);onSelectGroup?.(null);setSettings(false)}}><ArrowLeft size={22}/></button>
    {currentGroup.avatar_url?.startsWith('https://')?<img src={currentGroup.avatar_url} alt="" className="vexa-group-avatar"/>:<span className="vexa-group-avatar vexa-group-avatar-fallback"><Users size={21}/></span>}
    <button className="vexa-group-chat-title" onClick={()=>setSettings(v=>!v)}><strong>{currentGroup.title}</strong><small>{members.length} üye · {currentGroup.description||'Grup sohbeti'}</small></button>
    <button title="Grup bilgileri" onClick={()=>setSettings(v=>!v)}><Settings size={20}/></button>
   </header>
   {settings ? <div className="vexa-groups-settings">
    <h3>Grup bilgileri</h3><p className="hint">{currentGroup.description||'Grup açıklaması yok.'} · {members.length} üye</p>
    {admin&&<><label>Grup adı<input style={inputStyle} value={title} maxLength={50} onChange={e=>setTitle(e.target.value)}/></label><label>Açıklama<textarea style={inputStyle} value={description} maxLength={500} onChange={e=>setDescription(e.target.value)}/></label><label>Grup fotoğrafı (HTTPS)<input style={inputStyle} value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://..."/></label><button style={btnStyle} disabled={busy||title.trim().length<3} onClick={()=>void saveGroup()}><Save size={16}/> Kaydet</button></>}
    <button style={btnStyle} onClick={()=>{const next=!muted;setMuted(next);localStorage.setItem(mutedKey(currentGroup.id),next?'1':'0')}}>{muted?<BellOff size={16}/>:<Bell size={16}/>} {muted?'Sessizden çıkar':'Bu cihazda sessize al'}</button>
    <h3>Üyeler</h3>{members.map(m=><div key={m.user_id} className="vexa-group-member"><span style={{flex:1}}>{person(m.user_id)} {m.user_id===userId?'(Sen)':''} {m.role==='admin'?'· Yönetici':''}</span>{admin&&m.user_id!==userId&&<><button title={m.role==='admin'?'Yöneticiliği kaldır':'Yönetici yap'} style={btnStyle} disabled={busy||m.user_id===currentGroup.created_by} onClick={()=>void changeRole(m.user_id,m.role==='admin'?'member':'admin')}>{m.role==='admin'?<ShieldOff size={16}/>:<Shield size={16}/>}</button>{confirmRemove===m.user_id?<><button style={btnStyle} disabled={busy} onClick={()=>void removeMember(m.user_id)}>Onayla</button><button style={btnStyle} onClick={()=>setConfirmRemove(null)}><X size={16}/></button></>:<button title="Üyeyi çıkar" style={btnStyle} disabled={busy||m.user_id===currentGroup.created_by} onClick={()=>setConfirmRemove(m.user_id)}><UserMinus size={16}/></button>}</>}</div>)}
    {admin&&<><button style={btnStyle} onClick={()=>setAddOpen(v=>!v)}><UserPlus size={16}/> Üye ekle</button>{addOpen&&<><div style={{display:'flex',gap:8,alignItems:'center'}}><Search size={18}/><input style={inputStyle} placeholder="Kişi ara" value={find} onChange={e=>setFind(e.target.value)}/></div>{people.map(p=><button key={p.id} style={{...btnStyle,justifyContent:'space-between'}} disabled={busy} onClick={()=>void addMember(p.id)}>{display(p)} <Plus size={16}/></button>)}{!people.length&&<p className="hint">Eklenebilecek kişi bulunamadı.</p>}</>}</>}
    {!owner&&<button style={btnStyle} disabled={busy} onClick={()=>void leaveGroup()}><LogOut size={16}/> Gruptan ayrıl</button>}{owner&&<p className="hint">Grup kurucusu ayrılmadan önce sahipliği devretmelidir.</p>}
   </div> : <><div className="vexa-group-messages vexa-group-full-messages">{messages.map(m=><div key={m.id} className={'vexa-group-message '+(m.sender_id===userId?'mine':'')}><small>{person(m.sender_id)}</small><div style={{whiteSpace:'pre-wrap'}}>{m.body}</div><time>{clock(m.created_at)}</time></div>)}{!messages.length&&<p className="hint">Henüz mesaj yok. İlk mesajı gönder!</p>}<div ref={bottomRef}/></div><form className="vexa-group-compose vexa-group-full-compose" onSubmit={e=>{e.preventDefault();void send()}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Gruba mesaj yaz…" maxLength={5000}/><button aria-label="Gönder" disabled={!draft.trim()||busy}><Send size={20}/></button></form></>}
  </> : <div className="vexa-groups-welcome"><Users size={56}/><h2>{groupLoading?'Grup yükleniyor…':groupLoadError?'Grup yüklenemedi':'Grup bulunamadı'}</h2><p>{groupLoadError||'Grup üyeliğin değişmiş olabilir. Sohbet listesine dönüp yeniden seç.'}</p><button type="button" style={btnStyle} onClick={()=>void loadGroups()}>Tekrar dene</button><button type="button" style={btnStyle} onClick={()=>onSelectGroup?.(null)}>Sohbet listesine dön</button></div>}
  {error&&<p className="error vexa-group-alert" role="alert">{error}</p>}{notice&&<p className="hint vexa-group-alert" role="status">{notice}</p>}
  </main>}
 </div>;
}
