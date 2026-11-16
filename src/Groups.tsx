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

export default function Groups({userId,profiles}:{userId:string;profiles:Profile[]}){
 const [groups,setGroups]=useState<Group[]>([]);
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
 const selectedId=selected?.id;
 const me=members.find(m=>m.user_id===userId);
 const admin=!!selected&&(selected.created_by===userId||me?.role==='admin');
 const owner=selected?.created_by===userId;
 const people=useMemo(()=>profiles.filter(p=>p.id!==userId&&!members.some(m=>m.user_id===p.id)&&display(p).toLocaleLowerCase('tr-TR').includes(find.toLocaleLowerCase('tr-TR'))).slice(0,50),[profiles,members,find,userId]);
 const person=(id:string)=>display(profiles.find(p=>p.id===id));
 const clearMessages=()=>{setError('');setNotice('')};

 const loadGroups=useCallback(async()=>{
  const {data,error:e}=await supabase.from('vexa_group_members').select('group_id,group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);
  if(e){setError(e.message);return}
  const list=(data||[]).flatMap((r:any)=>r.group?[r.group as Group]:[]);
  setGroups(list);
  setSelected(prev=>prev?list.find(g=>g.id===prev.id)||null:null);
 },[userId]);
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
  const c=supabase.channel(`vexa8-group-${selectedId}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_messages',filter:`group_id=eq.${selectedId}`},()=>void loadMessages())
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_group_members',filter:`group_id=eq.${selectedId}`},()=>{void loadMembers();void loadGroups()})
   .on('postgres_changes',{event:'*',schema:'public',table:'vexa_groups',filter:`id=eq.${selectedId}`},()=>void loadGroups())
   .subscribe();
  return()=>{void supabase.removeChannel(c)};
 },[selectedId,loadGroups,loadMessages,loadMembers]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages.length,selectedId]);
 useEffect(()=>{if(selected){setTitle(selected.title);setDescription(selected.description||'');setAvatarUrl(selected.avatar_url||'')}},[selectedId]);

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
  if(ok){setCreating(false);setTitle('');const {data}=await supabase.from('vexa_group_members').select('group:vexa_groups(id,title,created_by,avatar_url,description)').eq('user_id',userId);const match=(data||[]).map((r:any)=>r.group as Group).find(g=>g?.title===newTitle&&g.created_by===userId);if(match){setSelected(match);setSettings(false)}await loadGroups()}
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
