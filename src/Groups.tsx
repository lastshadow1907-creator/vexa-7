import {useCallback,useEffect,useMemo,useState,useRef} from 'react';
import {ArrowLeft,Plus,Send,Users,Settings,UserPlus,LogOut,Shield,ShieldOff,UserMinus,Save,X,Search,Camera,Image,ChevronRight,Phone,Paperclip,Mic,Square} from 'lucide-react';
import {supabase} from './supabase';
import './groups134.css';
import {GroupPolls140} from './GroupPolls140';

type Profile={id:string;display_name?:string|null;username?:string|null;avatar_path?:string|null};
type Group={id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null};
type Member={user_id:string;role:string};
type Message={id:string;group_id:string;sender_id:string;body:string;created_at:string;reply_to?:string|null;media_path?:string|null;media_type?:string|null};
type Props={
 userId:string;profiles:Profile[];friendIds?:string[];onClose?:()=>void;mode?:'full'|'list'|'chat';
 activeGroupId?:string|null;onSelectGroup?:(id:string|null)=>void;
 createRequest?:number; activeGroup?:Group|null;onSelectGroupData?:(group:Group|null)=>void
};
const name=(p?:Profile)=>p?.display_name?.trim()||p?.username||'Vexa kullanıcısı';
let channelIndex=0;

