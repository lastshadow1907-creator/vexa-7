import {useCallback,useEffect,useMemo,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Session} from '@supabase/supabase-js';
import {MessageCircle,Users,Search,UserRound,ArrowLeft,LogOut,Settings,Share2,Pin,Archive,ArchiveRestore,MoreVertical,Camera,RefreshCw,Trash2,PhoneCall} from 'lucide-react';
import {supabase,configured} from './supabase';
import Calls from './Calls';
import EnhancedChat from './EnhancedChat';
import Groups from './Groups';
import Statuses from './Statuses';
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

type Tab='chats'|'find'|'requests'|'profile'|'statuses'|'vexa11'|'calls14'|'ai';
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
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState(''),[register,setRegister]=useState(false);
 const [resetMode,setResetMode]=useState(false),[resetNotice,setResetNotice]=useState('');
 const [tab,setTab]=useState<Tab>('chats'),[friends,setFriends]=useState<FriendRequest[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
 const [selected,setSelected]=useState<Profile|null>(null),[inspect,setInspect]=useState<Profile|null>(null);
 const [activeGroupId,setActiveGroupId]=useState<string|null>(null);
 const [activeGroup,setActiveGroup]=useState<{id:string;title:string;created_by:string;avatar_url?:string|null;description?:string|null}|null>(null);
 const [search,setSearch]=useState(''),[results,setResults]=useState<Profile[]>([]),[chatSearch,setChatSearch]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[chatRows,setChatRows]=useState<ChatRow[]>([]);
 const [displayName,setDisplayName]=useState(''),[bio,setBio]=useState(''),[avatarUrl,setAvatarUrl]=useState(''),[coverUrl,setCoverUrl]=useState(''),[saveNotice,setSaveNotice]=useState('');
 const [clearAt,setClearAt]=useState<Record<string,string>>({});
 const [lastRead,setLastRead]=useState<Record<string,string>>({});
 const [archived,setArchived]=useState<string[]>([]),[pinned,setPinned]=useState<string[]>([]),[showArchived,setShowArchived]=useState(false),[menuId,setMenuId]=useState<string|null>(null);
 const uid=session?.user.id;
 useVexaPresenceHeartbeat(uid);
 useEffect(()=>{if(!uid)return;try{const t=JSON.parse(localStorage.getItem('vexa12-theme-'+uid)||'{}');applyVexaTheme(t.color||'emerald',t.mode==='light'?'light':'dark');document.documentElement.dataset.vexaWallpaper=t.wallpaper||'none'}catch{applyVexaTheme('emerald','dark')}},[uid]);
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
