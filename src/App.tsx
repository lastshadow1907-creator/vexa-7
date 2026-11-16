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
import Vexa11Hub from './Vexa11Hub';
import Vexa12Settings,{applyVexaTheme} from './Vexa12Settings';

type Tab='chats'|'find'|'requests'|'profile'|'statuses'|'vexa11';
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
 const [resetMode,setResetMode]=useState(false),[resetNotice,setResetNotice]=useState('');
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
 useEffect(()=>{if(!uid)return;try{const t=JSON.parse(localStorage.getItem('vexa12-theme-'+uid)||'{}');applyVexaTheme(t.color||'emerald',t.mode==='light'?'light':'dark');document.documentElement.dataset.vexaWallpaper=t.wallpaper||'none'}catch{applyVexaTheme('emerald','dark')}},[uid]);
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
 async function sendReset(){setResetNotice('');if(!email.includes('@')){setResetNotice('E-posta adresini yaz.');return}setBusy(true);const {error:e}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+window.location.pathname});setBusy(false);setResetNotice(e?e.message:'Bu adrese kayıtlı hesap varsa şifre sıfırlama bağlantısı gönderildi.')}
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
 if(!session)return <main className="auth"><div className="logo">Vexa<span>●</span></div><h1>{resetMode?'Şifremi unuttum':register?'Hesap oluştur':'Tekrar hoş geldin'}</h1><p>{resetMode?'Şifre sıfırlama bağlantısını e-postana gönderelim.':'Vexa hesabınla devam et.'}</p>{resetMode?<form onSubmit={e=>{e.preventDefault();void sendReset()}}><input type="email" placeholder="E-posta" value={email} onChange={e=>setEmail(e.target.value)} required/><button disabled={busy}>Sıfırlama bağlantısı gönder</button></form>:<form onSubmit={e=>{e.preventDefault();void auth()}}><input type="email" placeholder="E-posta" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Şifre" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/><button disabled={busy}>{register?'Kaydol':'Giriş yap'}</button></form>}<button className="link" onClick={()=>{setResetMode(false);setRegister(!register)}}>{register||resetMode?'Giriş yap':'Yeni hesap oluştur'}</button>{!register&&!resetMode&&<button className="link" onClick={()=>setResetMode(true)}>Şifremi unuttum</button>}{resetNotice&&<p role="status" className="hint">{resetNotice}</p>}{error&&<p className="error">{error}</p>}</main>;
 const nav=[{id:'chats',icon:MessageCircle,label:'Sohbetler'},{id:'statuses',icon:Camera,label:'Durumlar'},{id:'find',icon:Search,label:'Kişi Ara'},{id:'requests',icon:Users,label:'İstekler'},{id:'profile',icon:UserRound,label:'Profilim'},{id:'vexa11',icon:Settings,label:'Vexa 11'}] as const;
 const go=(t:Tab)=>{setTab(t);setSelected(null);setActiveGroupId(null);setActiveGroup(null);setError('');setMenuId(null)};
