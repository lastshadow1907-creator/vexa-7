import {VideoNote130,Sticker130} from './Media130';
import './vexa130.css';
import './media119.css';
import './chat114.css';
import {useLook,MediaAI,premiumAI} from './Vexa112';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Settings, Mic, Square, Send, CornerUpLeft, Pencil, Trash2, Smile, Pin, Download, X, Search, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Sticker, Star, Forward, Images, FileText } from 'lucide-react';
import { supabase } from './supabase';

type Msg = {
  effect?: string | null;
  id: number; sender_id: string; recipient_id: string; body: string | null;
  created_at: string; read_at: string | null; deleted_at: string | null; edited_at: string | null;
  media_path: string | null; media_type: string | null; reply_to_message_id?: number | null;
};
type Reaction = { message_id: number; user_id: string; emoji: string };
type CallRow = {id:string;caller_id:string;callee_id:string;kind:'audio'|'video';status:string;created_at:string;connected_at:string|null;ended_at:string|null;duration_seconds:number|null};
type TimelineItem = {type:'message';at:number;data:Msg}|{type:'call';at:number;data:CallRow};
const callDuration = (seconds:number) => {
  const s=Math.max(0,Math.floor(seconds));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

// Normalize browser MIME parameters without changing the encoded audio bytes.
const audioAliases: Record<string,string> = {
  'audio/x-m4a':'audio/mp4', 'audio/m4a':'audio/mp4', 'audio/x-wav':'audio/wav',
  'audio/wave':'audio/wav', 'audio/vnd.wave':'audio/wav', 'audio/mp3':'audio/mpeg',
  'audio/x-aac':'audio/aac', 'audio/x-flac':'audio/flac', 'audio/opus':'audio/ogg'
};
const audioExtensions: Record<string,string> = {
  webm:'audio/webm', m4a:'audio/mp4', ogg:'audio/ogg', oga:'audio/ogg', opus:'audio/ogg',
  mp3:'audio/mpeg', wav:'audio/wav', aac:'audio/aac', flac:'audio/flac', '3gp':'audio/3gpp', amr:'audio/amr'
};
function mediaMime(file: File) {
  const raw = file.type.split(';')[0].trim().toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return (!raw || raw === 'application/octet-stream') ? (audioExtensions[ext] || raw) : (audioAliases[raw] || raw);
}

async function voiceWav(blob:Blob):Promise<File>{
 const ctx=new AudioContext();
 try{
  const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
  const rate=16000, frames=Math.max(1,Math.round(decoded.duration*rate));
  if(frames*2+44>25*1024*1024)throw Error('Ses kaydı çok uzun.');
  const offline=new OfflineAudioContext(1,frames,rate), source=offline.createBufferSource();
  source.buffer=decoded;source.connect(offline.destination);source.start();
  const pcm=(await offline.startRendering()).getChannelData(0), buffer=new ArrayBuffer(44+pcm.length*2), view=new DataView(buffer);
  const str=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
  str(0,'RIFF');view.setUint32(4,36+pcm.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++){const v=Math.max(-1,Math.min(1,pcm[i]));view.setInt16(44+i*2,v<0?v*32768:v*32767,true)}
  return new File([buffer],'sesli-mesaj.wav',{type:'audio/wav'});
 }finally{await ctx.close().catch(()=>{})}
}

const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const time = (date: string) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export default function EnhancedChat({ userId, peerId, clearedAt, peerName }: { userId: string; peerId: string; clearedAt?: string|null; peerName?:string }) {
  const gesture=useRef<{x:number;y:number;timer:ReturnType<typeof setTimeout>}|null>(null);
  const suppress=useRef(0);
  const [attachments,setAttachments]=useState(false);
  const [media130,setMedia130]=useState<"video"|"sticker"|null>(null);
  const [chatTools,setChatTools]=useState(false);
  useEffect(()=>()=>{if(gesture.current)clearTimeout(gesture.current.timer)},[]);
  const plus=useLook(userId);
  const [summary,setSummary]=useState(''),[summaryBusy,setSummaryBusy]=useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [callRows,setCallRows]=useState<CallRow[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const themeKey=`vexa10-theme:${userId}:${peerId}`;
  const [theme,setTheme]=useState(()=>{try{return localStorage.getItem(themeKey)||'default'}catch{return 'default'}});
  const [showTheme,setShowTheme]=useState(false);
  const [effect,setEffect]=useState('');
  const [showEffects,setShowEffects]=useState(false);
  const [playingEffect,setPlayingEffect]=useState<{id:number;kind:string}|null>(null);
  useEffect(()=>{if(!playingEffect)return;const timer=setTimeout(()=>setPlayingEffect(null),3500);return()=>clearTimeout(timer)},[playingEffect]);
  const seenEffects=useRef(new Set<number>());
  const firstLoad=useRef(true);
  const signedCache=useRef(new Map<string,{url:string;until:number}>());
  const loadVersion=useRef(0);
  const [recordSeconds,setRecordSeconds]=useState(0);
  const recordClock=useRef({start:0,elapsed:0});
  const [levels,setLevels]=useState<number[]>(Array(20).fill(0.12));
  const [audioPreview,setAudioPreview]=useState('');
  const capture=useRef<{stream:MediaStream;ctx?:AudioContext;frame?:number;cancelled:boolean}|null>(null);
  const requesting=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const c=capture.current;if(c){c.cancelled=true;if(c.frame)cancelAnimationFrame(c.frame);c.stream.getTracks().forEach(t=>t.stop());void c.ctx?.close();if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();}}},[]);

  const [draft, setDraft] = useState('');
  const [aiPanel,setAiPanel]=useState<{text:string; incoming:boolean}|null>(null);
  const [aiResult,setAiResult]=useState(''); const [aiBusy,setAiBusy]=useState(false); const [aiError,setAiError]=useState('');
  function openAI(text:string,incoming=false){setAiResult('');setAiError('');setAiPanel({text,incoming});}
  async function askAI(task:string){if(!aiPanel||aiBusy)return;setAiBusy(true);setAiError('');setAiResult('');try{const {data,error}=await supabase.functions.invoke('vexa-gemini',{body:{messages:[{role:'user',content:task+'\nMetin:\n'+aiPanel.text.slice(0,3500)}]}});if(error||!data?.reply)throw Error(data?.error||'AI bağlantısı kurulamadı.');setAiResult(data.reply);}catch(e){setAiError((e as Error).message)}finally{setAiBusy(false)}}

  const [reply, setReply] = useState<Msg | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [file, setFile] = useState<File | null>(null);
  useEffect(()=>{if(!(file && mediaMime(file).startsWith('audio/'))){setAudioPreview('');return}const url=URL.createObjectURL(file);setAudioPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused,setPaused]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const typingSent=useRef(0);
  const sendLock=useRef(false);
  useEffect(()=>{if(!recording||paused)return;const timer=setInterval(()=>setRecordSeconds(Math.floor((recordClock.current.elapsed+performance.now()-recordClock.current.start)/1000)),200);return()=>clearInterval(timer)},[recording,paused]);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[]);
  function togglePause(){const r=recorder.current;if(r?.state==='recording'){r.pause();recordClock.current.elapsed+=performance.now()-recordClock.current.start;setPaused(true)}else if(r?.state==='paused'){r.resume();recordClock.current.start=performance.now();setPaused(false);void capture.current?.ctx?.resume().catch(()=>{})}}
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [pinned, setPinned] = useState(false);
  const [openActions, setOpenActions] = useState<number | null>(null);
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setChatTools(false);setAttachments(false)}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[]);
  useEffect(() => {
    if (openActions === null) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenActions(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openActions]);
  const [starred, setStarred] = useState<number[]>([]);
  const [showStarred, setShowStarred] = useState(false);
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [showGallery,setShowGallery]=useState(false);
  const [galleryFilter,setGalleryFilter]=useState<'all'|'image'|'video'|'document'>('all');
  const [showStickers,setShowStickers]=useState(false);
  const stickers=['❤️','💚','🥰','😂','🎉','🔥','😍','🤗','😎','💐','🐱','✨','💌','👍','🙌','💯'];
  const galleryItems=messages.filter(m=>!m.deleted_at && m.media_path && urls[m.media_path] && (galleryFilter==='all'||m.media_type===galleryFilter));
  async function sendSticker(sticker:string){
    setBusy(true);setError('');
    const {error:e}=await supabase.from('messages').insert({sender_id:userId,recipient_id:peerId,body:sticker,media_path:null,media_type:null});
    setBusy(false);setShowStickers(false);
    if(e)setError(e.message);else await load();
  }
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const currentChat = useRef('');
  currentChat.current = `${userId}:${peerId}`;

  const load = useCallback(async () => {
    const version=++loadVersion.current;
    const chatKey = `${userId}:${peerId}`;
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at,deleted_at,edited_at,media_path,media_type,reply_to_message_id,effect')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: false })
      .limit(250);
    if (currentChat.current !== chatKey || version!==loadVersion.current) return;
    if (loadError) { setError(loadError.message); return; }
    const rows = ((data || []) as Msg[]).reverse();
    if(!firstLoad.current){const fresh=rows.filter(m=>!seenEffects.current.has(m.id)&&!m.deleted_at&&m.effect&&['heart','confetti','spark','gold','aurora'].includes(m.effect));const last=fresh[fresh.length-1];if(last)setPlayingEffect({id:last.id,kind:last.effect!});}
    seenEffects.current=new Set(rows.map(m=>m.id));firstLoad.current=false;
    setMessages(rows);
    // Mark only messages belonging to the authenticated recipient, via a narrow RPC.
    if (document.visibilityState === 'visible' && currentChat.current === chatKey &&
        rows.some(m => m.sender_id === peerId && m.recipient_id === userId && !m.read_at && !m.deleted_at)) {
      const { error: readError } = await supabase.rpc('vexa_mark_chat_read', { p_peer: peerId });
      if (readError && currentChat.current === chatKey) {
        console.warn('Okundu işareti:', readError.message);
        setError('Okundu bilgisi güncellenemedi: ' + readError.message);
      }
    }
    const fav = await supabase.from('vexa8_starred_messages').select('message_id').eq('user_id',userId);
    if (!fav.error && currentChat.current === chatKey) setStarred((fav.data || []).map(x=>Number(x.message_id)));

    const ids = rows.map(m => m.id);
    if (ids.length) {
      const result = await supabase.from('vexa_message_reactions')
        .select('message_id,user_id,emoji').in('message_id', ids);
      if (currentChat.current !== chatKey || version!==loadVersion.current) return;
      setReactions(result.error ? [] : (result.data || []) as Reaction[]);
    } else setReactions([]);
    const paths = [...new Set(rows.map(m => m.media_path).filter((p): p is string => !!p))];
    for(const key of signedCache.current.keys())if(!paths.includes(key))signedCache.current.delete(key);
    const signed = await Promise.all(paths.map(async path => {
      const cached=signedCache.current.get(path);if(cached&&cached.until>Date.now())return [path,cached.url] as const;
      const { data: media } = await supabase.storage.from('vexa-media').createSignedUrl(path, 3600);
      if(media?.signedUrl)signedCache.current.set(path,{url:media.signedUrl,until:Date.now()+3300000});
      return [path, media?.signedUrl || ''] as const;
    }));
    if (currentChat.current === chatKey && version===loadVersion.current) setUrls(Object.fromEntries(signed));
  }, [userId, peerId]);

  useEffect(()=>{if(!playingEffect)return;const t=setTimeout(()=>setPlayingEffect(null),1700);return()=>clearTimeout(t)},[playingEffect]);
  const loadCalls = useCallback(async()=>{
    const {data,error:e}=await supabase.from('vexa_calls')
      .select('id,caller_id,callee_id,kind,status,created_at,connected_at,ended_at,duration_seconds')
      .or(`and(caller_id.eq.${userId},callee_id.eq.${peerId}),and(caller_id.eq.${peerId},callee_id.eq.${userId})`)
      .order('created_at',{ascending:false}).limit(100);
    if(!e)setCallRows((data||[]) as CallRow[]);
    else console.warn('Arama gecmisi:',e.message);
  },[userId,peerId]);

  useEffect(()=>{
    setCallRows([]);
    void loadCalls();
    // Mevcut arama altyapisi polling kullandigindan kayitlari da yenile.
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)void loadCalls()},10000);
    const onFocus=()=>{void loadCalls()};
    window.addEventListener('focus',onFocus);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[loadCalls]);

  useEffect(() => {
    setDraft(''); setReply(null); setEdit(null); setFile(null);
    setError(''); setChatSearch(''); setShowSearch(false); setOpenActions(null); setShowStarred(false);
    void load();
    let debounce:ReturnType<typeof setTimeout>|undefined;const refresh=()=>{clearTimeout(debounce);debounce=setTimeout(()=>void load(),120)};
    const channel = supabase.channel(`vexa-chat-${[userId, peerId].sort().join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vexa_message_reactions' }, refresh)
      .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
    window.addEventListener('online',refresh);
    let checking=false;let stopped=false;
    const check=async()=>{if(stopped||checking||!navigator.onLine||document.visibilityState!=='visible')return;checking=true;try{await load()}finally{checking=false}};
    const fallback=window.setInterval(()=>void check(),2500);
    const visible=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
    return () => { stopped=true;clearInterval(fallback);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);window.removeEventListener('online',refresh);clearTimeout(debounce);void supabase.removeChannel(channel); };
  }, [load, userId, peerId]);

  // Lightweight receipt refresh when Realtime misses an update.
  useEffect(() => {
    let active = true;
    let pending = false;
    const refreshReceipts = async () => {
      if (!active || pending || !navigator.onLine || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const { data, error } = await supabase.from('messages')
          .select('id,read_at').eq('sender_id',userId).eq('recipient_id',peerId)
          .order('created_at',{ascending:false}).limit(250);
        if (!active || error || !data) return;
        const receipts = new Map(data.map(m => [m.id,m.read_at]));
        setMessages(old => {
          if (!old.some(m => m.sender_id === userId && !m.read_at && receipts.get(m.id))) return old;
          return old.map(m => m.sender_id === userId && !m.read_at && receipts.get(m.id)
            ? {...m,read_at: receipts.get(m.id)!} : m);
        });
      } finally { pending = false; }
    };
    const timer = window.setInterval(() => void refreshReceipts(), 5000);
    window.addEventListener('online',refreshReceipts);
    document.addEventListener('visibilitychange',refreshReceipts);
    return () => { active=false; window.clearInterval(timer); window.removeEventListener('online',refreshReceipts); document.removeEventListener('visibilitychange',refreshReceipts); };
  }, [userId,peerId]);

  useEffect(() => {
    let active = true;
    const channel = supabase.channel(`vexa8-typing-${[userId,peerId].sort().join('-')}`);
    typingChannel.current = channel;
    channel.on('broadcast', { event: 'typing' }, ({payload}) => {
      if (!active || payload?.sender !== peerId) return;
      setPeerTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(()=>setPeerTyping(false), 2500);
    }).subscribe();
    return () => {active=false; typingChannel.current=null; if(typingTimer.current)clearTimeout(typingTimer.current); void supabase.removeChannel(channel);setPeerTyping(false);};
  },[userId,peerId]);

  async function toggleStar(m: Msg) {
    const exists = starred.includes(m.id);
    const q = exists ? await supabase.from('vexa8_starred_messages').delete().eq('user_id',userId).eq('message_id',m.id)
      : await supabase.from('vexa8_starred_messages').insert({user_id:userId,message_id:m.id});
    if(q.error)setError(q.error.message);
    else setStarred(v=>exists?v.filter(id=>id!==m.id):[...v,m.id]);
    setOpenActions(null);
  }

  async function forwardMessage() {
    if(!forwarding || !forwardTarget.trim())return;
    const target = forwardTarget.trim();
    if(target===userId){setError('Kendine iletemezsin.');return;}
    const {data:friend,error:friendError}=await supabase.from('friend_requests').select('id').eq('status','accepted').or(`and(sender_id.eq.${userId},recipient_id.eq.${target}),and(sender_id.eq.${target},recipient_id.eq.${userId})`).limit(1);
    if(friendError || !friend?.length){setError('Alıcıyla arkadaşlık doğrulanamadı. İletme yapılmadı.');return;}
    const {error:e}=await supabase.from('messages').insert({sender_id:userId,recipient_id:target,body:`↪ İletildi\n${forwarding.body||'Medya'}`,media_path:null,media_type:null});
    if(e)setError(e.message);else{setForwarding(null);setForwardTarget('');setOpenActions(null);}
  }

  // Kullanıcı sekmeye geri döndüğünde açık sohbeti tekrar okundu say.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.from('vexa_pinned_chats')
        .select('friend_id').eq('user_id', userId).eq('friend_id', peerId).maybeSingle();
      if (active) setPinned(!!data);
    })();
    return () => { active = false; };
  }, [userId, peerId]);

  useEffect(() => {
    if (!chatSearch) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, callRows.length, chatSearch]);

  async function send() {
    if (busy || recording || sendLock.current) return;
    if(!navigator.onLine){setError('İnternet bağlantısı yok. Mesajın korunuyor; bağlantı gelince tekrar gönder.');return;}
    const body = draft.trim();
    if (!body && !file) return;
    setBusy(true); setError('');
    sendLock.current=true;
    let uploadedPath: string | null = null;
    try {
      if (edit) {
        if (!body) throw new Error('Düzenlenen mesaj boş olamaz.');
        const { data: changed, error: e } = await supabase.from('messages')
          .update({ body, edited_at: new Date().toISOString() })
          .eq('id', edit.id).eq('sender_id', userId).is('deleted_at', null)
          .select('id');
        if (e) throw e;
        if (!changed?.length) throw new Error('Mesaj düzenlenemedi. Supabase UPDATE iznini ve mesaj sahibini kontrol et.');
        setEdit(null);
      } else {
        let mediaType: string | null = null;
        if (file) {
          if (file.size > 25 * 1024 * 1024) throw new Error('Dosya en fazla 25 MB olabilir.');
          const mime = mediaMime(file);
          const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm',
            'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/3gpp', 'audio/amr', 'application/pdf'];
          if (!allowed.includes(mime)) throw new Error(`Bu dosya türü desteklenmiyor: ${mime || 'bilinmiyor'}`);
          mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime==='application/pdf' ? 'document' : 'audio';
          const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
          uploadedPath = `${userId}/${file.name.startsWith("video-note.")?"vn130-":file.name==="sticker-note.png"?"st130-":""}${crypto.randomUUID()}.${ext}`;
          const { error: e } = await supabase.storage.from('vexa-media')
            .upload(uploadedPath, file, { contentType: mime });
          if (e) throw new Error(`Medya yüklenemedi (${mime}): ${e.message}`);
        }
        const text = body;
        const { error: e } = await supabase.from('messages').insert({
          sender_id: userId, recipient_id: peerId, body: text || null,
          media_path: uploadedPath, media_type: mediaType, reply_to_message_id: reply?.id ?? null, effect: (!plus?.premium&&['gold','aurora'].includes(effect))?null:effect||null
        });
        if (e) {
          if (uploadedPath) await supabase.storage.from('vexa-media').remove([uploadedPath]);
          throw e;
        }
        setReply(null); setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      setDraft('');setEffect('');setShowEffects(false);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { sendLock.current=false;setBusy(false); }
  }

  async function remove(m: Msg) {
    if (!window.confirm('Bu mesaj herkesten silinsin mi?')) return;
    setError('');
    const { data: changed, error: e } = await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', m.id).eq('sender_id', userId).is('deleted_at', null).select('id');
    if (e) setError(e.message);
    else if (!changed?.length) setError('Mesaj silinemedi. Supabase UPDATE iznini ve mesaj sahibini kontrol et.');
    else { setOpenActions(null); await load(); }
  }

  async function react(m: Msg, emoji: string) {
    setError('');
    const exists = reactions.some(r => r.message_id === m.id && r.user_id === userId && r.emoji === emoji);
    const result = exists
      ? await supabase.from('vexa_message_reactions').delete()
        .eq('message_id', m.id).eq('user_id', userId).eq('emoji', emoji)
      : await supabase.from('vexa_message_reactions').insert({ message_id: m.id, user_id: userId, emoji });
    if (result.error) {
      setError(`Emoji tepkisi kaydedilemedi: ${result.error.message}. Supabase tablo/RLS izni gerekebilir.`);
    } else { setOpenActions(null); await load(); }
  }

  async function togglePin() {
    const result = pinned
      ? await supabase.from('vexa_pinned_chats').delete().eq('user_id', userId).eq('friend_id', peerId)
      : await supabase.from('vexa_pinned_chats').insert({ user_id: userId, friend_id: peerId });
    if (result.error) setError(result.error.message);
    else setPinned(!pinned);
  }

  async function record() {
    if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.stop(); return; }
    if(requesting.current||recording)return;requesting.current=true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Bu tarayıcıda ses kaydı desteklenmiyor.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
      const c:{stream:MediaStream;ctx?:AudioContext;frame?:number;cancelled:boolean}={stream,cancelled:false};capture.current=c;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.current = rec; chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        const type = chunks.current.find(chunk=>chunk.type)?.type || rec.mimeType || mime || ''; 
        const blob = new Blob(chunks.current, { type });
        if(c.frame)cancelAnimationFrame(c.frame);void c.ctx?.close().catch(()=>{});
        stream.getTracks().forEach(t => t.stop());
        try{if(!c.cancelled&&blob.size){const wav=await voiceWav(blob);if(mounted.current&&!c.cancelled)setFile(wav)}else if(!c.cancelled&&mounted.current)setError('Ses kaydı boş. Tekrar deneyin.');}
        catch(e){if(mounted.current)setError('Ses kaydı hazırlanamadı: '+(e as Error).message)}
        finally{capture.current=null;recorder.current=null;if(mounted.current){setPaused(false);setRecording(false)}}
      };
      rec.start(); recordClock.current={start:performance.now(),elapsed:0};setRecordSeconds(0);setPaused(false);setLevels(Array(20).fill(.12));setRecording(true); setError('');
      try{const ctx=new AudioContext();c.ctx=ctx;void ctx.resume().catch(()=>{});const analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);const samples=new Uint8Array(analyser.fftSize);let prev=0;const draw=(now:number)=>{if(c.cancelled||rec.state==='inactive')return;if(rec.state==='recording'&&document.visibilityState==='visible'&&now-prev>100){prev=now;analyser.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((a,v)=>a+((v-128)/128)**2,0)/samples.length);setLevels(old=>[...old.slice(1),Math.min(1,Math.max(.12,rms*5))]);}c.frame=requestAnimationFrame(draw)};c.frame=requestAnimationFrame(draw)}catch{/* timer still works */}
    } catch (e) { capture.current?.stream.getTracks().forEach(t=>t.stop());capture.current=null;setError((e as Error).message); setRecording(false);setPaused(false); }finally{requesting.current=false;}
  }

  const visible = messages.filter(m => (!showStarred || starred.includes(m.id)) && (!clearedAt || new Date(m.created_at).getTime() > new Date(clearedAt).getTime()) && (!chatSearch.trim() ||
    (m.body || '').toLocaleLowerCase('tr-TR').includes(chatSearch.trim().toLocaleLowerCase('tr-TR'))));
  const timeline:TimelineItem[] = [
    ...visible.map((m):TimelineItem=>({type:'message',at:new Date(m.created_at).getTime(),data:m})),
    ...callRows.filter(c=>(!clearedAt || new Date(c.created_at).getTime()>new Date(clearedAt).getTime()) &&
      (!chatSearch.trim() || ['arama','gelen','giden','cevapsiz','sesli','goruntulu',peerName||'']
        .some(x=>x.toLocaleLowerCase('tr-TR').includes(chatSearch.trim().toLocaleLowerCase('tr-TR')))))
      .map((c):TimelineItem=>({type:'call',at:new Date(c.created_at).getTime(),data:c}))
  ].sort((a,b)=>a.at-b.at);


  return (
    <div className={`enhanced-chat v10-theme-${(['gold','aurora'].includes(theme)&&!plus?.premium)?'default':theme}`}>
      {playingEffect&&createPortal(<div className={`v10-effect v10-effect-${playingEffect.kind}`} aria-hidden="true" key={playingEffect.id}>{Array.from({length:22},(_,i)=><span key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${(i%7)*.09}s`}}>{playingEffect.kind==='heart'?'♥':playingEffect.kind==='confetti'?['●','◆','■'][i%3]:'✦'}</span>)}</div>,document.body)}
      {!online&&<div className="v101-offline" role="status">Bağlantı yok · internet gelince sohbet yenilenecek</div>}
      <div className="v114-chatbar"><button type="button" aria-label="Sohbette ara" onClick={()=>{setShowSearch(v=>!v);setChatSearch('')}}><Search size={17}/></button><button type="button" onClick={()=>setChatTools(true)}><Settings size={17}/> Sohbet araçları</button></div>
      {chatTools&&createPortal(<div className="v95-action-overlay" onClick={e=>{if(e.target===e.currentTarget)setChatTools(false)}}><section className="v95-action-sheet v114-tools" role="dialog" aria-modal="true" aria-label="Sohbet araçları"><header className="v95-action-header"><strong>Sohbet araçları</strong><button type="button" aria-label="Kapat" onClick={()=>setChatTools(false)}><X size={20}/></button></header><div className="v95-action-buttons" onClick={()=>setChatTools(false)}>
        <button type="button" onClick={() => setShowSearch(v => !v)} title="Sohbette ara">
          <Search size={16} /> Ara
        </button>
        <button type="button" onClick={() => void togglePin()} title="Sohbeti sabitle">
          <Pin size={16} /> {pinned ? 'Sabitlendi' : 'Sabitle'}
        </button>
        <button type="button" onClick={()=>setShowStarred(v=>!v)} title="Yıldızlı mesajlar"><Star size={16}/>{showStarred?' Tümü':' Yıldızlı'}</button>
        <button type="button" onClick={()=>setShowGallery(v=>!v)} title="Medya galerisi"><Images size={16}/> Medya</button>
        <button type="button" onClick={()=>setShowTheme(v=>!v)}>◉ Tema</button>{plus?.premium&&<button type="button" disabled={summaryBusy} onClick={()=>{if(!confirm('Son 30 mesajın metni Google Gemini’ye gönderilecek. Devam edilsin mi?'))return;setSummaryBusy(true);void premiumAI('summary',messages.filter(m=>!m.deleted_at&&m.body).slice(-30).map(m=>(m.sender_id===userId?'Ben: ':'Arkadaş: ')+m.body).join('\n').slice(-3900)).then(setSummary).catch(e=>setSummary(e.message)).finally(()=>setSummaryBusy(false))}}>♛ {summaryBusy?'Özetleniyor…':'Sohbet özeti'}</button>}
      </div></section></div>,document.body)}
      {summary&&<div className="v112-panel"><button onClick={()=>setSummary('')}>Kapat</button><p>{summary}</p></div>}{showTheme&&<div className="v10-theme-picker">{[['default','Vexa'],['ocean','Okyanus'],['rose','Gül'],['violet','Gece'],['sand','Kum'],...(plus?.premium?[['gold','♛ Altın'],['aurora','♛ Aurora']]:[])].map(([id,label])=><button key={id} type="button" aria-pressed={theme===id} onClick={()=>{setTheme(id);try{localStorage.setItem(themeKey,id)}catch{}setShowTheme(false)}} className={`v10-swatch-${id}`}>{label}</button>)}</div>}
      {showGallery && <section className="vexa-media-gallery" aria-label="Sohbet medyası">
        <div className="vexa-gallery-heading"><strong>Paylaşılan medya</strong><button type="button" onClick={()=>setShowGallery(false)} aria-label="Galeriyi kapat"><X size={17}/></button></div>
        <div className="vexa-gallery-filters">{(['all','image','video','document'] as const).map(t=><button key={t} type="button" className={galleryFilter===t?'active':''} onClick={()=>setGalleryFilter(t)}>{({all:'Tümü',image:'Fotoğraf',video:'Video',document:'PDF'} as const)[t]}</button>)}</div>
        <div className="vexa-gallery-grid">{galleryItems.map(m=><a key={m.id} href={urls[m.media_path!]} target="_blank" rel="noopener noreferrer" title={new Date(m.created_at).toLocaleString('tr-TR')}>{m.media_type==='image'?<img src={urls[m.media_path!]} alt="Paylaşılan fotoğraf" loading="lazy"/>:m.media_type==='video'?<span>▶ Video</span>:<span><FileText size={22}/> PDF</span>}</a>)}{!galleryItems.length&&<p>Bu kategoride medya yok.</p>}</div>
      </section>}
      {peerTyping && <div className="vexa8-typing" role="status">{peerName||'Kişi'} yazıyor…</div>}
      {showSearch && <div className="enhanced-preview">
        <input aria-label="Sohbette ara" placeholder="Mesajlarda ara..." value={chatSearch}
          onChange={e => setChatSearch(e.target.value)} />
        <button type="button" onClick={() => { setChatSearch(''); setShowSearch(false); }} title="Aramayı kapat"><X size={17} /></button>
      </div>}
      <div className="message-list enhanced-list">
        {timeline.map(item => {
          if(item.type==='call'){
            const c=item.data;
            const outgoing=c.caller_id===userId;
            const answered=!!c.connected_at;
            const pending=!answered && ['ringing','accepted'].includes(c.status) && !c.ended_at && Date.now()-new Date(c.created_at).getTime()<90000;
            const ongoing=answered&&!c.ended_at;
            const missed=!answered&&!pending;
            const Icon=missed?PhoneMissed:outgoing?PhoneOutgoing:PhoneIncoming;
            const label=outgoing?'Sen aradın':`${peerName||'Karşı taraf'} aradı`;
            const result=pending?'Aranıyor…':ongoing?'Görüşme sürüyor':answered?`Görüşme · ${callDuration(c.duration_seconds??(c.ended_at?Math.max(0,(new Date(c.ended_at).getTime()-new Date(c.connected_at!).getTime())/1000):0))}`:'Cevapsız arama';
            return <div key={`call-${c.id}`} className={`vexa16-call-event ${missed?'missed':answered?'answered':'pending'}`}>
              <span className="vexa16-call-icon"><Icon size={20}/></span>
              <div className="vexa16-call-copy"><strong>{c.kind==='video'?'Görüntülü':'Sesli'} arama</strong><small>{label} · {result}</small></div>
              {c.kind==='video'&&<Video size={14} className="vexa16-call-video"/>}
              <time>{time(c.created_at)}</time>
            </div>;
          }
          const m=item.data;
          const mine = m.sender_id === userId;
          const deleted = !!m.deleted_at;
          const rs = reactions.filter(r => r.message_id === m.id);
          return <div className={`message ${mine ? 'mine' : ''}`} key={m.id} onTouchStart={e=>{if(deleted|| (e.target as HTMLElement).closest("button,a,video,audio"))return;if(gesture.current)clearTimeout(gesture.current.timer);const t=e.touches[0];gesture.current={x:t.clientX,y:t.clientY,timer:setTimeout(()=>{suppress.current=Date.now()+1000;setOpenActions(m.id)},500)}}} onTouchMove={e=>{const g=gesture.current;if(g){const dx=e.touches[0].clientX-g.x,dy=e.touches[0].clientY-g.y;if(Math.abs(dx)>12||Math.abs(dy)>12)clearTimeout(g.timer);if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){gesture.current=null;e.currentTarget.style.removeProperty("--reply-drag");e.currentTarget.style.removeProperty("--reply-opacity");return}if(dx>0){e.currentTarget.style.setProperty("--reply-drag",`${Math.min(88,dx)}px`);e.currentTarget.style.setProperty("--reply-opacity",String(Math.min(1,dx/55)))}else{e.currentTarget.style.removeProperty("--reply-drag");e.currentTarget.style.removeProperty("--reply-opacity")}}}} onTouchCancel={e=>{e.currentTarget.style.removeProperty("--reply-drag");e.currentTarget.style.removeProperty("--reply-opacity");if(gesture.current)clearTimeout(gesture.current.timer);gesture.current=null}} onTouchEnd={e=>{const g=gesture.current;gesture.current=null;e.currentTarget.style.removeProperty("--reply-drag");e.currentTarget.style.removeProperty("--reply-opacity");if(!g)return;clearTimeout(g.timer);if(e.changedTouches[0].clientX-g.x>70&&Math.abs(e.changedTouches[0].clientY-g.y)<40){suppress.current=Date.now()+500;setReply(m);setEdit(null);setOpenActions(null)}}} onContextMenu={e => { e.preventDefault(); if (!deleted) setOpenActions(openActions === m.id ? null : m.id); }}>
            <span className="v94-reply-reveal" aria-hidden="true">↩</span><div className="message-body" tabIndex={deleted?-1:0} aria-label={deleted?undefined:"Mesaj işlemleri için Enter veya uzun bas"} onKeyDown={e=>{if(!deleted&&e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setOpenActions(m.id)}}} onClick={e => { if (Date.now()>suppress.current && !deleted && !(e.target as HTMLElement).closest("button,a,video,audio")) setOpenActions(openActions === m.id ? null : m.id); }}>
              {deleted ? <i>Bu mesaj silindi</i> : <>
                {m.reply_to_message_id && <div className="vexa8-reply-quote">↳ {messages.find(x=>x.id===m.reply_to_message_id)?.body?.slice(0,110)||'Yanıtlanan mesaj'}</div>}
                {m.body && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>}
                {m.media_path && !urls[m.media_path] && <small>Medya yükleniyor veya erişim izni yok.</small>}
                {m.media_path && urls[m.media_path] && (m.media_type === 'image'
                  ? <img className="enhanced-media" src={urls[m.media_path]} alt="Gönderilen fotoğraf" loading="lazy" decoding="async" />
                  : m.media_type === 'video'
                    ? <video className={"enhanced-media "+(m.media_path.includes("/vn130-")?"v130-note":"")} controls playsInline src={urls[m.media_path]} />
                    : m.media_type === 'document'
                      ? <a href={urls[m.media_path]} target="_blank" rel="noopener noreferrer" className="vexa-document"><FileText size={18}/> PDF dosyasını aç</a>
                      : <VoicePlayer src={urls[m.media_path]} />)}
              </>}
            </div>
            <time>{time(m.created_at)}{m.edited_at ? ' · düzenlendi' : ''}{mine&&!deleted ? <span title={m.read_at?'Görüldü':'Gönderildi'} style={{marginLeft:6,color:m.read_at?'var(--accent)':'var(--muted)'}}>{m.read_at?'✓✓':'✓'}</span>:null}</time>
            {!deleted && <>
              {starred.includes(m.id)&&<Star size={12} className="vexa8-star-mark" fill="currentColor"/>}
              <div className="enhanced-reactions" hidden={!rs.length}>
                {rs.map((r, i) => <button type="button" key={`${r.user_id}-${r.emoji}-${i}`}
                  className={r.user_id === userId ? 'own' : ''}
                  title={r.user_id === userId ? 'Tepkini kaldır' : 'Aynı tepkiyi gönder'}
                  onClick={() => void react(m, r.emoji)}>{r.emoji}</button>)}
              </div>
              <div className="enhanced-actions">
                {openActions === m.id && createPortal(
                  <div className="v95-action-overlay" onClick={e => { e.stopPropagation(); if(e.target===e.currentTarget) setOpenActions(null); }} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} onTouchCancel={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}>
                    <section className="v95-action-sheet" role="dialog" aria-modal="true" aria-label="Mesaj işlemleri">
                      <header className="v95-action-header"><strong>Mesaj işlemleri</strong><button type="button" aria-label="Kapat" onClick={()=>setOpenActions(null)}><X size={20}/></button></header>
                      <div className="v95-action-preview">{m.body || 'Medya mesajı'}</div>
                      <div className="v95-reaction-label"><Smile size={16}/> Tepki ver</div>
                  <div className="enhanced-emoji">
                    {emojis.map(e => <button type="button" key={e} aria-label={`${e} tepkisi`} aria-pressed={rs.some(r => r.user_id === userId && r.emoji === e)}
                      onClick={() => void react(m, e)}>{e}</button>)}
                  </div>
                      <div className="v95-action-buttons">
                {m.effect&&['heart','confetti','spark','gold','aurora'].includes(m.effect)&&<button type="button" className="v10-replay" onClick={e=>{e.stopPropagation();setPlayingEffect({id:m.id,kind:m.effect!})}}>✦ Efekti oynat</button>}
                {plus?.premium&&m.media_path&&urls[m.media_path]&&(m.media_type==='image'||m.media_type==='audio')&&<MediaAI url={urls[m.media_path]} kind={m.media_type}/>}
                {m.media_path && urls[m.media_path] && <a href={urls[m.media_path]} target="_blank"
                  rel="noopener noreferrer" className="enhanced-download"><Download size={13} /> Dosyayı aç</a>}
                  {m.body&&<button type="button" onClick={()=>{openAI(m.body!,!mine);setOpenActions(null)}}>✦ Vexa AI</button>}
                  <button type="button" onClick={() => { setReply(m); setEdit(null); setOpenActions(null); }}>
                    <CornerUpLeft size={14} /> Yanıtla
                  </button>
                  {m.body&&<button type="button" onClick={()=>{void navigator.clipboard.writeText(m.body!).then(()=>setOpenActions(null)).catch(()=>setError("Mesaj kopyalanamadı."))}}>Kopyala</button>}<button type="button" onClick={()=>void toggleStar(m)}><Star size={14}/>{starred.includes(m.id)?'Yıldızı kaldır':'Yıldızla'}</button>
                  <button type="button" onClick={()=>{setForwarding(m);setOpenActions(null);}}><Forward size={14}/> İlet</button>
                  {mine && <>
                    <button type="button" onClick={() => { setEdit(m); setReply(null); setDraft(m.body || ''); setOpenActions(null); }}>
                      <Pencil size={14} /> Düzenle
                    </button>
                    <button type="button" onClick={() => void remove(m)}><Trash2 size={14} /> Sil</button>
                  </>}
                      </div>
                      {error && <div className="enhanced-error" role="alert">{error}</div>}
                    </section>
                  </div>, document.body)}
              </div>
            </>}
          </div>;
        })}
        {showSearch && chatSearch && timeline.length === 0 && <div className="enhanced-preview">Eşleşen mesaj bulunamadı.</div>}
        <div ref={bottom} />
      </div>
      {forwarding && <div className="vexa8-forward-box"><span>İletilecek: {forwarding.body?.slice(0,60)||'Medya'}</span><input aria-label="Alıcı kullanıcı kimliği" placeholder="Arkadaşın kullanıcı UUID'si" value={forwardTarget} onChange={e=>setForwardTarget(e.target.value)}/><button type="button" onClick={()=>void forwardMessage()}>İlet</button><button type="button" onClick={()=>setForwarding(null)}>İptal</button></div>}
      {(reply || edit || file) && <div className="enhanced-preview">
        <span>{edit ? 'Düzenleniyor: ' : reply ? 'Yanıt: ' : 'Ek: '}
          {edit?.body || reply?.body || file?.name || 'Medya'}</span>
        <button type="button" title="İptal" onClick={() => {
          setReply(null); setEdit(null); setFile(null); setDraft('');
          if (fileRef.current) fileRef.current.value = '';
        }}><X size={17} /></button>
      </div>}
      {error && <div className="enhanced-error" role="alert">{error}</div>}
      {showStickers&&<div className="vexa-sticker-picker" aria-label="Çıkartmalar">{stickers.map(st=><button type="button" key={st} onClick={()=>void sendSticker(st)} disabled={busy} aria-label={`${st} çıkartması`}>{st}</button>)}</div>}
      {media130&&createPortal(<div className="v95-action-overlay"><section className="v95-action-sheet">{media130==="video"?<VideoNote130 onClose={()=>setMedia130(null)} onFile={f=>{setEdit(null);setFile(f);setMedia130(null)}}/>:<Sticker130 onClose={()=>setMedia130(null)} onFile={f=>{setEdit(null);setFile(f);setMedia130(null)}}/>}</section></div>,document.body)}{attachments&&createPortal(<div className="v95-action-overlay" onClick={e=>{if(e.target===e.currentTarget)setAttachments(false)}}><section className="v95-action-sheet v114-tools" role="dialog" aria-modal="true" aria-label="Mesaj araçları"><header className="v95-action-header"><strong>Mesaj araçları</strong><button type="button" aria-label="Kapat" onClick={()=>setAttachments(false)}><X size={20}/></button></header><div className="v95-action-buttons"><button type="button" disabled={recording||busy} onClick={()=>{setAttachments(false);setMedia130("video")}}><Video size={18}/> Video notu</button><button type="button" disabled={recording||busy} onClick={()=>{setAttachments(false);setMedia130("sticker")}}><Sticker size={18}/> Sticker Studio</button><button type="button" onClick={()=>{setAttachments(false);fileRef.current?.click()}}><Images size={18}/> Fotoğraf, video veya dosya</button><button type="button" onClick={()=>{setAttachments(false);setShowStickers(v=>!v)}}><Smile size={18}/> Çıkartmalar</button><button type="button" disabled={recording||aiBusy} onClick={()=>{setAttachments(false);openAI(draft)}}>✦ Vexa AI</button><button type="button" disabled={!!edit||recording} onClick={()=>{setAttachments(false);setShowEffects(v=>!v)}}>✦ Mesaj efekti</button></div></section></div>,document.body)}
      {recording&&<div className="v10-record" role="status"><span>{paused?'Duraklatıldı':'● Kayıt'} {callDuration(recordSeconds)}</span><div className="v10-wave">{levels.map((v,i)=><i key={i} style={{height:`${v*100}%`}}/>)}</div><button type="button" onClick={togglePause}>{paused?'Devam':'Duraklat'}</button><button type="button" onClick={()=>void record()}>Dinle</button><button type="button" onClick={()=>{if(capture.current)capture.current.cancelled=true;recorder.current?.stop()}}>İptal</button></div>}
      {file&&!file.type.startsWith("audio/")&&<div className="v130-file">{file.name}<button type="button" onClick={()=>setFile(null)}>Kaldır</button></div>}{audioPreview&&!recording&&<div className="v10-preview"><VoicePlayer src={audioPreview}/><button type="button" onClick={()=>setFile(null)}>Kaydı sil</button></div>}
      {showEffects&&<div className="v10-theme-picker">{[['','Normal'],['heart','♥ Kalpler'],['confetti','🎉 Konfeti'],['spark','✦ Işıltı'],...(plus?.premium?[['gold','♛ Altın yağmuru'],['aurora','♛ Aurora']]:[])].map(([id,label])=><button key={id} type="button" aria-pressed={effect===id} onClick={()=>{setEffect(id);setShowEffects(false)}}>{label}</button>)}</div>}
      {aiPanel&&createPortal(<div className="v95-action-overlay" onClick={e=>{if(e.target===e.currentTarget&&!aiBusy)setAiPanel(null)}}><section className="v95-action-sheet" role="dialog" aria-modal="true" aria-label="Vexa AI"><header className="v95-action-header"><strong>✦ Vexa AI</strong><button type="button" disabled={aiBusy} onClick={()=>setAiPanel(null)}><X size={20}/></button></header><p>Seçtiğin metin Google Gemini'ye gönderilir. Hassas bilgi paylaşma.</p><textarea aria-label="AI metni" value={aiPanel.text} maxLength={3500} disabled={aiBusy} onChange={e=>setAiPanel({...aiPanel,text:e.target.value})} rows={3} style={{width:'100%',boxSizing:'border-box'}}/><div className="v95-action-buttons">{(aiPanel.incoming?['Bu mesaja doğal bir cevap öner','Türkçeye çevir','İngilizceye çevir']:['Yazım hatalarını düzelt','Samimi bir mesaj yaz','Romantik bir mesaj yaz','Resmi bir mesaj yaz','Türkçeye çevir','İngilizceye çevir']).map(task=><button type="button" key={task} disabled={aiBusy||!aiPanel.text.trim()} onClick={()=>void askAI(task)}>{task}</button>)}</div>{aiBusy&&<p>Yanıt hazırlanıyor…</p>}{aiError&&<p role="alert">{aiError}</p>}{aiResult&&<><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{aiResult}</div><button type="button" onClick={()=>{setEdit(null);setDraft(aiResult);setAiPanel(null)}}>Mesaj alanına ekle</button></>}</section></div>,document.body)}
      <form className="composer enhanced-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/webm,audio/*,application/pdf"
          onChange={e => setFile(e.target.files?.[0] || null)} />
        
        <button className="v114-add" type="button" title="Mesaj araçları" aria-label="Mesaj araçları" aria-expanded={attachments} onClick={()=>setAttachments(v=>!v)}><Plus size={22}/>{effect&&<i/>}</button>
        <input value={draft} onChange={e => {setDraft(e.target.value); if(e.target.value.trim()&&Date.now()-typingSent.current>900){typingSent.current=Date.now();void typingChannel.current?.send({type:'broadcast',event:'typing',payload:{sender:userId}});}}}
          placeholder={recording ? 'Ses kaydediliyor...' : edit ? 'Mesajı düzenle…' : 'Mesaj yaz…'} />
        {!recording&&(draft.trim()||file||edit) ? <button type="submit" disabled={busy||recording||(!draft.trim()&&!file)} title="Gönder" aria-label="Gönder"><Send size={20}/></button> : <button type="button" title={recording?'Kaydı bitir':'Ses kaydı'} aria-label={recording?'Kaydı bitir':'Ses kaydı'} onClick={()=>void record()}>{recording?<Square size={19}/>:<Mic size={20}/>}</button>}

      </form>
    </div>
  );
}