export default function Groups({userId,profiles,friendIds=[],onClose,mode='full',activeGroupId,onSelectGroup,activeGroup,onSelectGroupData,createRequest=0}:Props){
 const [groups,setGroups]=useState<Group[]>([]);
 const [localGroup,setLocalGroup]=useState<Group|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [members,setMembers]=useState<Member[]>([]);
 const [memberProfiles,setMemberProfiles]=useState<Profile[]>([]);
 const [events,setEvents]=useState<{id:string;body:string;created_at:string}[]>([]);
 const [memberLoading,setMemberLoading]=useState(true),[memberError,setMemberError]=useState('');
 const [section,setSection]=useState<'info'|'members'|'edit'>('info');
 const [uploading,setUploading]=useState(false);
 const bottom=useRef<HTMLDivElement>(null), fileInput=useRef<HTMLInputElement>(null);
 const currentGroup=useRef<string|undefined>(undefined);
 const [draft,setDraft]=useState('');
 const [media140,setMedia140]=useState<File|null>(null),[mediaUrls140,setMediaUrls140]=useState<Record<string,string>>({}),[record140,setRecord140]=useState(false);
 const mediaInput140=useRef<HTMLInputElement>(null),rec140=useRef<MediaRecorder|null>(null),recordStream140=useRef<MediaStream|null>(null);
 const signed140=useRef(new Map<string,{url:string;until:number}>());
 useEffect(()=>()=>{if(rec140.current){rec140.current.onstop=null;if(rec140.current.state!=='inactive')rec140.current.stop()}recordStream140.current?.getTracks().forEach(t=>t.stop())},[]);
 async function recordVoice140(){if(record140){rec140.current?.stop();return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordStream140.current=stream;const recorder=new MediaRecorder(stream);rec140.current=recorder;const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());setRecord140(false);const type=recorder.mimeType.split(';')[0]||'audio/webm';const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';setMedia140(new File(chunks,'voice.'+ext,{type}))};recorder.start();setRecord140(true)}catch(e){recordStream140.current?.getTracks().forEach(t=>t.stop());setError((e as Error).message)}}
 const [reply140,setReply140]=useState<Message|null>(null),[poll140,setPoll140]=useState(false),[mentions140,setMentions140]=useState(false);
 const [newName,setNewName]=useState('');
 const [description,setDescription]=useState('');
 const [avatar,setAvatar]=useState('');
 const [creating,setCreating]=useState(false);
 useEffect(()=>{if(createRequest>0)setCreating(true)},[createRequest]);
 const [settings,setSettings]=useState(false);
 const [adding,setAdding]=useState(false);
 const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const groupId=mode==='full'?localGroup?.id:activeGroupId||undefined;
 currentGroup.current=groupId;
 const group=mode==='full'?localGroup:groups.find(g=>g.id===groupId)||((activeGroup?.id===groupId)?activeGroup:null);
 const isOwner=group?.created_by===userId;
 const isAdmin=isOwner||members.some(m=>m.user_id===userId&&m.role==='admin');
 const candidates=useMemo(()=>profiles.filter(p=>friendIds.includes(p.id)&&p.id!==userId&&!members.some(m=>m.user_id===p.id)&&name(p).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).slice(0,30),[profiles,members,search,userId,friendIds]);
 const person=(id:string)=>name(memberProfiles.find(p=>p.id===id)||profiles.find(p=>p.id===id));
 const avatarOf=(id:string)=>memberProfiles.find(p=>p.id===id)?.avatar_path||profiles.find(p=>p.id===id)?.avatar_path;
 const groupAvatar=(g:Group)=><span className='vexa-group-avatar vexa-group-avatar-fallback'>{g.avatar_url&&/^https:\/\//i.test(g.avatar_url)?<img src={g.avatar_url} alt=''/>:<Users size={23}/>}</span>;
 const memberAvatar=(id:string)=><span className='v134-member-avatar'>{avatarOf(id)&&/^https:\/\//i.test(avatarOf(id)!)?<img src={avatarOf(id)!} alt=''/>:person(id).slice(0,1).toLocaleUpperCase('tr')}</span>;
 const refreshGroups=useCallback(async()=>{
  const r=await supabase.from('vexa_group_members').select('group_id,group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);
  if(r.error){setError(r.error.message);return}
  const list=(r.data||[]).flatMap((item:any)=>item.group?[item.group as Group]:[]);
  setGroups(list);
  setLocalGroup(prev=>prev?list.find(g=>g.id===prev.id)||null:null);
 },[userId]);
 const refreshChat=useCallback(async()=>{
  if(!groupId)return;
  const [m,u,ev]=await Promise.all([
   supabase.from('vexa_group_messages').select('id,group_id,sender_id,body,created_at,reply_to,media_path,media_type').eq('group_id',groupId).order('created_at',{ascending:false}).limit(250),
   supabase.rpc('vexa134_group_roster',{p_group_id:groupId}),
   supabase.from('vexa134_group_events').select('id,body,created_at').eq('group_id',groupId).order('created_at',{ascending:false}).limit(100)
  ]);
  if(currentGroup.current!==groupId)return;
  if(m.error)setError(m.error.message);else {const rows=(m.data||[]) as Message[];setMessages(rows);const paths=[...new Set(rows.flatMap(x=>x.media_path?[x.media_path]:[]))];const pairs=await Promise.all(paths.map(async path=>{const cached=signed140.current.get(path);if(cached&&cached.until>Date.now())return [path,cached.url] as const;const r=await supabase.storage.from('vexa-group-media140').createSignedUrl(path,300);const url=r.data?.signedUrl||'';if(url)signed140.current.set(path,{url,until:Date.now()+240000});return [path,url] as const}));if(currentGroup.current!==groupId)return;setMediaUrls140(Object.fromEntries(pairs));}
  setMemberLoading(false);
  if(u.error){setMemberError(u.error.message);const fallback=await supabase.from('vexa_group_members').select('user_id,role').eq('group_id',groupId);if(currentGroup.current===groupId&&!fallback.error)setMembers(fallback.data||[])}else{setMemberError('');const rows=(u.data||[]) as (Member&Profile)[];setMembers(rows);setMemberProfiles(rows.map(x=>({...x,id:x.user_id})));}
  if(!ev.error)setEvents(ev.data||[]);
 },[groupId]);
 useEffect(()=>{void refreshGroups();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refreshGroups()},5000);return()=>clearInterval(timer)},[refreshGroups]);
 useEffect(()=>{
  if(!groupId){setMessages([]);setMembers([]);return}
  setMessages([]);setMembers([]);setMemberProfiles([]);setEvents([]);setMemberLoading(true);setMemberError('');setSettings(false);setAdding(false);setDraft('');setReply140(null);setPoll140(false);setMentions140(false);setMedia140(null);setMediaUrls140({});signed140.current.clear();
  void refreshChat();
  const channel=supabase.channel(`vexa-groups-new-${groupId}-${++channelIndex}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_messages',filter:`group_id=eq.${groupId}`},()=>void refreshChat())
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_members',filter:`group_id=eq.${groupId}`},()=>{void refreshChat();void refreshGroups()})
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'vexa134_group_events',filter:`group_id=eq.${groupId}`},()=>void refreshChat())
   .subscribe();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refreshChat()},3000);
  return()=>{clearInterval(timer);void supabase.removeChannel(channel)};
 },[groupId,refreshChat,refreshGroups]);
 useEffect(()=>{
  if(group){setNewName(group.title);setDescription(group.description||'');setAvatar(group.avatar_url||'')}
 },[group?.id,group?.title,group?.description,group?.avatar_url]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'})},[messages.length,events.length,groupId]);
 async function uploadAvatar(file:File){if(!groupId||!isAdmin||uploading)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>3*1024*1024){setError('JPG, PNG, WEBP veya GIF; en fazla 3 MB.');return}setUploading(true);setError('');try{const ext=file.type.split('/')[1];const path=`${userId}/group-${groupId}-${crypto.randomUUID()}.${ext}`;const r=await supabase.storage.from('vexa-avatars').upload(path,file,{contentType:file.type});if(r.error)throw Error(r.error.message);setAvatar(supabase.storage.from('vexa-avatars').getPublicUrl(path).data.publicUrl);setNotice('Fotoğraf hazır. Kaydet düğmesine bas.')}catch(e){setError((e as Error).message)}finally{setUploading(false)}}
 async function callRpc(fn:string,args:Record<string,unknown>,success:string){
  setBusy(true);setError('');setNotice('');
  try{
   const r=await supabase.rpc(fn,args);
   if(r.error)throw r.error;
   setNotice(success);
   await Promise.all([refreshGroups(),refreshChat()]);
   return true;
  }catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):String(e));return false}
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
  setSettings(false);setAdding(false);setSection('info');setError('');
 }
 async function send(){
  const body=draft.trim();if(!groupId||(!body&&!media140)||busy||record140)return;
  setBusy(true);setError('');let path:string|null=null;
  try{let kind:string|null=null;if(media140){const type=media140.type.split(';')[0];if(media140.size>25*1024*1024||!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','application/pdf'].includes(type))throw Error('Desteklenen medya en fazla 25 MB.');kind=type.startsWith('image/')?'image':type.startsWith('video/')?'video':type.startsWith('audio/')?'audio':'document';const ext=media140.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';path=groupId+'/'+userId+'/'+crypto.randomUUID()+'.'+ext;const r=await supabase.storage.from('vexa-group-media140').upload(path,media140,{contentType:type});if(r.error){path=null;throw Error(r.error.message)}}
   const r=await supabase.from('vexa_group_messages').insert({group_id:groupId,sender_id:userId,body:body||'Medya',reply_to:reply140?.id||null,media_path:path,media_type:kind});if(r.error)throw Error(r.error.message);path=null;setDraft('');setReply140(null);setMedia140(null);await refreshChat()
  }catch(e){if(path)await supabase.storage.from('vexa-group-media140').remove([path]);setError((e as Error).message)}finally{setBusy(false)}
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
    <h2>Gruplar</h2>{mode!=='list'&&<button onClick={()=>setCreating(v=>!v)} title="Grup oluştur"><Plus size={20}/></button>}
   </header>
   {creating&&<div className="vexa-group-create" ref={el=>{if(el&&creating&&createRequest>0)el.scrollIntoView({block:"nearest"})}}><input style={input} value={newName} onChange={e=>setNewName(e.target.value)} maxLength={50} placeholder="Yeni grup adı"/><button style={button} disabled={busy||newName.trim().length<3} onClick={()=>void create()}>Oluştur</button></div>}
   <div className="vexa-groups-list">{groups.map(g=><button key={g.id} className={`vexa-group-row ${groupId===g.id?'active':''}`} onClick={()=>select(g)}>
    {groupAvatar(g)}
    <span className="vexa-group-row-text"><strong>{g.title}</strong><small>Grup sohbeti</small></span>
   </button>)}{!groups.length&&<p className="hint">Henüz grubun yok.</p>}</div>
  </aside>}
  {mode!=='list'&&<main className="vexa-groups-conversation">
   {group?<>
    <header className="vexa-groups-chat-header">
     <button className="vexa-group-back" onClick={()=>select(null)} title="Geri"><ArrowLeft size={21}/></button>
     {groupAvatar(group)}
     <button className="vexa-group-chat-title" onClick={()=>{setSection('members');setSettings(true)}}><strong>{group.title}</strong><small>{memberLoading?'Yükleniyor…':memberError?'Üyeleri kontrol et':`${members.length} üye`} · Üyeleri gör</small></button>
     <a className="vexa14-group-call" href={`https://meet.jit.si/vexa-group-${encodeURIComponent(group.id)}`} target="_blank" rel="noopener noreferrer"><Phone size={18}/> <span>Görüşme</span></a>
     <button onClick={()=>{setSection('info');setSettings(v=>!v)}} title="Grup ayarları"><Settings size={20}/></button>
    </header>
    {settings?<section className="vexa-groups-settings">
     <div className="v134-group-hero">{groupAvatar(group)}<h2>{group.title}</h2><p>{group.description||'Henüz açıklama yok'}</p><small>{members.length} üye</small></div><div className="v134-tabs">{([{id:'info',label:'Bilgiler',Icon:Users},{id:'members',label:'Üyeler',Icon:UserPlus},...(isAdmin?[{id:'edit',label:'Düzenle',Icon:Settings}]:[])] as const).map(({id,label,Icon})=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id as 'info'|'members'|'edit')}><Icon size={17}/>{label}</button>)}</div>{section==='info'&&<div className="v134-info"><button onClick={()=>setSection('members')}><Users size={20}/> Üyeleri görüntüle <ChevronRight size={17}/></button>{isAdmin&&<button onClick={()=>setSection('edit')}><Settings size={20}/> Grup ayarları <ChevronRight size={17}/></button>}</div>}
     {isAdmin&&section==='edit'&&<>
      <label>Grup adı<input style={input} value={newName} maxLength={50} onChange={e=>setNewName(e.target.value)}/></label>
      <label>Açıklama<textarea style={input} value={description} maxLength={500} onChange={e=>setDescription(e.target.value)}/></label>
      <div className="v134-photo-edit">{avatar&&/^https:\/\//i.test(avatar)?<img src={avatar} alt="Grup fotoğrafı"/>:<Image size={34}/>}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void uploadAvatar(file);e.target.value=''}}/><button style={button} disabled={uploading} onClick={()=>fileInput.current?.click()}><Camera size={18}/>{uploading?'Yükleniyor…':'Galeriden fotoğraf seç'}</button><button style={button} onClick={()=>setAvatar('')}>Fotoğrafı kaldır</button></div>
      <button style={button} disabled={busy||uploading||newName.trim().length<3} onClick={()=>void callRpc('vexa8_group_edit',{p_group_id:group.id,p_title:newName.trim(),p_description:description.trim(),p_avatar_url:avatar.trim()||null},'Grup güncellendi.')}><Save size={16}/> Kaydet</button>
      </>}{section==='members'&&<>{isAdmin&&<button style={button} onClick={()=>setAdding(v=>!v)}><UserPlus size={16}/> Üye ekle</button>}
     {adding&&isAdmin&&<div><input style={input} placeholder="Kişi ara" value={search} onChange={e=>setSearch(e.target.value)}/>{candidates.map(p=><div key={p.id} className="vexa-group-member-row">{memberAvatar(p.id)}<span>{name(p)}</span><button style={button} disabled={busy} onClick={()=>void callRpc('vexa8_group_add_member',{p_group_id:group.id,p_user_id:p.id},'Üye eklendi.')}><UserPlus size={15}/> Ekle</button></div>)}</div>}
     <h3>Üyeler ({members.length})</h3>{memberLoading&&<p>Üyeler yükleniyor…</p>}{memberError&&<p role='alert'>Üye listesi tam yüklenemedi: {memberError}</p>}
     {members.map(m=><div key={m.user_id} className="vexa-group-member-row" style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',padding:8}}>
      {memberAvatar(m.user_id)}<span className='v134-member-name'><strong>{person(m.user_id)}{m.user_id===userId?' (Sen)':''}</strong><small>{group.created_by===m.user_id?'Kurucu':m.role==='admin'?'Yönetici':'Üye'}</small></span>
      {isOwner&&m.user_id!==userId&&<button style={button} disabled={busy} onClick={()=>void callRpc('vexa8_group_set_role',{p_group_id:group.id,p_user_id:m.user_id,p_role:m.role==='admin'?'member':'admin'},'Yetki değiştirildi.')}>{m.role==='admin'?<ShieldOff size={15}/>:<Shield size={15}/>} {m.role==='admin'?'Yetkiyi al':'Yönetici yap'}</button>}
      {isAdmin&&m.user_id!==userId&&m.user_id!==group.created_by&&(isOwner||m.role!=='admin')&&<button style={button} disabled={busy} onClick={()=>{if(window.confirm('Üye gruptan çıkarılsın mı?'))void callRpc('vexa8_group_remove_member',{p_group_id:group.id,p_user_id:m.user_id},'Üye çıkarıldı.')}}><UserMinus size={15}/></button>}
     </div>)}
     </>}{section==='info'&&<button style={button} disabled={busy} onClick={()=>void leave()}><LogOut size={16}/> Gruptan ayrıl</button>}
     <button style={button} onClick={()=>setSettings(false)}><X size={16}/> Sohbete dön</button>
    </section>:<>
     <div className="vexa-group-messages" style={{flex:1,overflowY:'auto',padding:16}}>
      {[...messages.map(m=>({kind:'message' as const,m,at:m.created_at})),...events.map(e=>({kind:'event' as const,e,at:e.created_at}))].sort((a,b)=>a.at.localeCompare(b.at)).map(item=>item.kind==='event'?<div className='v134-event' key={'event-'+item.e.id}>{item.e.body}</div>:((m:Message)=><div key={m.id} className={`vexa-group-message ${m.sender_id===userId?'mine':''}`} style={{marginBottom:12}}>
       <strong>{m.sender_id!==userId&&memberAvatar(m.sender_id)}{person(m.sender_id)}</strong>{m.reply_to&&<blockquote className='v140-group-quote'>{messages.find(x=>x.id===m.reply_to)?.body||'Önceki mesaj'}</blockquote>}<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p>{m.media_path&&mediaUrls140[m.media_path]&&(m.media_type==='image'?<img className='v140-group-media' src={mediaUrls140[m.media_path]} alt='Grup fotoğrafı' loading='lazy'/>:m.media_type==='video'?<video className='v140-group-media' controls playsInline src={mediaUrls140[m.media_path]}/>:m.media_type==='audio'?<audio controls src={mediaUrls140[m.media_path]}/>:<a href={mediaUrls140[m.media_path]} target='_blank' rel='noopener noreferrer'>Dosyayı aç</a>)}<small>{new Date(m.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</small><button className='v140-group-reply' onClick={()=>setReply140(m)}>Yanıtla</button>
      </div>)(item.m))}<div ref={bottom}/>
      {!messages.length&&!events.length&&<p className="hint">Henüz mesaj yok.</p>}
     </div>
     {poll140&&<GroupPolls140 groupId={group.id} userId={userId}/ >}{reply140&&<div className='v140-group-quote'>{person(reply140.sender_id)}: {reply140.body.slice(0,100)} <button onClick={()=>setReply140(null)}>×</button></div>}{mentions140&&<div className='v140-tabs'>{members.filter(m=>m.user_id!==userId).map(m=><button key={m.user_id} onClick={()=>{setDraft(v=>v+' @'+person(m.user_id)+' ');setMentions140(false)}}>{person(m.user_id)}</button>)}</div>}<div className='v140-tabs'><button onClick={()=>setPoll140(v=>!v)}>Anketler</button><button onClick={()=>setMentions140(v=>!v)}>@ Üye etiketle</button></div>{media140&&<div className='v140-group-quote'>{media140.name}<button onClick={()=>setMedia140(null)}>Kaldır</button></div>}<form className="vexa-group-compose" onSubmit={e=>{e.preventDefault();void send()}} style={{display:'flex',gap:8,padding:12}}>
      <input ref={mediaInput140} type='file' hidden accept='image/*,video/*,audio/*,application/pdf' onChange={e=>{setMedia140(e.target.files?.[0]||null);e.target.value=''}}/><button type='button' title='Medya ekle' disabled={busy||record140} onClick={()=>mediaInput140.current?.click()}><Paperclip size={19}/></button><button type='button' title={record140?'Kaydı durdur':'Ses kaydet'} disabled={busy} onClick={()=>void recordVoice140()}>{record140?<Square size={18}/>:<Mic size={18}/>}</button><input style={{...input,flex:1}} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Gruba mesaj yaz..."/>
      <button style={button} disabled={busy||record140||(!draft.trim()&&!media140)} title="Gönder"><Send size={19}/></button>
     </form>
    </>}
   </>:<div className="hint" style={{padding:24}}><Search size={24}/><p>Bir grup seç.</p></div>}
  </main>}
  {(error||notice)&&<div role="status" style={{padding:8,color:error?'#ff9b9b':'var(--text,#fff)'}}>{error||notice}</div>}
 </div>;
}
