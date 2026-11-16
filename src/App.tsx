import {useCallback,useEffect,useMemo,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Session} from '@supabase/supabase-js';
import {MessageCircle,Users,Search,UserRound,ArrowLeft,LogOut,Settings,Pin,Archive,ArchiveRestore,MoreVertical,Camera,RefreshCw} from 'lucide-react';
import {supabase,configured} from './supabase';
import Calls from './Calls';
import EnhancedChat from './EnhancedChat';
import Groups from './Groups';
import Statuses from './Statuses';
import {VexaSettings,VexaAds} from './VexaFeatures';
import {VexaIdentity,VexaJoined,VexaAvatarEditor,VexaTagEditor} from './Vexa92_Profile';
import {VexaPrivacySettings,VexaProfileQR,VexaQRFind,useVexaPresenceHeartbeat} from './Vexa102_Privacy';
import {Vexa102ProfileCard} from './Vexa102_ProfileCard';
import type {Profile,FriendRequest} from './supabase';

type Tab='chats'|'find'|'requests'|'profile'|'statuses';
type ChatRow={id:number;sender_id:string;recipient_id:string;body:string|null;created_at:string;read_at?:string|null;deleted_at?:string|null;media_type?:string|null};
const name=(p?:Profile|null)=>p?.display_name?.trim()||p?.username||'Vexa kullanıcısı';
const time=(date:string)=>new Date(date).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const day=(date:string)=>new Date(date).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
const short=(s:string,n=55)=>s.length>n?s.slice(0,n-1)+'…':s;
const photo=(p?:Profile|null)=>{const v=p?.avatar_path||'';return /^https:\/\//i.test(v)?v:null};
function Avatar({p,size=43}:{p?:Profile|null;size?:number}){const src=photo(p);return <span className="avatar" style={{width:size,height:size,flexBasis:size,borderRadius:'50%',overflow:'hidden'}}>{src?<img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:name(p).slice(0,1).toUpperCase()}</span>}
function storageGet(key:string):string[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}}
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false);
 const [tab,setTab]=useState<Tab>('chats'),[friends,setFriends]=useState<FriendRequest[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
 const [selected,setSelected]=useState<Profile|null>(null),[inspect,setInspect]=useState<Profile|null>(null);
 const [activeGroupId,setActiveGroupId]=useState<string|null>(null);
 const [activeGroup,setActiveGroup]=useState<{id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null}|null>(null);
 const [search,setSearch]=useState(''),[results,setResults]=useState<Profile[]>([]),[chatSearch,setChatSearch]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[chatRows,setChatRows]=useState<ChatRow[]>([]);
 const [displayName,setDisplayName]=useState(''),[bio,setBio]=useState(''),[avatarUrl,setAvatarUrl]=useState(''),[saveNotice,setSaveNotice]=useState('');
 const [lastRead,setLastRead]=useState<Record<string,string>>({});
 const [archived,setArchived]=useState<string[]>([]),[pinned,setPinned]=useState<string[]>([]),[showArchived,setShowArchived]=useState(false),[menuId,setMenuId]=useState<string|null>(null);
 const uid=session?.user.id;
 useVexaPresenceHeartbeat(uid);
 useEffect(()=>{let active=true;void supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setReady(true)}});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>{active=false;subscription.unsubscribe()}},[]);
 useEffect(()=>{setLastRead(uid?JSON.parse(localStorage.getItem('vexa-lastread-'+uid)||'{}'):{});setSelected(null);setChatRows([]);setArchived(uid?storageGet('vexa-archive-'+uid):[]);setPinned(uid?storageGet('vexa-pin-'+uid):[])},[uid]);
 const load=useCallback(async()=>{if(!uid)return;const [f,p]=await Promise.all([supabase.from('friend_requests').select('id,sender_id,recipient_id,status').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`),supabase.from('profiles').select('id,display_name,bio,avatar_path,username').limit(500)]);if(f.error||p.error){setError(f.error?.message||p.error?.message||'Yüklenemedi');return}setFriends(f.data||[]);setProfiles(p.data||[]);const me=(p.data||[]).find(x=>x.id===uid);setDisplayName(me?.display_name||'');setBio(me?.bio||'');setAvatarUrl(photo(me)||'')},[uid]);
 const loadMessages=useCallback(async()=>{if(!uid)return;const {data,error:e}=await supabase.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at,deleted_at,media_type').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).limit(500);if(!e)setChatRows((data||[]) as ChatRow[]);else console.warn('Sohbet özetleri:',e.message)},[uid]);
 useEffect(()=>{void load();void loadMessages()},[load,loadMessages]);
 useEffect(()=>{
  if(!uid)return;
  const id=new URLSearchParams(window.location.search).get('vexa_user');
  if(!id||!(/^[0-9a-f-]{36}$/i.test(id)))return;
  let cancelled=false;
  void supabase.from('profiles').select('id,display_name,bio,avatar_path,username').eq('id',id).maybeSingle().then(({data,error:e})=>{
   if(cancelled)return;
   if(e)setError(e.message);else if(data)setInspect(data as Profile);else setError('QR bağlantısındaki profil bulunamadı.');
   window.history.replaceState(null,'',window.location.pathname);
  });
  return()=>{cancelled=true};
 },[uid]);
 useEffect(()=>{if(!uid)return;const ch=supabase.channel('vexa-app-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>{void load()}).on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>{void loadMessages()}).subscribe();const onFocus=()=>{void loadMessages()};window.addEventListener('focus',onFocus);return()=>{window.removeEventListener('focus',onFocus);void supabase.removeChannel(ch)}},[uid,load,loadMessages]);

 useEffect(()=>{
  if(!uid||!selected?.id||tab!=='chats')return;
  const peer=selected.id;
  let cancelled=false;
  const mark=async()=>{
   const now=new Date().toISOString();
   // Unread state is private to the current account and does not reveal read receipts.
   const next={...JSON.parse(localStorage.getItem('vexa-lastread-'+uid)||'{}'),[peer]:now};
   localStorage.setItem('vexa-lastread-'+uid,JSON.stringify(next));
   if(!cancelled)setLastRead(next);
   const {data:privacy}=await supabase.from('vexa101_privacy').select('read_receipts').eq('user_id',uid).maybeSingle();
   if(privacy?.read_receipts===false)return;
   const {error:e}=await supabase.from('messages').update({read_at:now})
    .eq('sender_id',peer).eq('recipient_id',uid).is('read_at',null);
   if(e)console.warn('Okundu bilgisi kaydedilemedi:',e.message);
   if(!cancelled)void loadMessages();
  };
  void mark();
  return()=>{cancelled=true};
 },[uid,selected?.id,tab,loadMessages]);
 async function auth(){setError('');setBusy(true);try{const r=register?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(r.error)throw r.error;if(register&&!r.data.session)setError('Doğrulama e-postanı kontrol et.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function findUsers(){if(search.trim().replace(/^#/,'').length<2)return;setBusy(true);setError('');const {data:tags,error:e}=await supabase.from('vexa91_identity').select('user_id,handle,tag_number').ilike('handle',`%${search.trim().replace(/^#/,'').split('#')[0].replace(/[%_]/g,'')}%`).limit(30);if(e)setError(e.message);else{const ids=(tags||[]).filter(t=>!search.includes('#')||String(t.tag_number).padStart(4,'0')===search.split('#')[1]).map(t=>t.user_id as string).filter((id:string)=>id!==uid);const {data,error:profileError}=ids.length?await supabase.from('profiles').select('id,display_name,bio,avatar_path,username').in('id',ids):{data:[],error:null};if(profileError)setError(profileError.message);setResults(data||[])}setBusy(false)}
 async function addFriend(id:string){const {error:e}=await supabase.rpc('vexa_send_friend_request',{p_recipient_id:id});if(e)setError(e.message);else await load()}
 async function updateRequest(id:string,accept:boolean){const {error:e}=await supabase.from('friend_requests').update({status:accept?'accepted':'rejected'}).eq('id',id).eq('recipient_id',uid);if(e)setError(e.message);else await load()}
 async function saveProfile(){if(!uid||busy)return;setBusy(true);setError('');setSaveNotice('');try{const {data,error:e}=await supabase.from('profiles').update({display_name:displayName.trim(),bio}).eq('id',uid).select('id').maybeSingle();if(e)throw e;if(!data)throw new Error('Profil kaydı bulunamadı veya düzenleme iznin yok. Supabase profiles RLS kurallarını kontrol et.');setSaveNotice('Profil değişiklikleri kaydedildi.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function toggle(kind:'pin'|'archive',id:string){if(!uid)return;const prev=kind==='pin'?pinned:archived;const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];localStorage.setItem('vexa-'+kind+'-'+uid,JSON.stringify(next));if(kind==='pin')setPinned(next);else setArchived(next);setMenuId(null)}
 const accepted=useMemo(()=>friends.filter(f=>f.status==='accepted').map(f=>profiles.find(p=>p.id===(f.sender_id===uid?f.recipient_id:f.sender_id))).filter((p):p is Profile=>!!p),[friends,profiles,uid]);
 const summaries=useMemo(()=>{const map=new Map<string,{last:ChatRow|null;unread:number}>();accepted.forEach(p=>map.set(p.id,{last:null,unread:0}));for(const m of chatRows){const id=m.sender_id===uid?m.recipient_id:m.sender_id;const row=map.get(id);if(!row)continue;if(!row.last)row.last=m;if(m.recipient_id===uid&&!m.deleted_at&&!m.read_at&&(!lastRead[id]||new Date(m.created_at)>new Date(lastRead[id])))row.unread++}return map},[accepted,chatRows,uid,lastRead]);
 const ordered=useMemo(()=>accepted.filter(p=>(showArchived?archived.includes(p.id):!archived.includes(p.id))&&name(p).toLocaleLowerCase('tr').includes(chatSearch.toLocaleLowerCase('tr'))).sort((a,b)=>Number(pinned.includes(b.id))-Number(pinned.includes(a.id))||(new Date(summaries.get(b.id)?.last?.created_at||0).getTime()-new Date(summaries.get(a.id)?.last?.created_at||0).getTime())),[accepted,showArchived,archived,chatSearch,pinned,summaries]);
 if(!configured)return <main className="auth"><h1>Vexa</h1><p>Önce .env dosyasına Supabase URL ve anon anahtarını ekle.</p></main>;
 if(!ready)return <main className="auth">Yükleniyor…</main>;
 if(!session)return <main className="auth"><div className="logo">Vexa<span>●</span></div><h1>{register?'Hesap oluştur':'Tekrar hoş geldin'}</h1><p>Vexa hesabınla devam et.</p><form onSubmit={e=>{e.preventDefault();void auth()}}><input type="email" placeholder="E-posta" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Şifre" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/><button disabled={busy}>{register?'Kaydol':'Giriş yap'}</button></form><button className="link" onClick={()=>setRegister(!register)}>{register?'Giriş yap':'Yeni hesap oluştur'}</button>{error&&<p className="error">{error}</p>}</main>;
 const nav=[{id:'chats',icon:MessageCircle,label:'Sohbetler'},{id:'statuses',icon:Camera,label:'Durumlar'},{id:'find',icon:Search,label:'Kişi Ara'},{id:'requests',icon:Users,label:'İstekler'},{id:'profile',icon:UserRound,label:'Profilim'}] as const;
 const go=(t:Tab)=>{setTab(t);setSelected(null);setActiveGroupId(null);setActiveGroup(null);setError('');setMenuId(null)};
 return <div className="shell"><aside className={'sidebar '+(selected||tab==='chats'&&activeGroupId?'chat-open':'')}><div className="sidebar-header"><div className="logo">Vexa<span>●</span></div><span className="edition">10.1</span></div><nav className="nav">{nav.map(n=><button key={n.id} className={tab===n.id?'active':''} onClick={()=>go(n.id)}><n.icon size={20}/><span>{n.label}</span></button>)}</nav><section className="panel-scroll">
 {tab==='chats'&&<><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><h2>{showArchived?'Arşivlenenler':'Sohbetler'}</h2><button title="Sohbet listesini yenile" onClick={()=>void loadMessages()} style={iconBtn}><RefreshCw size={17}/></button></div><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}><Search size={18} color="var(--muted)"/><input aria-label="Sohbetlerde ara" placeholder="Sohbet ara…" value={chatSearch} onChange={e=>setChatSearch(e.target.value)}/></div><button onClick={()=>setShowArchived(!showArchived)} style={{...subtleBtn,width:'100%',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>{showArchived?<ArchiveRestore size={17}/>:<Archive size={17}/>} {showArchived?'Tüm sohbetlere dön':'Arşivlenen sohbetler'} {!showArchived&&archived.length>0&&`(${archived.length})`}</button>{ordered.length?ordered.map(p=>{const summary=summaries.get(p.id),last=summary?.last;return <div key={p.id} style={{position:'relative'}}><button className={'contact '+(selected?.id===p.id?'selected':'')} onClick={()=>{setSelected(p);setActiveGroupId(null);setActiveGroup(null);setMenuId(null)}} style={{paddingRight:44}}><Avatar p={p} size={46}/><span style={{flex:1,minWidth:0}}><span style={{display:'flex',justifyContent:'space-between',gap:5,alignItems:'center'}}><strong>{name(p)}</strong><small style={{flexShrink:0,margin:0}}>{last?(Date.now()-new Date(last.created_at).getTime()<86400000?time(last.created_at):day(last.created_at)):''}</small></span><span style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}><small style={{flex:1,minWidth:0,margin:0}}>{last?(last.deleted_at?'Silinen mesaj':last.body?short(last.body.replace(/\n/g,' ')):last.media_type?'📎 Medya':'Mesaj'):p.bio||'Mesajlaşmak için dokun'}</small>{!!summary?.unread&&<span style={unreadStyle}>{summary.unread>99?'99+':summary.unread}</span>}{pinned.includes(p.id)&&<Pin size={13} color="var(--accent)"/>}</span></span></button><button aria-label={`${name(p)} sohbet seçenekleri`} title="Sohbet seçenekleri" onClick={()=>setMenuId(menuId===p.id?null:p.id)} style={{...iconBtn,position:'absolute',right:4,top:14}}><MoreVertical size={19}/></button>{menuId===p.id&&<div style={popupStyle}><button style={popupButton} onClick={()=>toggle('pin',p.id)}><Pin size={16}/>{pinned.includes(p.id)?'Sabitlemeyi kaldır':'Sohbeti sabitle'}</button><button style={popupButton} onClick={()=>toggle('archive',p.id)}><Archive size={16}/>{archived.includes(p.id)?'Arşivden çıkar':'Arşivle'}</button><button style={popupButton} onClick={()=>{setInspect(p);setMenuId(null)}}><UserRound size={16}/>Profili görüntüle</button></div>}</div>}):<p className="hint">{showArchived?'Arşivlenmiş sohbet yok.':chatSearch?'Aramana uygun sohbet yok.':'Henüz arkadaşın yok. Kişi Ara bölümünden ekleyebilirsin.'}</p>}<div className="vexa92-groups-in-chats"><Groups mode="list" userId={uid!} profiles={profiles} activeGroupId={activeGroupId} onSelectGroup={id=>{setActiveGroupId(id);if(id)setSelected(null)}} onSelectGroupData={setActiveGroup}/></div><VexaAds userId={uid!}/></>}

  {tab==='statuses'&&<Statuses userId={uid!} profiles={profiles}/>}
 {tab==='find'&&<><h2>Kişi Ara</h2><VexaQRFind onFound={id=>{void supabase.from('profiles').select('id,display_name,bio,avatar_path,username').eq('id',id).maybeSingle().then(({data,error:e})=>{if(e)setError(e.message);else if(data)setInspect(data as Profile);else setError('Bu profil bulunamadı.');})}}/><form className="search-form" onSubmit={e=>{e.preventDefault();void findUsers()}}><input placeholder="Kullanıcı#1234 ara" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={busy}>Ara</button></form>{results.map(p=><div className="contact" key={p.id}><Avatar p={p}/><span className="grow"><strong>{name(p)}</strong><small>{p.bio||p.username||''}</small></span><button className="small" onClick={()=>setInspect(p)}>Profil</button><button className="small" onClick={()=>void addFriend(p.id)}>Ekle</button></div>)}</>}
 {tab==='requests'&&<><h2>Arkadaşlık istekleri</h2>{friends.filter(f=>f.status==='pending').length===0&&<p className="hint">Bekleyen arkadaşlık isteği yok.</p>}{friends.filter(f=>f.status==='pending').map(f=><div className="request" key={f.id}><strong>{name(profiles.find(p=>p.id===(f.sender_id===uid?f.recipient_id:f.sender_id)))}</strong>{f.recipient_id===uid?<div className="request-actions"><button onClick={()=>void updateRequest(f.id,true)}>Kabul et</button><button className="ghost" onClick={()=>void updateRequest(f.id,false)}>Reddet</button></div>:<small>Yanıt bekleniyor</small>}</div>)}</>}
 {tab==='profile'&&<><div className="profile-cover"/><div style={{marginTop:-32,marginLeft:14,position:'relative',width:78}}><Avatar p={{id:uid!,display_name:displayName,avatar_path:avatarUrl}} size={76}/></div><h2>Profilim</h2><label>Görünen ad</label><input value={displayName} maxLength={60} onChange={e=>setDisplayName(e.target.value)}/><label>Hakkımda</label><textarea value={bio} maxLength={300} onChange={e=>setBio(e.target.value)} rows={3}/><VexaAvatarEditor userId={uid!} onChange={(url: string)=>{setAvatarUrl(url);void load()}}/><button className="full" disabled={busy} onClick={()=>void saveProfile()}>{busy?'Kaydediliyor…':'Değişiklikleri kaydet'}</button>{saveNotice&&<p role="status" className="hint">{saveNotice}</p>}<VexaIdentity userId={uid!}/><VexaJoined userId={uid!}/><VexaTagEditor userId={uid!}/><VexaProfileQR userId={uid!}/><VexaPrivacySettings userId={uid!}/><VexaSettings userId={uid!}/><button className="logout" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/> Çıkış yap</button></>}
 {error&&<p className="error">{error}</p>}</section><div className="mobile-nav">{nav.map(n=><button key={n.id} className={tab===n.id?'active':''} onClick={()=>go(n.id)}><n.icon size={22}/><small>{n.label}</small></button>)}</div></aside>
 <main className={'conversation '+(selected||tab==='chats'&&activeGroupId?'show':'')}>{tab==='chats'&&activeGroupId&&uid?<Groups mode="chat" userId={uid} profiles={profiles} activeGroupId={activeGroupId} activeGroup={activeGroup} onSelectGroup={setActiveGroupId}/>:selected?<><header className="chat-header"><button className="back" onClick={()=>{setSelected(null);void loadMessages()}} aria-label="Geri"><ArrowLeft size={22}/></button><button onClick={()=>setInspect(selected)} style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1,textAlign:'left',background:'transparent',color:'inherit',padding:0}}><Avatar p={selected}/><span style={{minWidth:0}}><strong>{name(selected)}</strong><small>{selected.bio||'Özel sohbet'}</small></span></button><button onClick={()=>setInspect(selected)} title="Sohbet profili" style={iconBtn}><Settings size={19}/></button></header><EnhancedChat key={selected.id} userId={uid!} peerId={selected.id}/></>:<div className="welcome"><div className="welcome-icon"><MessageCircle size={44}/></div><h1>Vexa'ya hoş geldin</h1><p>Bir sohbet seçerek mesajlaşmaya başla.</p></div>}</main>
 
 {uid&&<div className="call-inbox"><Calls userId={uid} peer={tab==='chats'&&!activeGroupId?selected?.id||null:null} peerName={selected?name(selected):''} lookupName={id=>name(profiles.find(p=>p.id===id))}/></div>}
 {inspect&&<div role="presentation" onClick={()=>setInspect(null)} className="vexa102-backdrop"><div role="dialog" aria-modal="true" aria-label="Kişi profili" onClick={e=>e.stopPropagation()} className="vexa102-dialog"><Vexa102ProfileCard profile={inspect} selfId={uid!} isFriend={accepted.some(p=>p.id===inspect.id)} onClose={()=>setInspect(null)} onAdd={()=>void addFriend(inspect.id)} onMessage={()=>{setSelected(inspect);setTab('chats');setInspect(null)}}/></div></div>}
 </div>;
}
const iconBtn:CSSProperties={display:'grid',placeItems:'center',width:36,height:36,borderRadius:10,background:'transparent',color:'var(--muted)',flexShrink:0};
const subtleBtn:CSSProperties={padding:'10px 12px',borderRadius:11,background:'var(--panel2)',color:'var(--text)',textAlign:'left'};
const unreadStyle:CSSProperties={display:'inline-grid',placeItems:'center',minWidth:21,height:21,padding:'0 5px',borderRadius:20,background:'var(--accent)',color:'var(--accentText)',fontSize:11,fontWeight:800};
const popupStyle:CSSProperties={position:'absolute',right:8,top:48,zIndex:30,minWidth:205,padding:6,border:'1px solid var(--line)',borderRadius:13,background:'#213429',boxShadow:'0 12px 35px #0008'};
const popupButton:CSSProperties={display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 10px',textAlign:'left',background:'transparent',color:'var(--text)',borderRadius:8};

