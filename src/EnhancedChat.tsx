import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Mic, Square, Send, CornerUpLeft, Pencil, Trash2, Smile, Pin, Download, X, Search, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Star, Forward, Sticker, ImagePlay } from 'lucide-react';
import { supabase } from './supabase';

type Msg = {
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

const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const time = (date: string) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export default function EnhancedChat({ userId, peerId, clearedAt, peerName }: { userId: string; peerId: string; clearedAt?: string|null; peerName?:string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [callRows,setCallRows]=useState<CallRow[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<Msg | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [pinned, setPinned] = useState(false);
  const [openActions, setOpenActions] = useState<number | null>(null);
  const [starred, setStarred] = useState<number[]>([]);
  const [showStarred, setShowStarred] = useState(false);
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [showStickers,setShowStickers]=useState(false);
  const [stickerBusy,setStickerBusy]=useState(false);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const currentChat = useRef('');
  currentChat.current = `${userId}:${peerId}`;

  const load = useCallback(async () => {
    const chatKey = `${userId}:${peerId}`;
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at,deleted_at,edited_at,media_path,media_type,reply_to_message_id')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: true })
      .limit(250);
    if (currentChat.current !== chatKey) return;
    if (loadError) { setError(loadError.message); return; }
    const rows = (data || []) as Msg[];
    setMessages(rows);
    const fav = await supabase.from('vexa8_starred_messages').select('message_id').eq('user_id',userId);
    if (!fav.error && currentChat.current === chatKey) setStarred((fav.data || []).map(x=>Number(x.message_id)));
    // Yalnızca gerçekten okunmamış gelen mesajları işaretle.
    // Gizli okundu bilgisi tercihi açık olsa da yerel okunmamış sayacı
    // App.tsx içindeki sohbet-açıldı işaretiyle ayrıca sıfırlanır.
    if (document.visibilityState === 'visible' &&
        rows.some(m => m.sender_id === peerId && m.recipient_id === userId && !m.read_at)) {
      const { data: privacy } = await supabase.from('vexa101_privacy')
        .select('read_receipts').eq('user_id', userId).maybeSingle();
      if (privacy?.read_receipts !== false && currentChat.current === chatKey) {
        const { error: readError } = await supabase.from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('sender_id', peerId).eq('recipient_id', userId).is('read_at', null);
        if (readError) console.warn('Okundu işareti:', readError.message);
      }
    }

    const ids = rows.map(m => m.id);
    if (ids.length) {
      const result = await supabase.from('vexa_message_reactions')
        .select('message_id,user_id,emoji').in('message_id', ids);
      if (currentChat.current !== chatKey) return;
      setReactions(result.error ? [] : (result.data || []) as Reaction[]);
    } else setReactions([]);
    const paths = [...new Set(rows.map(m => m.media_path).filter((p): p is string => !!p))];
    const signed = await Promise.all(paths.map(async path => {
      const { data: media } = await supabase.storage.from('vexa-media').createSignedUrl(path, 3600);
      return [path, media?.signedUrl || ''] as const;
    }));
    if (currentChat.current === chatKey) setUrls(Object.fromEntries(signed));
  }, [userId, peerId]);

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
    const timer=window.setInterval(()=>{void loadCalls()},5000);
    const onFocus=()=>{void loadCalls()};
    window.addEventListener('focus',onFocus);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[loadCalls]);

  useEffect(() => {
    setDraft(''); setReply(null); setEdit(null); setFile(null);
    setError(''); setChatSearch(''); setShowSearch(false); setOpenActions(null); setShowStarred(false);
    void load();
    const channel = supabase.channel(`vexa-chat-${[userId, peerId].sort().join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vexa_message_reactions' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, userId, peerId]);

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

  async function sendSticker(emoji:string){
    if(stickerBusy)return;
    setStickerBusy(true);setError('');
    try{
      const {error:e}=await supabase.from('messages').insert({sender_id:userId,recipient_id:peerId,body:`[vexa-sticker]${emoji}`,reply_to_message_id:reply?.id??null});
      if(e)throw e;
      setShowStickers(false);setReply(null);await load();
    }catch(e){setError((e as Error).message)}finally{setStickerBusy(false)}
  }

  async function send() {
    if (busy) return;
    const body = draft.trim();
    if (!body && !file) return;
    setBusy(true); setError('');
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
          const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm',
            'audio/mp4', 'audio/ogg', 'audio/mpeg'];
          if (!allowed.includes(file.type)) throw new Error('Bu dosya türü desteklenmiyor.');
          mediaType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
          const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
          uploadedPath = `${userId}/${crypto.randomUUID()}.${ext}`;
          const { error: e } = await supabase.storage.from('vexa-media')
            .upload(uploadedPath, file, { contentType: file.type });
          if (e) throw e;
        }
        const text = body;
        const { error: e } = await supabase.from('messages').insert({
          sender_id: userId, recipient_id: peerId, body: text || null,
          media_path: uploadedPath, media_type: mediaType, reply_to_message_id: reply?.id ?? null
        });
        if (e) {
          if (uploadedPath) await supabase.storage.from('vexa-media').remove([uploadedPath]);
          throw e;
        }
        setReply(null); setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      setDraft('');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
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
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Bu tarayıcıda ses kaydı desteklenmiyor.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.current = rec; chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setFile(new File([blob], `sesli-mesaj.${ext}`, { type }));
        stream.getTracks().forEach(t => t.stop());
        recorder.current = null; setRecording(false); setError('');
      };
      rec.start(); setRecording(true); setError('');
    } catch (e) { setError((e as Error).message); setRecording(false); }
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
    <div className="enhanced-chat">
      <div className="enhanced-toolbar">
        <button type="button" onClick={() => setShowSearch(v => !v)} title="Sohbette ara">
          <Search size={16} /> Ara
        </button>
        <button type="button" onClick={() => void togglePin()} title="Sohbeti sabitle">
          <Pin size={16} /> {pinned ? 'Sabitlendi' : 'Sabitle'}
        </button>
        <button type="button" onClick={()=>setShowStarred(v=>!v)} title="Yıldızlı mesajlar"><Star size={16}/>{showStarred?' Tümü':' Yıldızlı'}</button>
      </div>
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
          return <div className={`message ${mine ? 'mine' : ''}`} key={m.id} onContextMenu={e => { e.preventDefault(); if (!deleted) setOpenActions(openActions === m.id ? null : m.id); }}>
            <div className="message-body" onClick={() => { if (!deleted && !m.media_path) setOpenActions(openActions === m.id ? null : m.id); }}>
              {deleted ? <i>Bu mesaj silindi</i> : <>
                {m.reply_to_message_id && <div className="vexa8-reply-quote">↳ {messages.find(x=>x.id===m.reply_to_message_id)?.body?.slice(0,110)||'Yanıtlanan mesaj'}</div>}
                {m.body?.startsWith('[vexa-sticker]') ? <div className="vexa81-sticker" aria-label="Çıkartma">{m.body.slice(14)}</div> : m.body && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>}
                {m.media_path && urls[m.media_path] && (m.media_type === 'image'
                  ? <img className="enhanced-media" src={urls[m.media_path]} alt="Gönderilen fotoğraf" />
                  : m.media_type === 'video'
                    ? <video className="enhanced-media" controls src={urls[m.media_path]} />
                    : <audio controls src={urls[m.media_path]} />)}
                {m.media_path && urls[m.media_path] && <a href={urls[m.media_path]} target="_blank"
                  rel="noopener noreferrer" className="enhanced-download"><Download size={13} /> Dosyayı aç</a>}
              </>}
            </div>
            <time>{time(m.created_at)}{m.edited_at ? ' · düzenlendi' : ''}{mine&&!deleted ? <span title={m.read_at?'Görüldü':'Gönderildi'} style={{marginLeft:6,color:m.read_at?'var(--accent)':'var(--muted)'}}>{m.read_at?'✓✓':'✓'}</span>:null}</time>
            {!deleted && <>
              {starred.includes(m.id)&&<Star size={12} className="vexa8-star-mark" fill="currentColor"/>}
              <div className="enhanced-reactions">
                {rs.map((r, i) => <button type="button" key={`${r.user_id}-${r.emoji}-${i}`}
                  className={r.user_id === userId ? 'own' : ''}
                  title={r.user_id === userId ? 'Tepkini kaldır' : 'Aynı tepkiyi gönder'}
                  onClick={() => void react(m, r.emoji)}>{r.emoji}</button>)}
              </div>
              <div className="enhanced-actions">
                <button type="button" className="enhanced-actions-trigger"
                  onClick={() => setOpenActions(openActions === m.id ? null : m.id)}
                  aria-expanded={openActions === m.id}>••• <span>İşlemler</span></button>
                {openActions === m.id && <div className="enhanced-actions-menu">
                  <button type="button" onClick={() => { setReply(m); setEdit(null); setOpenActions(null); }}>
                    <CornerUpLeft size={14} /> Yanıtla
                  </button>
                  <button type="button" onClick={()=>void toggleStar(m)}><Star size={14}/>{starred.includes(m.id)?'Yıldızı kaldır':'Yıldızla'}</button>
                  <button type="button" onClick={()=>{setForwarding(m);setOpenActions(null);}}><Forward size={14}/> İlet</button>
                  {mine && <>
                    <button type="button" onClick={() => { setEdit(m); setReply(null); setDraft(m.body || ''); setOpenActions(null); }}>
                      <Pencil size={14} /> Düzenle
                    </button>
                    <button type="button" onClick={() => void remove(m)}><Trash2 size={14} /> Sil</button>
                  </>}
                  <div className="enhanced-emoji"><Smile size={14} />
                    {emojis.map(e => <button type="button" key={e} title={`${e} tepkisi`}
                      onClick={() => void react(m, e)}>{e}</button>)}
                  </div>
                </div>}
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
      {showStickers&&<div className="vexa81-sticker-panel" role="dialog" aria-label="Çıkartmalar"><strong>Çıkartmalar</strong><div>{['❤️','🥰','😂','🔥','😍','🎉','😎','😭','💐','🐱','🐻','✨'].map(e=><button type="button" key={e} disabled={stickerBusy} onClick={()=>void sendSticker(e)}>{e}</button>)}</div><small>GIF göndermek için GIF dosyası seçebilirsin.</small></div>}
      <form className="composer enhanced-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/webm,audio/*"
          onChange={e => setFile(e.target.files?.[0] || null)} />
        <button type="button" title="Çıkartmalar" aria-label="Çıkartmalar" onClick={()=>setShowStickers(v=>!v)}><Sticker size={19}/></button>
        <button type="button" title="GIF dosyası seç" aria-label="GIF dosyası seç" onClick={()=>fileRef.current?.click()}><ImagePlay size={19}/></button>
        <button type="button" title="Medya ekle" onClick={() => fileRef.current?.click()}><Paperclip size={19} /></button>
        <button type="button" title={recording ? 'Kaydı bitir' : 'Ses kaydı'} onClick={() => void record()}>
          {recording ? <Square size={19} /> : <Mic size={19} />}
        </button>
        <input value={draft} onChange={e => {setDraft(e.target.value); if(e.target.value.trim())void typingChannel.current?.send({type:'broadcast',event:'typing',payload:{sender:userId}});}}
          placeholder={recording ? 'Ses kaydediliyor...' : edit ? 'Mesajı düzenle…' : 'Mesaj yaz…'} />
        <button type="submit" disabled={busy || (!draft.trim() && !file)} title="Gönder"><Send size={19} /></button>
      </form>
    </div>
  );
}
