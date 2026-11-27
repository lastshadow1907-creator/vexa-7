import {Splash130,Live130,Achievements130,Community130} from './Vexa130';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Session} from '@supabase/supabase-js';
import {MessageCircle,Users,Search,UserRound,ArrowLeft,LogOut,Settings,Share2,Pin,Archive,ArchiveRestore,MoreVertical,Plus,Trash2,PhoneCall,ChevronRight} from 'lucide-react';
import {supabase,configured} from './supabase';
import Calls from './Calls';
import EnhancedChat from './EnhancedChat';
import Groups from './Groups';
import {VexaSettings,VexaAds} from './VexaFeatures';
import {VexaIdentity,VexaJoined,VexaTagEditor} from './Vexa92_Profile';
import {VexaPrivacySettings,VexaProfileQR,VexaQRFind,useVexaPresenceHeartbeat,VexaPublicPresence} from './Vexa102_Privacy';
import {Vexa102ProfileCard} from './Vexa102_ProfileCard';
import type {Profile,FriendRequest} from './supabase';
import Vexa11Hub from './Vexa11Hub';
import Vexa12Settings,{applyVexaTheme} from './Vexa12Settings';
import Vexa14CallHistory from './Vexa14CallHistory';
import VexaAvatarCropper from './VexaAvatarCropper';
import VexaAI from './VexaAI';
import VexaPlus,{VexaAdmin,usePlusStatus} from './VexaPlus';
import {Image, Trophy, UsersRound, RefreshCw, ShieldCheck} from 'lucide-react';
import {useLook,Badge,Cosmetics,News,useActive} from './Vexa112';

type Tab='chats'|'find'|'requests'|'profile'|'vexa11'|'calls14'|'ai';
type ChatRow={id:number;sender_id:string;recipient_id:string;body:string|null;created_at:string;read_at?:string|null;deleted_at?:string|null;media_type?:string|null};
const name=(p?:Profile|null)=>p?.display_name?.trim()||p?.username||'Vexa kullanıcısı';
const time=(date:string)=>new Date(date).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const day=(date:string)=>new Date(date).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'});
const short=(s:string,n=55)=>s.length>n?s.slice(0,n-1)+'…':s;
const photo=(p?:Profile|null)=>{const v=p?.avatar_path||'';return /^https:\/\//i.test(v)?v:null};
function Avatar({p,size=43}:{p?:Profile|null;size?:number}){const look=useLook(p?.id);const src=look?.gif||photo(p);return <span className={"avatar v112-frame-"+(look?.frame||"none")} style={{width:size,height:size,flexBasis:size,borderRadius:'50%',overflow:'hidden'}}>{src?<img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:name(p).slice(0,1).toUpperCase()}</span>}
function storageGet(key:string):string[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}}
// Android uygulamasi gercek versionName degerini user agent icinde gonderir.
const VEXA_INSTALLED_VERSION=navigator.userAgent.match(/VexaAndroid\/([0-9]+(?:\.[0-9]+)*)/i)?.[1]||null;
const VEXA_RELEASES_API='https://api.github.com/repos/lastshadow1907-creator/vexa-7/releases/latest';
type VexaRelease={tag_name:string;html_url:string;body:string|null;assets:Array<{name:string;browser_download_url:string}>};
function compareVersions(a:string,b:string){
 const parse=(v:string)=>v.replace(/^v/i,'').split('-')[0].split('.').map(x=>Number(x)||0);
 const x=parse(a),y=parse(b);
 for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;}
 return 0;
}