function VoicePlayer({src}:{src:string}){
 const ref=useRef<HTMLAudioElement>(null);const [speed,setSpeed]=useState(1),[duration,setDuration]=useState(0),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setDuration(0);setPosition(0);setPlaying(false);setError('')},[src]);
 const sync=()=>{const a=ref.current;if(a){setDuration(Number.isFinite(a.duration)?a.duration:0);setPosition(a.currentTime)}};
 return <div className="v119-voice"><audio ref={ref} preload="metadata" src={src} onLoadedMetadata={()=>{sync();if(ref.current)ref.current.playbackRate=speed}} onDurationChange={sync} onTimeUpdate={sync} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setError('Ses açılamadı. Bağlantıyı veya dosya biçimini kontrol et.')}/><div className="v119-voice-row"><button type="button" aria-label={playing?'Duraklat':'Oynat'} onClick={()=>{const a=ref.current;if(!a)return;if(playing)a.pause();else{setError('');void a.play().catch(()=>setError('Ses oynatılamadı. Tekrar dene.'))}}}>{playing?'Ⅱ':'▶'}</button><div className="v119-voice-track"><input aria-label="Ses konumu" type="range" min={0} max={duration||1} step={.1} value={Math.min(position,duration)} disabled={!duration} onChange={e=>{if(ref.current)ref.current.currentTime=Number(e.target.value);setPosition(Number(e.target.value))}}/><small>{callDuration(position)} / {duration?callDuration(Math.ceil(duration)):'--:--'}</small></div><button type="button" aria-label="Oynatma hızı" onClick={()=>{const next=speed===1?1.5:speed===1.5?2:1;setSpeed(next);if(ref.current)ref.current.playbackRate=next}}>{speed}×</button></div>{error&&<small role="alert">{error}</small>}</div>
}
