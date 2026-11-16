import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Mic, Square, Send, CornerUpLeft, Pencil, Trash2, Smile, Pin, Download, X, Search } from 'lucide-react';
import { supabase } from './supabase';

type Msg = {
  id: number; sender_id: string; recipient_id: string; body: string | null;
  created_at: string; deleted_at: string | null; edited_at: string | null;
  media_path: string | null; media_type: string | null;
};
type Reaction = { message_id: number; user_id: string; emoji: string };
const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
const time = (date: string) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export default function EnhancedChat({ userId, peerId }: { userId: string; peerId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
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
      .select('id,sender_id,recipient_id,body,created_at,deleted_at,edited_at,media_path,media_type')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: true })
      .limit(250);
    if (currentChat.current !== chatKey) return;
    if (loadError) { setError(loadError.message); return; }
    const rows = (data || []) as Msg[];
    setMessages(rows);
    const unread = rows.some(m => m.sender_id===peerId && m.recipient_id===userId);
    if (unread && document.visibilityState === 'visible') {
      const {data:privacy}=await supabase.from('vexa101_privacy').select('read_receipts').eq('user_id',userId).maybeSingle();
      if(privacy?.read_receipts!==false){
      const {error: readError} = await supabase.from('messages')
        .update({read_at:new Date().toISOString()})
        .eq('sender_id',peerId).eq('recipient_id',userId).is('read_at',null);
      if(readError) console.warn('Okundu işareti:',readError.message);
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

  useEffect(() => {
    setDraft(''); setReply(null); setEdit(null); setFile(null);
    setError(''); setChatSearch(''); setShowSearch(false); setOpenActions(null);
    void load();
    const channel = supabase.channel(`vexa-chat-${[userId, peerId].sort().join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vexa_message_reactions' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, userId, peerId]);

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
  }, [messages.length, chatSearch]);

  async function send() {
    if (busy) return;
    const body = draft.trim();
    if (!body && !file) return;
    setBusy(true); setError('');
    let uploadedPath: string | null = null;
    try {
      if (edit) {
        if (!body) throw new Error('Düzenlenen mesaj boş olamaz.');
        const { error: e } = await supabase.from('messages')
          .update({ body, edited_at: new Date().toISOString() })
          .eq('id', edit.id).eq('sender_id', userId);
        if (e) throw e;
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
        // messages.id bigint, reply_to uuid: sayısal ID'yi reply_to'ya yazmıyoruz.
        const text = reply ? `↳ ${reply.body?.slice(0, 100) || 'Medya'}\n\n${body}` : body;
        const { error: e } = await supabase.from('messages').insert({
          sender_id: userId, recipient_id: peerId, body: text || null,
          media_path: uploadedPath, media_type: mediaType
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
    if (!window.confirm('Bu mesaj silinsin mi?')) return;
    const { error: e } = await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString() }).eq('id', m.id).eq('sender_id', userId);
    if (e) setError(e.message);
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

  const visible = messages.filter(m => !chatSearch.trim() ||
    (m.body || '').toLocaleLowerCase('tr-TR').includes(chatSearch.trim().toLocaleLowerCase('tr-TR')));

  return (
    <div className="enhanced-chat">
      <div className="enhanced-toolbar">
        <button type="button" onClick={() => setShowSearch(v => !v)} title="Sohbette ara">
          <Search size={16} /> Ara
        </button>
        <button type="button" onClick={() => void togglePin()} title="Sohbeti sabitle">
          <Pin size={16} /> {pinned ? 'Sabitlendi' : 'Sabitle'}
        </button>
      </div>
      {showSearch && <div className="enhanced-preview">
        <input aria-label="Sohbette ara" placeholder="Mesajlarda ara..." value={chatSearch}
          onChange={e => setChatSearch(e.target.value)} />
        <button type="button" onClick={() => { setChatSearch(''); setShowSearch(false); }} title="Aramayı kapat"><X size={17} /></button>
      </div>}
      <div className="message-list enhanced-list">
        {visible.map(m => {
          const mine = m.sender_id === userId;
          const deleted = !!m.deleted_at;
          const rs = reactions.filter(r => r.message_id === m.id);
          return <div className={`message ${mine ? 'mine' : ''}`} key={m.id}>
            <div className="message-body">
              {deleted ? <i>Bu mesaj silindi</i> : <>
                {m.body && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>}
                {m.media_path && urls[m.media_path] && (m.media_type === 'image'
                  ? <img className="enhanced-media" src={urls[m.media_path]} alt="Gönderilen fotoğraf" />
                  : m.media_type === 'video'
                    ? <video className="enhanced-media" controls src={urls[m.media_path]} />
                    : <audio controls src={urls[m.media_path]} />)}
                {m.media_path && urls[m.media_path] && <a href={urls[m.media_path]} target="_blank"
                  rel="noopener noreferrer" className="enhanced-download"><Download size={13} /> Dosyayı aç</a>}
              </>}
            </div>
            <time>{time(m.created_at)}{m.edited_at ? ' · düzenlendi' : ''}</time>
            {!deleted && <>
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
        {showSearch && chatSearch && visible.length === 0 && <div className="enhanced-preview">Eşleşen mesaj bulunamadı.</div>}
        <div ref={bottom} />
      </div>
      {(reply || edit || file) && <div className="enhanced-preview">
        <span>{edit ? 'Düzenleniyor: ' : reply ? 'Yanıt: ' : 'Ek: '}
          {edit?.body || reply?.body || file?.name || 'Medya'}</span>
        <button type="button" title="İptal" onClick={() => {
          setReply(null); setEdit(null); setFile(null); setDraft('');
          if (fileRef.current) fileRef.current.value = '';
        }}><X size={17} /></button>
      </div>}
      {error && <div className="enhanced-error" role="alert">{error}</div>}
      <form className="composer enhanced-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
        <input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/webm,audio/*"
          onChange={e => setFile(e.target.files?.[0] || null)} />
        <button type="button" title="Medya ekle" onClick={() => fileRef.current?.click()}><Paperclip size={19} /></button>
        <button type="button" title={recording ? 'Kaydı bitir' : 'Ses kaydı'} onClick={() => void record()}>
          {recording ? <Square size={19} /> : <Mic size={19} />}
        </button>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          placeholder={recording ? 'Ses kaydediliyor...' : edit ? 'Mesajı düzenle…' : 'Mesaj yaz…'} />
        <button type="submit" disabled={busy || (!draft.trim() && !file)} title="Gönder"><Send size={19} /></button>
      </form>
    </div>
  );
}