export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState(''),[register,setRegister]=useState(false);
 const [resetMode,setResetMode]=useState(false),[resetNotice,setResetNotice]=useState('');
 const [signupNotice,setSignupNotice]=useState('');
 const [tab,setTab]=useState<Tab>('chats'),[friends,setFriends]=useState<FriendRequest[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
 const [selected,setSelected]=useState<Profile|null>(null),[inspect,setInspect]=useState<Profile|null>(null);
 const [filter,setFilter]=useState<'all'|'unread'|'groups'>('all');
 const [profileSection,setProfileSection]=useState('');
 const [gestureNotice,setGestureNotice]=useState('');
 useEffect(()=>{if(!gestureNotice)return;const t=setTimeout(()=>setGestureNotice(''),2200);return()=>clearTimeout(t)},[gestureNotice]);
 const swipe=useRef<{x:number;y:number}|null>(null), suppress=useRef(0);
 const [newChat,setNewChat]=useState(false),[newChatSearch,setNewChatSearch]=useState(''),[groupCreate,setGroupCreate]=useState(0);
 const [activeGroupId,setActiveGroupId]=useState<string|null>(null);
 const [activeGroup,setActiveGroup]=useState<{id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null}|null>(null);
 const [search,setSearch]=useState(''),[results,setResults]=useState<Profile[]>([]),[chatSearch,setChatSearch]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[chatRows,setChatRows]=useState<ChatRow[]>([]);
 const [displayName,setDisplayName]=useState(''),[bio,setBio]=useState(''),[avatarUrl,setAvatarUrl]=useState(''),[coverUrl,setCoverUrl]=useState(''),[saveNotice,setSaveNotice]=useState('');
 const [clearAt,setClearAt]=useState<Record<string,string>>({});
 const [lastRead,setLastRead]=useState<Record<string,string>>({});
 const [archived,setArchived]=useState<string[]>([]),[pinned,setPinned]=useState<string[]>([]),[showArchived,setShowArchived]=useState(false),[menuId,setMenuId]=useState<string|null>(null);
 const [availableUpdate,setAvailableUpdate]=useState<{version:string;url:string;notes:string}|null>(null);
 const [updateDismissed,setUpdateDismissed]=useState(false);
 const uid=session?.user.id;
 const {status:adminStatus}=usePlusStatus();
 const look=useLook(uid);const active=useActive(uid);
 useEffect(()=>{
  if(!VEXA_INSTALLED_VERSION)return;
  let active=true;
  const check=async()=>{
   try{
    const response=await fetch(VEXA_RELEASES_API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(!response.ok)throw new Error('GitHub Releases: '+response.status);
    const release=(await response.json()) as VexaRelease;
    const apk=release.assets?.find(asset=>/\.apk$/i.test(asset.name));
    if(!active)return;
    if(apk&&compareVersions(release.tag_name,VEXA_INSTALLED_VERSION)>0){
     setUpdateDismissed(localStorage.getItem('vexa-update-dismissed-'+VEXA_INSTALLED_VERSION)===release.tag_name);
     setAvailableUpdate({version:release.tag_name,url:apk.browser_download_url,notes:(release.body||'').slice(0,250)});
    }else{setAvailableUpdate(null);setUpdateDismissed(false);}
   }catch(e){console.warn('Vexa guncelleme kontrolu:',e);}
  };
  void check();
  return()=>{active=false};
 },[]);
 useVexaPresenceHeartbeat(uid);
 useEffect(()=>{if(!uid)return;try{const t=JSON.parse(localStorage.getItem('vexa12-theme-'+uid)||'{}');applyVexaTheme(t.color||'emerald',t.mode==='light'?'light':'dark');document.documentElement.dataset.vexaWallpaper=t.wallpaper||'none'}catch{applyVexaTheme('emerald','dark')}},[uid]);
  // Android WebView FCM tokenini, oturum acildiktan sonra kullaniciya bagla.
  useEffect(()=>{
   if(!uid)return;
   let cancelled=false;
   const saveToken=async(token:string)=>{
    if(cancelled||!/^[A-Za-z0-9:_-]{40,4096}$/.test(token))return;
    const {error:e}=await supabase.from('vexa_fcm_tokens').upsert(
     {user_id:uid,token,platform:'android',updated_at:new Date().toISOString()},
     {onConflict:'token'}
    );
    if(e)console.warn('FCM cihaz kaydi:',e.message);
   };
   const onToken=(event:Event)=>{const token=(event as CustomEvent<string>).detail;if(typeof token==='string')void saveToken(token)};
   window.addEventListener('vexa-fcm-token',onToken);
   const cached=sessionStorage.getItem('vexa-fcm-token');if(cached)void saveToken(cached);
   return()=>{cancelled=true;window.removeEventListener('vexa-fcm-token',onToken)};
  },[uid]);
 useEffect(()=>{let active=true;void supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setReady(true)}});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>{active=false;subscription.unsubscribe()}},[]);
 useEffect(()=>{setLastRead(uid?JSON.parse(localStorage.getItem('vexa-lastread-'+uid)||'{}'):{});setSelected(null);setChatRows([]);setClearAt(uid?JSON.parse(localStorage.getItem('vexa-clear-'+uid)||'{}'):{});setArchived(uid?storageGet('vexa-archive-'+uid):[]);setPinned(uid?storageGet('vexa-pin-'+uid):[])},[uid]);
 const load=useCallback(async()=>{if(!uid)return;const [f,p]=await Promise.all([supabase.from('friend_requests').select('id,sender_id,recipient_id,status').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`),supabase.from('profiles').select('id,display_name,bio,avatar_path,username,cover_url').limit(500)]);if(f.error||p.error){setError(f.error?.message||p.error?.message||'Yüklenemedi');return}setFriends(f.data||[]);setProfiles(p.data||[]);const me=(p.data||[]).find(x=>x.id===uid);setDisplayName(me?.display_name||'');setBio(me?.bio||'');setAvatarUrl(photo(me)||'');setCoverUrl(me?.cover_url||'')},[uid]);
 const loadMessages=useCallback(async()=>{if(!uid)return;const {data,error:e}=await supabase.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at,deleted_at,media_type').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).limit(500);if(!e)setChatRows((data||[]) as ChatRow[]);else console.warn('Sohbet özetleri:',e.message)},[uid]);
 useEffect(()=>{void load();void loadMessages()},[load,loadMessages]);
 useEffect(()=>{
  if(!uid)return;
  const id=new URLSearchParams(window.location.search).get('vexa_user');
  if(!id||!(/^[0-9a-f-]{36}$/i.test(id)))return;
  let cancelled=false;
  void supabase.from('profiles').select('id,display_name,bio,avatar_path,username,cover_url').eq('id',id).maybeSingle().then(({data,error:e})=>{
   if(cancelled)return;
   if(e)setError(e.message);else if(data)setInspect(data as Profile);else setError('QR bağlantısındaki profil bulunamadı.');
   window.history.replaceState(null,'',window.location.pathname);
  });
  return()=>{cancelled=true};
 },[uid]);
 useEffect(()=>{if(!uid)return;const ch=supabase.channel('vexa-app-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>{void load()}).on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>{void loadMessages()}).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>{void load()}).subscribe();const onFocus=()=>{void loadMessages()};window.addEventListener('focus',onFocus);return()=>{window.removeEventListener('focus',onFocus);void supabase.removeChannel(ch)}},[uid,load,loadMessages]);

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
 async function sendReset(){setResetNotice('');if(!email.includes('@')){setResetNotice('E-posta adresini yaz.');return}setBusy(true);const {error:e}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+window.location.pathname});setBusy(false);setResetNotice(e?e.message:'Bu adrese kayıtlı hesap varsa şifre sıfırlama bağlantısı gönderildi.')}
 async function googleLogin(){
  setError('');setBusy(true);
  try{
   const isAndroid=/VexaAndroid/i.test(navigator.userAgent);
   const redirectTo=isAndroid?'com.vexa.chat://auth/callback':window.location.origin+window.location.pathname;
   const {data,error:e}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true}});
   if(e)throw e;
   if(!data.url)throw new Error('Google giriş adresi oluşturulamadı.');
   window.location.assign(data.url);
  }catch(e){setError((e as Error).message);setBusy(false)}
 }
 async function shareVexa(){
  const url='https://vexa-7.vercel.app/';
  const data={title:'Vexa',text:'Vexa uygulamasına katıl, birlikte mesajlaşalım!',url};
  try{if(navigator.share){await navigator.share(data)}else{await navigator.clipboard.writeText(`${data.text} ${url}`);setSaveNotice('Davet bağlantısı kopyalandı.')}}
  catch(e){if((e as Error).name!=='AbortError')setError('Paylaşım başlatılamadı. Bağlantı: '+url)}
 }
 async function auth(){
  setError('');setSignupNotice('');
  const handle=username.trim().toLowerCase();
  if(register&&!/^[a-z0-9_]{3,20}$/.test(handle)){
   setError('Kullanıcı adı 3–20 karakter olmalı; yalnızca küçük harf, rakam ve _ kullanılabilir.');return;
  }
  setBusy(true);
  try{
   const r=register
    ?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+window.location.pathname,data:{username:handle,display_name:handle}}})
    :await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(r.error)throw r.error;
   if(register&&!r.data.session){setSignupNotice('Kayıt isteğin alındı. E-postana gelen hesap doğrulama bağlantısına tıkla. Spam klasörünü de kontrol et.');setRegister(false);setResetMode(false);setPassword('');}
  }catch(e){
   const message=(e as Error).message;
   setError(/duplicate key|profiles_username_key|kullanıcı adı.*kullanımda/i.test(message)?'Bu kullanıcı adı kullanılıyor. Başka bir ad seç.':message);
  }finally{setBusy(false)}
 }
 async function findUsers(){if(search.trim().replace(/^#/,'').length<2)return;setBusy(true);setError('');const {data:tags,error:e}=await supabase.from('vexa91_identity').select('user_id,handle,tag_number').ilike('handle',`%${search.trim().replace(/^#/,'').split('#')[0].replace(/[%_]/g,'')}%`).limit(30);if(e)setError(e.message);else{const ids=(tags||[]).filter(t=>!search.includes('#')||String(t.tag_number).padStart(4,'0')===search.split('#')[1]).map(t=>t.user_id as string).filter((id:string)=>id!==uid);const {data,error:profileError}=ids.length?await supabase.from('profiles').select('id,display_name,bio,avatar_path,username,cover_url').in('id',ids):{data:[],error:null};if(profileError)setError(profileError.message);setResults(data||[])}setBusy(false)}
 async function addFriend(id:string){const {error:e}=await supabase.rpc('vexa_send_friend_request',{p_recipient_id:id});if(e)setError(e.message);else await load()}
 async function updateRequest(id:string,accept:boolean){
  if(!uid)return;
  setError('');
  const {data,error:e}=await supabase.from('friend_requests')
   .update({status:accept?'accepted':'rejected'})
   .eq('id',id).eq('recipient_id',uid).eq('status','pending')
   .select('id,status').maybeSingle();
  if(e){setError('İstek güncellenemedi: '+e.message);return}
  if(!data){setError('İstek güncellenmedi. Supabase RLS güncelleme iznini ve isteğin hâlâ beklemede olduğunu kontrol et.');return}
  await load();
 }
 async function saveProfile(){if(!uid||busy)return;setBusy(true);setError('');setSaveNotice('');try{const {data,error:e}=await supabase.from('profiles').update({display_name:displayName.trim(),bio,cover_url:coverUrl.trim()||null}).eq('id',uid).select('id').maybeSingle();if(e)throw e;if(!data)throw new Error('Profil kaydı bulunamadı veya düzenleme iznin yok. Supabase profiles RLS kurallarını kontrol et.');setSaveNotice('Profil değişiklikleri kaydedildi.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function toggle(kind:'pin'|'archive',id:string){if(!uid)return;const prev=kind==='pin'?pinned:archived;const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];localStorage.setItem('vexa-'+kind+'-'+uid,JSON.stringify(next));if(kind==='pin')setPinned(next);else setArchived(next);setMenuId(null)}
 function clearConversation(peerId:string){if(!uid)return;if(!window.confirm('Bu sohbet geçmişi yalnızca senin hesabında gizlensin mi? Karşı tarafın mesajları silinmez.'))return;const next={...clearAt,[peerId]:new Date().toISOString()};localStorage.setItem('vexa-clear-'+uid,JSON.stringify(next));setClearAt(next);setMenuId(null);}
 const accepted=useMemo(()=>friends.filter(f=>f.status==='accepted').map(f=>profiles.find(p=>p.id===(f.sender_id===uid?f.recipient_id:f.sender_id))).filter((p):p is Profile=>!!p),[friends,profiles,uid]);
 const summaries=useMemo(()=>{const map=new Map<string,{last:ChatRow|null;unread:number}>();accepted.forEach(p=>map.set(p.id,{last:null,unread:0}));for(const m of chatRows){const id=m.sender_id===uid?m.recipient_id:m.sender_id;if(clearAt[id]&&new Date(m.created_at).getTime()<=new Date(clearAt[id]).getTime())continue;const row=map.get(id);if(!row)continue;if(!row.last)row.last=m;if(m.recipient_id===uid&&!m.deleted_at&&!m.read_at&&(!lastRead[id]||new Date(m.created_at)>new Date(lastRead[id])))row.unread++}return map},[accepted,chatRows,uid,lastRead,clearAt]);
 const ordered=useMemo(()=>accepted.filter(p=>(showArchived?archived.includes(p.id):!archived.includes(p.id)&&!!summaries.get(p.id)?.last)&&name(p).toLocaleLowerCase('tr').includes(chatSearch.toLocaleLowerCase('tr'))).sort((a,b)=>Number(pinned.includes(b.id))-Number(pinned.includes(a.id))||(new Date(summaries.get(b.id)?.last?.created_at||0).getTime()-new Date(summaries.get(a.id)?.last?.created_at||0).getTime())),[accepted,showArchived,archived,chatSearch,pinned,summaries]);
 const updateDialog=availableUpdate&&!updateDismissed&&<div className="vexa102-backdrop" role="presentation" style={{zIndex:9999}}>
   <div className="vexa102-dialog" role="dialog" aria-modal="true" aria-label="Vexa guncellemesi" style={{maxWidth:420,padding:24}}>
    <h2 style={{marginTop:0}}>Vexa güncellemesi mevcut</h2>
    <p>Yeni sürüm: <strong>{availableUpdate.version}</strong></p>
    {availableUpdate.notes&&<p style={{whiteSpace:'pre-wrap',maxHeight:110,overflow:'auto'}}>{availableUpdate.notes}</p>}
    <p style={{fontSize:13,opacity:.75}}>APK telefonun İndirilenler klasörüne kaydedilir. Android yükleme için ayrıca onay ister.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
     <a href={availableUpdate.url} style={{...subtleBtn,background:'var(--accent)',color:'var(--accentText)',textDecoration:'none',fontWeight:700}}>Güncellemeyi indir</a>
     <button type="button" style={subtleBtn} onClick={()=>{if(VEXA_INSTALLED_VERSION)localStorage.setItem('vexa-update-dismissed-'+VEXA_INSTALLED_VERSION,availableUpdate.version);setUpdateDismissed(true)}}>Daha sonra</button>
    </div>
   </div>
  </div>;
 if(!configured)return <main className="auth"><h1>Vexa</h1><p>Önce .env dosyasına Supabase URL ve anon anahtarını ekle.</p></main>;
 if(!ready)return <Splash130/>;
 if(!session)return <><main className="auth"><div className="logo">Vexa<span>●</span></div><h1>{resetMode?'Şifremi unuttum':register?'Hesap oluştur':'Tekrar hoş geldin'}</h1><p>{resetMode?'Şifre sıfırlama bağlantısını e-postana gönderelim.':'Vexa hesabınla devam et.'}</p>{resetMode?<form onSubmit={e=>{e.preventDefault();void sendReset()}}><input type="email" placeholder="E-posta" value={email} onChange={e=>setEmail(e.target.value)} required/><button disabled={busy}>Sıfırlama bağlantısı gönder</button></form>:<form onSubmit={e=>{e.preventDefault();void auth()}}><input type="email" placeholder="E-posta" value={email} onChange={e=>setEmail(e.target.value)} required/>{register&&<><input type="text" placeholder="Kullanıcı adı (3–20 karakter)" aria-label="Kullanıcı adı" value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" title="3–20 karakter: küçük harf, rakam veya alt çizgi" autoComplete="username" required/><small className="hint">Etiketin (#1234 gibi) otomatik ve benzersiz atanır.</small></>}<input type="password" placeholder="Şifre" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/><button disabled={busy}>{register?'Kaydol':'Giriş yap'}</button></form>}<button className="link" onClick={()=>{setResetMode(false);setRegister(resetMode?false:!register);setError('');setResetNotice('');setSignupNotice('')}}>{register||resetMode?'Giriş yap':'Yeni hesap oluştur'}</button>{!register&&!resetMode&&<button className="link" onClick={()=>{setResetMode(true);setRegister(false);setError('');setSignupNotice('')}}>Şifremi unuttum</button>}<button type="button" className="vexa-google-login" disabled={busy} onClick={()=>void googleLogin()}>Google ile giriş yap</button>{signupNotice&&<p role="status" className="hint">{signupNotice}</p>}{resetNotice&&<p role="status" className="hint">{resetNotice}</p>}{error&&<p className="error">{error}</p>}</main>{updateDialog}</>;
 if(session&&active===false)return <main className="auth"><h2>Hesap askıya alındı</h2><p>Vexa yönetimine başvur.</p><button onClick={()=>void supabase.auth.signOut()}>Çıkış yap</button></main>;
 const nav=[{id:'chats',icon:MessageCircle,label:'Sohbetler'},{id:'calls14',icon:PhoneCall,label:'Aramalar'},{id:'ai',icon:MessageCircle,label:'Vexa AI'},{id:'find',icon:Search,label:'Kişi Ara'},{id:'requests',icon:Users,label:'İstekler'},{id:'profile',icon:UserRound,label:'Profilim'},{id:'vexa11',icon:Settings,label:'Vexa 11'}] as const;
 const mobileNav=nav.filter(n=>['chats','calls14','profile'].includes(n.id));
 const go=(t:Tab)=>{setProfileSection('');setTab(t);setNewChat(false);setSelected(null);setActiveGroupId(null);setActiveGroup(null);setError('');setMenuId(null)};
 return <div className="shell"><aside className={'sidebar '+(selected||tab==='chats'&&activeGroupId||tab==='ai'?'chat-open':'')}><div className="sidebar-header"><div className="logo">Vexa<span>●</span></div><span className="edition">13.0</span></div><nav className="nav">{nav.filter(n=>['chats','calls14','profile'].includes(n.id)).map(n=><button key={n.id} className={tab===n.id?'active':''} onClick={()=>go(n.id)}><n.icon size={20}/><span>{n.label}</span></button>)}</nav><section className="panel-scroll">
 {tab==='chats'&&<><News/><div className="vexa91-inbox-head"><h2>{showArchived?'Arşiv':'Sohbetler'}</h2><button className="vexa91-new" onClick={()=>{setNewChatSearch('');setNewChat(true)}}><Plus size={19}/> Yeni sohbet</button></div><div className="vexa91-search"><Search size={18}/><input aria-label="Sohbetlerde ara" placeholder="Sohbet ara…" value={chatSearch} onChange={e=>setChatSearch(e.target.value)}/></div><button className="vexa91-archive" onClick={()=>setShowArchived(!showArchived)}>{showArchived?<ArchiveRestore size={16}/>:<Archive size={16}/>} {showArchived?'Sohbetlere dön':'Arşiv'} {!showArchived&&archived.length>0&&`(${archived.length})`}</button>{!showArchived&&<div className="v93-filters">{([ ['all','Tümü'],['unread','Okunmamış'],['groups','Gruplar']] as const).map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>}{(showArchived||filter!=='groups')&&(ordered.filter(p=>showArchived||filter!=='unread'||!!summaries.get(p.id)?.unread).length?ordered.filter(p=>showArchived||filter!=='unread'||!!summaries.get(p.id)?.unread).map(p=>{const summary=summaries.get(p.id),last=summary?.last;return <div key={p.id} className="v93-swipe" style={{position:'relative'}} onTouchStart={e=>{swipe.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchMove={e=>{const g=swipe.current;if(!g)return;const t=e.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){swipe.current=null;e.currentTarget.style.removeProperty("--drag");return}if(dx<0)e.currentTarget.style.setProperty("--drag",`${Math.max(-110,dx)}px`)}} onTouchCancel={e=>{swipe.current=null;e.currentTarget.style.removeProperty("--drag")}} onTouchEnd={e=>{const s=swipe.current;swipe.current=null;e.currentTarget.style.removeProperty("--drag");if(s&&s.x-e.changedTouches[0].clientX>85&&Math.abs(s.y-e.changedTouches[0].clientY)<40){suppress.current=Date.now()+500;toggle('archive',p.id);setGestureNotice(showArchived?'Sohbet arşivden çıkarıldı':'Sohbet arşivlendi')}}}><span className="v94-archive-reveal" aria-hidden="true"><Archive size={19}/>{showArchived?'Geri al':'Arşivle'}</span><button className={'contact '+(selected?.id===p.id?'selected':'')} onClick={()=>{if(Date.now()<suppress.current)return;setSelected(p);setActiveGroupId(null);setActiveGroup(null);setMenuId(null)}} style={{paddingRight:44}}><Avatar p={p} size={46}/><span style={{flex:1,minWidth:0}}><span style={{display:'flex',justifyContent:'space-between',gap:5,alignItems:'center'}}><strong>{name(p)}</strong><small style={{flexShrink:0,margin:0}}>{last?(Date.now()-new Date(last.created_at).getTime()<86400000?time(last.created_at):day(last.created_at)):''}</small></span><span style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}><small style={{flex:1,minWidth:0,margin:0}}>{last?(last.deleted_at?'Silinen mesaj':last.body?short(last.body.replace(/\n/g,' ')):last.media_type?'📎 Medya':'Mesaj'):p.bio||'Mesajlaşmak için dokun'}</small>{!!summary?.unread&&<span style={unreadStyle}>{summary.unread>99?'99+':summary.unread}</span>}{pinned.includes(p.id)&&<Pin size={13} color="var(--accent)"/>}</span></span></button><button aria-label={`${name(p)} sohbet seçenekleri`} title="Sohbet seçenekleri" onClick={()=>setMenuId(menuId===p.id?null:p.id)} style={{...iconBtn,position:'absolute',right:4,top:14}}><MoreVertical size={19}/></button>{menuId===p.id&&<div style={popupStyle}><button style={popupButton} onClick={()=>toggle('pin',p.id)}><Pin size={16}/>{pinned.includes(p.id)?'Sabitlemeyi kaldır':'Sohbeti sabitle'}</button><button style={popupButton} onClick={()=>toggle('archive',p.id)}><Archive size={16}/>{archived.includes(p.id)?'Arşivden çıkar':'Arşivle'}</button><button style={popupButton} onClick={()=>clearConversation(p.id)}><Trash2 size={16}/>Sohbeti temizle</button><button style={popupButton} onClick={()=>{setInspect(p);setMenuId(null)}}><UserRound size={16}/>Profili görüntüle</button></div>}</div>}):<p className="hint">{showArchived?'Arşivlenmiş sohbet yok.':filter==='unread'?'Okunmamış sohbet yok.':chatSearch?'Aramana uygun sohbet yok.':'Henüz konuşman yok. Yeni sohbet ile başlayabilirsin.'}</p>)}{!showArchived&&filter!=='unread'&&<div className="vexa92-groups-in-chats"><Groups createRequest={groupCreate} mode="list" userId={uid!} profiles={profiles} activeGroupId={activeGroupId} onSelectGroup={id=>{setActiveGroupId(id);if(id)setSelected(null)}} onSelectGroupData={setActiveGroup}/></div>}{look&&!look.premium&&<VexaAds userId={uid!}/>}</>}

  {tab==='calls14'&&uid&&<div className="vexa16-mobile-history"><Vexa14CallHistory userId={uid} lookupName={id=>name(profiles.find(p=>p.id===id))}/></div>}
 
  {tab==='vexa11'&&uid&&<Vexa11Hub userId={uid} groupId={activeGroupId}/>}
 {tab==='find'&&<><button className="vexa91-archive" onClick={()=>{go('chats');setNewChat(true)}}><ArrowLeft size={17}/> Yeni sohbete dön</button><h2>Kişi Ara</h2><VexaQRFind onFound={id=>{void supabase.from('profiles').select('id,display_name,bio,avatar_path,username,cover_url').eq('id',id).maybeSingle().then(({data,error:e})=>{if(e)setError(e.message);else if(data)setInspect(data as Profile);else setError('Bu profil bulunamadı.');})}}/><form className="search-form" onSubmit={e=>{e.preventDefault();void findUsers()}}><input placeholder="Kullanıcı#1234 ara" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={busy}>Ara</button></form>{results.map(p=><div className="contact" key={p.id}><Avatar p={p}/><span className="grow"><strong>{name(p)}</strong><small>{p.bio||p.username||''}</small></span><button className="small" onClick={()=>setInspect(p)}>Profil</button><button className="small" onClick={()=>void addFriend(p.id)}>Ekle</button></div>)}</>}
 {tab==='requests'&&<><h2>Arkadaşlık istekleri</h2>{friends.filter(f=>f.status==='pending').length===0&&<p className="hint">Bekleyen arkadaşlık isteği yok.</p>}{friends.filter(f=>f.status==='pending').map(f=><div className="request" key={f.id}><strong>{name(profiles.find(p=>p.id===(f.sender_id===uid?f.recipient_id:f.sender_id)))}</strong>{f.recipient_id===uid?<div className="request-actions"><button onClick={()=>void updateRequest(f.id,true)}>Kabul et</button><button className="ghost" onClick={()=>void updateRequest(f.id,false)}>Reddet</button></div>:<small>Yanıt bekleniyor</small>}</div>)}</>}
 {tab==='profile'&&<div className="vexa13-profile"><div className="profile-cover" style={coverUrl?{backgroundImage:`linear-gradient(transparent,rgba(0,0,0,.35)),url(${coverUrl})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}>{uid&&<Live130 userId={uid} banner/>}</div><div className="vexa13-profile-head"><Avatar p={{id:uid!,display_name:displayName,avatar_path:avatarUrl}} size={70}/><div><h2>{displayName||'Profilim'} <Badge look={look}/></h2><p>Hesabını ve Vexa deneyimini yönet</p></div></div>
 <div className="v94-profile-menu"><button onClick={()=>setProfileSection(profileSection==='plus'?'':'plus')}><span aria-hidden="true">♛</span> Vexa Plus <ChevronRight size={16}/></button><button onClick={()=>setProfileSection(profileSection==='edit'?'':'edit')}><UserRound size={20}/> Profili düzenle <ChevronRight size={16}/></button><button onClick={()=>setProfileSection(profileSection==='identity'?'':'identity')}><Users size={20}/> Kimlik ve QR <ChevronRight size={16}/></button><button onClick={()=>setProfileSection(profileSection==='settings'?'':'settings')}><Settings size={20}/> Ayarlar <ChevronRight size={16}/></button><button onClick={()=>setProfileSection(profileSection==='privacy'?'':'privacy')}><Pin size={20}/> Gizlilik <ChevronRight size={16}/></button><button onClick={()=>setProfileSection(profileSection==='more'?'':'more')}><MoreVertical size={20}/> Diğer <ChevronRight size={16}/></button></div><div className="vexa16-profile-shortcuts" hidden={profileSection!=='more'}><button type="button" onClick={()=>void shareVexa()}><Share2 size={18}/> Vexa uygulamasını paylaş</button>
  <button type="button" onClick={()=>go('requests')}><Users size={18}/> Arkadaşlık istekleri</button>
  <button type="button" onClick={()=>go('ai')}><MessageCircle size={18}/> Vexa AI</button>
  <button type="button" onClick={()=>go('vexa11')}><Settings size={18}/> Vexa özellikleri</button>
 </div>
 <div className='v130-profile-nav'>{[{id:'live130',label:'Profil bannerı',Icon:Image},{id:'ach130',label:'Başarımlar',Icon:Trophy},{id:'community130',label:'Community',Icon:UsersRound},{id:'update130',label:'Güncelleme',Icon:RefreshCw},...(adminStatus?.admin?[{id:'admin130',label:'Yönetim paneli',Icon:ShieldCheck}]:[])].map(({id,label,Icon})=><button key={id} aria-pressed={profileSection===id} onClick={()=>setProfileSection(profileSection===id?'':id)}><Icon size={20}/><span>{label}</span></button>)}</div>{profileSection==='admin130'&&adminStatus?.admin&&<VexaAdmin/>}{profileSection==='live130'&&<Live130 userId={uid!} edit/>}{profileSection==='ach130'&&<Achievements130 userId={uid!}/ >}{profileSection==='community130'&&<Community130 userId={uid!}/ >}{profileSection==='update130'&&<section className='v130-section'><h3>Uygulama güncellemesi</h3><p>Kurulu APK: {VEXA_INSTALLED_VERSION||'Web'}</p>{availableUpdate?<><p>{availableUpdate.version}</p><p>{availableUpdate.notes}</p><button onClick={()=>setUpdateDismissed(false)}>Güncellemeyi göster</button></>:<a href='https://github.com/lastshadow1907-creator/vexa-7/releases/latest' target='_blank' rel='noopener noreferrer'>Son APK sürümünü kontrol et</a>}</section>}{profileSection==='plus'&&<VexaPlus/>}
 <details className="vexa13-category" open hidden={profileSection!=='edit'}> <summary><UserRound size={19}/> Profil bilgileri <span>Ad, biyografi ve fotoğraf</span></summary><div className="vexa13-category-body"><label>Görünen ad</label><input value={displayName} maxLength={60} onChange={e=>setDisplayName(e.target.value)}/><label>Kapak fotoğrafı HTTPS bağlantısı</label><input type="url" placeholder="https://..." value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} /><label>Hakkımda</label><textarea value={bio} maxLength={300} onChange={e=>setBio(e.target.value)} rows={3}/><Cosmetics uid={uid!}/><VexaAvatarCropper userId={uid!} avatarUrl={avatarUrl} onChange={(url:string)=>{setAvatarUrl(url);void load()}}/><button className="full" disabled={busy} onClick={()=>void saveProfile()}>{busy?'Kaydediliyor…':'Değişiklikleri kaydet'}</button>{saveNotice&&<p role="status" className="hint">{saveNotice}</p>}</div></details>
 <details className="vexa13-category" open hidden={profileSection!=='identity'}> <summary><Users size={19}/> Kimlik ve QR <span>Etiket, hesap ve QR kod</span></summary><div className="vexa13-category-body"><VexaIdentity userId={uid!}/><VexaJoined userId={uid!}/><VexaTagEditor userId={uid!}/><VexaProfileQR userId={uid!}/></div></details>
 <details className="vexa13-category" open hidden={profileSection!=='settings'}> <summary><Settings size={19}/> Görünüm ve hesap <span>Temalar, şifre ve oturumlar</span></summary><div className="vexa13-category-body"><Vexa12Settings userId={uid!}/></div></details>
 <details className="vexa13-category" open hidden={profileSection!=='privacy'}> <summary><Pin size={19}/> Gizlilik ve tercihler <span>Görünürlük ve uygulama ayarları</span></summary><div className="vexa13-category-body"><VexaPrivacySettings userId={uid!}/><VexaSettings userId={uid!}/></div></details>
 <button hidden={profileSection!=='more'} className="logout vexa13-logout" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/> Çıkış yap</button></div>}

 {error&&<p className="error">{error}</p>}</section><div className={"mobile-nav vexa16-mobile-nav" + (selected || (tab === "chats" && activeGroupId) ? " hidden-in-chat" : "")}>{mobileNav.map(n=><button key={n.id} className={tab===n.id||(n.id==='profile'&&['requests','vexa11'].includes(tab))?'active':''} onClick={()=>go(n.id)}><n.icon size={22}/><small>{n.label}</small></button>)}</div></aside>
 <main className={'conversation '+(selected||tab==='chats'&&activeGroupId||tab==='ai'?'show':'')}>{tab==='ai'&&uid?<><header className="vexa9-ai-back"><button className="back" onClick={()=>go('profile')} aria-label="Geri"><ArrowLeft size={22}/></button></header><VexaAI /></>:tab==='calls14'&&uid?<div className="vexa16-desktop-history"><Vexa14CallHistory userId={uid} lookupName={id=>name(profiles.find(p=>p.id===id))}/></div>:tab==='chats'&&activeGroupId&&uid?<Groups mode="chat" userId={uid} profiles={profiles} activeGroupId={activeGroupId} activeGroup={activeGroup} onSelectGroup={setActiveGroupId}/>:selected?<><header className="chat-header"><button className="back" onClick={()=>{setSelected(null);void loadMessages()}} aria-label="Geri"><ArrowLeft size={22}/></button><button onClick={()=>setInspect(selected)} style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1,textAlign:'left',background:'transparent',color:'inherit',padding:0}}><Avatar p={selected}/><span style={{minWidth:0}}><strong>{name(selected)}</strong><VexaPublicPresence userId={selected.id}/></span></button><button onClick={()=>setInspect(selected)} title="Sohbet profili" style={iconBtn}><Settings size={19}/></button></header><EnhancedChat key={selected.id} userId={uid!} peerId={selected.id} clearedAt={clearAt[selected.id]||null} peerName={name(selected)}/></>:<div className="welcome"><div className="welcome-icon"><MessageCircle size={44}/></div><h1>Vexa'ya hoş geldin</h1><p>Bir sohbet seçerek mesajlaşmaya başla.</p></div>}</main>
 
 {uid&&<div className={"call-inbox"+(tab==='chats'&&!activeGroupId&&selected?" call-visible":"")}><Calls userId={uid} peer={tab==='chats'&&!activeGroupId?selected?.id||null:null} peerName={selected?name(selected):''} lookupName={id=>name(profiles.find(p=>p.id===id))}/></div>}
 {gestureNotice&&<div className="v94-toast" role="status">{gestureNotice}</div>}{inspect&&<div role="presentation" onClick={()=>setInspect(null)} className="vexa102-backdrop"><div role="dialog" aria-modal="true" aria-label="Kişi profili" onClick={e=>e.stopPropagation()} className="vexa102-dialog"><Vexa102ProfileCard profile={inspect} selfId={uid!} isFriend={accepted.some(p=>p.id===inspect.id)} onClose={()=>setInspect(null)} onAdd={()=>void addFriend(inspect.id)} onMessage={()=>{setSelected(inspect);setTab('chats');setInspect(null)}}/></div></div>}

 {newChat&&<div className="vexa102-backdrop" onClick={()=>setNewChat(false)}><div className="vexa102-dialog vexa91-picker" role="dialog" aria-modal="true" aria-label="Yeni sohbet" onClick={e=>e.stopPropagation()}><div className="vexa91-inbox-head"><h2>Yeni sohbet</h2><button style={iconBtn} aria-label="Kapat" onClick={()=>setNewChat(false)}>✕</button></div><button className="vexa91-picker-action" onClick={()=>go('find')}><Search size={20}/> Kişi ara / arkadaş ekle</button><button className="vexa91-picker-action" onClick={()=>{setNewChat(false);setShowArchived(false);setGroupCreate(v=>v+1)}}><Users size={20}/> Yeni grup kur</button><input placeholder="Arkadaşlarında ara" aria-label="Arkadaşlarında ara" value={newChatSearch} onChange={e=>setNewChatSearch(e.target.value)}/><small className="hint">Arkadaşların</small>{accepted.filter(p=>name(p).toLocaleLowerCase('tr').includes(newChatSearch.toLocaleLowerCase('tr'))).map(p=><button key={p.id} className="contact" onClick={()=>{setNewChat(false);setShowArchived(false);setSelected(p);setActiveGroupId(null);setActiveGroup(null)}}><Avatar p={p}/><strong>{name(p)}</strong></button>)}{!accepted.length&&<p className="hint">Henüz arkadaşın yok.</p>}</div></div>}
 {updateDialog}
 </div>;
}
const iconBtn:CSSProperties={display:'grid',placeItems:'center',width:36,height:36,borderRadius:10,background:'transparent',color:'var(--muted)',flexShrink:0};
const subtleBtn:CSSProperties={padding:'10px 12px',borderRadius:11,background:'var(--panel2)',color:'var(--text)',textAlign:'left'};
const unreadStyle:CSSProperties={display:'inline-grid',placeItems:'center',minWidth:21,height:21,padding:'0 5px',borderRadius:20,background:'var(--accent)',color:'var(--accentText)',fontSize:11,fontWeight:800};
const popupStyle:CSSProperties={position:'absolute',right:8,top:48,zIndex:30,minWidth:205,padding:6,border:'1px solid var(--line)',borderRadius:13,background:'#213429',boxShadow:'0 12px 35px #0008'};
const popupButton:CSSProperties={display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 10px',textAlign:'left',background:'transparent',color:'var(--text)',borderRadius:8};
