
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  Paperclip,
  Mic,
  Square,
  Send,
  CornerUpLeft,
  Pencil,
  Trash2,
  Pin,
  Download,
  X,
  Search,
  Check,
  CheckCheck,
  Copy
} from 'lucide-react';

import { supabase } from './supabase';

type Msg = {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  created_at: string;
  deleted_at?: string | null;
  edited_at?: string | null;
  read_at?: string | null;
  media_path?: string | null;
  media_type?: string | null;
};

type Reaction = {
  message_id: number;
  user_id: string;
  emoji: string;
};

const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

function time(date: string) {
  return new Date(date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

const menuButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '13px 14px',
  background: 'transparent',
  border: 0,
  borderRadius: 12,
  color: '#edf7ef',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left'
};

export default function EnhancedChat({
  userId,
  peerId
}: {
  userId: string;
  peerId: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<Msg | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinned, setPinned] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);

  // WhatsApp tarzı mesaj menüsü
  const [activeMessage, setActiveMessage] =
    useState<Msg | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const longPressRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const typingTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastTyping = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;

    const { data, error: loadError } = await supabase
      .from('messages')
      .select(
        'id,sender_id,recipient_id,body,created_at,deleted_at,edited_at,read_at,media_path,media_type'
      )
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(250);

    if (version !== loadVersion.current) return;

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const rows = (data || []) as Msg[];
    setMessages(rows);

    const unread = rows
      .filter(
        m =>
          m.sender_id === peerId &&
          m.recipient_id === userId &&
          !m.read_at &&
          !m.deleted_at
      )
      .map(m => m.id);

    if (
      unread.length &&
      document.visibilityState === 'visible'
    ) {
      const now = new Date().toISOString();

      const { error: readError } = await supabase
        .from('messages')
        .update({ read_at: now })
        .in('id', unread)
        .eq('recipient_id', userId)
        .is('read_at', null);

      if (!readError && version === loadVersion.current) {
        setMessages(old =>
          old.map(m =>
            unread.includes(m.id)
              ? { ...m, read_at: now }
              : m
          )
        );

        void channelRef.current?.send({
          type: 'broadcast',
          event: 'chat-updated',
          payload: { userId }
        });
      }
    }

    const ids = rows.map(m => m.id);

    if (ids.length) {
      const result = await supabase
        .from('vexa_message_reactions')
        .select('message_id,user_id,emoji')
        .in('message_id', ids);

      if (version === loadVersion.current) {
        setReactions(
          result.error
            ? []
            : (result.data || []) as Reaction[]
        );
      }
    } else {
      setReactions([]);
    }

    const paths = [
      ...new Set(
        rows
          .map(m => m.media_path)
          .filter((p): p is string => !!p)
      )
    ];

    if (!paths.length) {
      setUrls({});
      return;
    }

    const signed = await Promise.all(
      paths.map(async path => {
        const { data: signedData } = await supabase.storage
          .from('vexa-media')
          .createSignedUrl(path, 3600);

        return [
          path,
          signedData?.signedUrl || ''
        ] as const;
      })
    );

    if (version === loadVersion.current) {
      setUrls(Object.fromEntries(signed));
    }
  }, [userId, peerId]);

  useEffect(() => {
    setMessages([]);
    setReactions([]);
    setUrls({});
    setDraft('');
    setReply(null);
    setEdit(null);
    setFile(null);
    setError('');
    setActiveMessage(null);
    setOnline(false);
    setTyping(false);

    void load();

    const room = [userId, peerId].sort().join('-');

    const channel = supabase.channel(
      `vexa-presence-${room}`,
      {
        config: {
          presence: { key: userId }
        }
      }
    );

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnline((state[peerId] || []).length > 0);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId !== peerId) return;

        setTyping(!!payload.typing);

        if (typingTimer.current) {
          clearTimeout(typingTimer.current);
        }

        if (payload.typing) {
          typingTimer.current = setTimeout(
            () => setTyping(false),
            3500
          );
        }
      })
      .on('broadcast', { event: 'chat-updated' }, () => {
        void load();
      })
      .subscribe(async status => {
        if (
          status === 'SUBSCRIBED' &&
          document.visibilityState === 'visible'
        ) {
          await channel.track({
            userId,
            active: true
          });
        }
      });

    const dbChannel = supabase
      .channel(`vexa-db-${room}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => void load()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vexa_message_reactions'
        },
        () => void load()
      )
      .subscribe();

    const visibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
        void channel.track({
          userId,
          active: true
        });
      } else {
        void channel.untrack();
      }
    };

    document.addEventListener(
      'visibilitychange',
      visibility
    );

    return () => {
      loadVersion.current++;

      document.removeEventListener(
        'visibilitychange',
        visibility
      );

      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }

      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
      }

      void channel.untrack();
      void supabase.removeChannel(channel);
      void supabase.removeChannel(dbChannel);

      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [load, userId, peerId]);

  useEffect(() => {
    let cancelled = false;

    void supabase
      .from('vexa_pinned_chats')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('friend_id', peerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setPinned(!!data);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, peerId]);

  useEffect(() => {
    if (!search.trim() && !activeMessage) {
      bottomRef.current?.scrollIntoView({
        block: 'end'
      });
    }
  }, [messages.length, search, activeMessage]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }

      streamRef.current
        ?.getTracks()
        .forEach(track => track.stop());
    };
  }, []);

  function broadcastUpdate() {
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'chat-updated',
      payload: { userId }
    });
  }

  function sendTyping(value: boolean) {
    const now = Date.now();

    if (value && now - lastTyping.current < 1200) {
      return;
    }

    lastTyping.current = now;

    void channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId,
        typing: value
      }
    });
  }

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function startLongPress(message: Msg) {
    cancelLongPress();

    longPressRef.current = setTimeout(() => {
      setActiveMessage(message);
      longPressRef.current = null;
    }, 450);
  }

  function closeMenu() {
    cancelLongPress();
    setActiveMessage(null);
  }

  function cancelAction() {
    setReply(null);
    setEdit(null);
    setFile(null);
    setDraft('');
  }

  async function send() {
    if (busy) return;

    const body = draft.trim();

    if (!body && !file) return;

    if (edit && !body) {
      setError('Düzenlenen mesaj boş olamaz.');
      return;
    }

    setBusy(true);
    setError('');
    sendTyping(false);

    let uploadedPath: string | null = null;

    try {
      if (edit) {
        const { error: updateError } = await supabase
          .from('messages')
          .update({
            body,
            edited_at: new Date().toISOString()
          })
          .eq('id', edit.id)
          .eq('sender_id', userId);

        if (updateError) throw updateError;

        setEdit(null);
      } else {
        let mediaType: string | null = null;

        if (file) {
          if (file.size > 25 * 1024 * 1024) {
            throw Error('Dosya en fazla 25 MB olabilir.');
          }

          const allowed = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'audio/webm',
            'audio/mp4',
            'audio/ogg',
            'audio/mpeg'
          ];

          if (!allowed.includes(file.type)) {
            throw Error('Desteklenmeyen dosya türü.');
          }

          mediaType = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : 'audio';

          const ext =
            file.name
              .split('.')
              .pop()
              ?.replace(/[^a-z0-9]/gi, '')
              .slice(0, 8) || 'bin';

          uploadedPath =
            `${userId}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } =
            await supabase.storage
              .from('vexa-media')
              .upload(uploadedPath, file, {
                contentType: file.type
              });

          if (uploadError) throw uploadError;
        }

        // reply_to sütunu UUID olduğu için
        // sayısal mesaj ID'si göndermiyoruz.
        const messageBody = reply
          ? `↳ ${(reply.body || 'Medya').slice(0, 100)}\n\n${body}`
          : body || null;

        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            sender_id: userId,
            recipient_id: peerId,
            body: messageBody,
            media_path: uploadedPath,
            media_type: mediaType
          });

        if (insertError) {
          if (uploadedPath) {
            await supabase.storage
              .from('vexa-media')
              .remove([uploadedPath]);
          }

          throw insertError;
        }

        setReply(null);
        setFile(null);
      }

      setDraft('');
      await load();
      broadcastUpdate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage(message: Msg) {
    if (!window.confirm('Mesaj silinsin mi?')) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('messages')
      .update({
        deleted_at: new Date().toISOString()
      })
      .eq('id', message.id)
      .eq('sender_id', userId);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await load();
      broadcastUpdate();
    }
  }

  async function react(message: Msg, emoji: string) {
    const existing = reactions.find(
      r =>
        r.message_id === message.id &&
        r.user_id === userId &&
        r.emoji === emoji
    );

    const query = existing
      ? supabase
          .from('vexa_message_reactions')
          .delete()
          .eq('message_id', message.id)
          .eq('user_id', userId)
          .eq('emoji', emoji)
      : supabase
          .from('vexa_message_reactions')
          .insert({
            message_id: message.id,
            user_id: userId,
            emoji
          });

    const { error: reactionError } = await query;

    if (reactionError) {
      setError(
        'Tepki kaydedilemedi: ' + reactionError.message
      );
    } else {
      await load();
      broadcastUpdate();
    }
  }

  async function togglePin() {
    const { error: pinError } = pinned
      ? await supabase
          .from('vexa_pinned_chats')
          .delete()
          .eq('user_id', userId)
          .eq('friend_id', peerId)
      : await supabase
          .from('vexa_pinned_chats')
          .insert({
            user_id: userId,
            friend_id: peerId
          });

    if (pinError) {
      setError(pinError.message);
    } else {
      setPinned(!pinned);
    }
  }

  async function record() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Error('Tarayıcı ses kaydını desteklemiyor.');
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      streamRef.current = stream;

      const mime = [
        'audio/webm',
        'audio/mp4',
        'audio/ogg'
      ].find(type =>
        MediaRecorder.isTypeSupported(type)
      ) || '';

      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });

        const ext = blob.type.includes('mp4')
          ? 'm4a'
          : blob.type.includes('ogg')
            ? 'ogg'
            : 'webm';

        setFile(
          new File(
            [blob],
            `sesli-mesaj.${ext}`,
            { type: blob.type }
          )
        );

        stream.getTracks().forEach(track =>
          track.stop()
        );

        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };

      recorder.onerror = () => {
        setError('Ses kaydı sırasında hata oluştu.');
        stream.getTracks().forEach(track =>
          track.stop()
        );
        streamRef.current = null;
        setRecording(false);
      };

      recorder.start();
      setRecording(true);
      setError('');
    } catch (err) {
      setError((err as Error).message);
      setRecording(false);
    }
  }

  async function copyMessage(message: Msg) {
    try {
      await navigator.clipboard.writeText(
        message.body || ''
      );
    } catch {
      setError('Mesaj kopyalanamadı.');
    }

    closeMenu();
  }

  const visibleMessages = messages.filter(
    m =>
      !search.trim() ||
      (m.body || '')
        .toLocaleLowerCase('tr-TR')
        .includes(
          search.trim().toLocaleLowerCase('tr-TR')
        )
  );

  return (
    <div className="enhanced-chat">
      {/* Üst araç çubuğu */}
      <div className="enhanced-toolbar">
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 13
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: online
                ? '#49db83'
                : '#77847c'
            }}
          />

          {typing
            ? 'Yazıyor...'
            : online
              ? 'Çevrimiçi'
              : 'Sohbette değil'}
        </span>

        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <Search size={16} />
          Ara
        </button>

        <button
          type="button"
          onClick={() => void togglePin()}
        >
          <Pin size={16} />
          {pinned ? 'Sabitlendi' : 'Sabitle'}
        </button>
      </div>

      {/* Mesaj arama */}
      {searchOpen && (
        <div className="enhanced-preview">
          <input
            placeholder="Mesajlarda ara..."
            aria-label="Mesajlarda ara"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSearchOpen(false);
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Mesaj listesi */}
      <div className="message-list enhanced-list">
        {visibleMessages.map(message => {
          const mine = message.sender_id === userId;
          const deleted = !!message.deleted_at;

          const messageReactions = reactions.filter(
            r => r.message_id === message.id
          );

          return (
            <div
              key={message.id}
              className={
                'message ' + (mine ? 'mine' : '')
              }
              onContextMenu={e => {
                if (deleted) return;

                e.preventDefault();
                setActiveMessage(message);
              }}
              onTouchStart={e => {
                if (deleted) return;

                touchStart.current = {
                  x: e.touches[0].clientX,
                  y: e.touches[0].clientY
                };

                startLongPress(message);
              }}
              onTouchMove={e => {
                const start = touchStart.current;
                if (!start) return;

                const dx =
                  e.touches[0].clientX - start.x;

                const dy =
                  e.touches[0].clientY - start.y;

                if (
                  Math.abs(dx) > 10 ||
                  Math.abs(dy) > 10
                ) {
                  cancelLongPress();
                }
              }}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
            >
              {/* Mesaj balonu */}
              <div
                className="message-body"
                style={{
                  overflowWrap: 'anywhere',
                  touchAction: 'pan-y'
                }}
              >
                {deleted ? (
                  <i>Bu mesaj silindi</i>
                ) : (
                  <>
                    {message.body && (
                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere'
                        }}
                      >
                        {message.body}
                      </div>
                    )}

                    {message.media_path &&
                      urls[message.media_path] &&
                      (message.media_type === 'image' ? (
                        <img
                          className="enhanced-media"
                          src={urls[message.media_path]}
                          alt="Gönderilen fotoğraf"
                        />
                      ) : message.media_type ===
                        'video' ? (
                        <video
                          className="enhanced-media"
                          controls
                          src={urls[message.media_path]}
                        />
                      ) : (
                        <audio
                          controls
                          src={urls[message.media_path]}
                        />
                      ))}

                    {message.media_path &&
                      urls[message.media_path] && (
                        <a
                          className="enhanced-download"
                          href={urls[message.media_path]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download size={13} />
                          Dosyayı aç
                        </a>
                      )}
                  </>
                )}
              </div>

              {/* Mesaj saati ve okundu */}
              <time
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                {time(message.created_at)}

                {message.edited_at
                  ? ' · düzenlendi'
                  : ''}

                {mine && !deleted && (
                  <span
                    title={
                      message.read_at
                        ? `Okundu: ${time(message.read_at)}`
                        : 'Gönderildi'
                    }
                    style={{
                      display: 'inline-flex',
                      color: message.read_at
                        ? '#55d993'
                        : 'inherit'
                    }}
                  >
                    {message.read_at ? (
                      <CheckCheck size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                  </span>
                )}
              </time>

              {/* Sadece eklenmiş tepkiler görünür */}
              {!deleted &&
                messageReactions.length > 0 && (
                  <div className="enhanced-reactions">
                    {messageReactions.map(
                      (reaction, index) => (
                        <button
                          type="button"
                          key={`${reaction.user_id}-${reaction.emoji}-${index}`}
                          className={
                            reaction.user_id === userId
                              ? 'own'
                              : ''
                          }
                          onClick={() =>
                            void react(
                              message,
                              reaction.emoji
                            )
                          }
                        >
                          {reaction.emoji}
                        </button>
                      )
                    )}
                  </div>
                )}

              {/* Üç nokta menüsü artık yok */}
            </div>
          );
        })}

        {typing && (
          <div
            style={{
              padding: '8px 14px',
              fontSize: 13,
              opacity: 0.8
            }}
          >
            ••• Yazıyor...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Yanıt / düzenleme / ek önizlemesi */}
      {(reply || edit || file) && (
        <div className="enhanced-preview">
          <span>
            {edit
              ? 'Düzenleniyor: '
              : reply
                ? 'Yanıt: '
                : 'Ek: '}

            {(
              edit?.body ||
              reply?.body ||
              file?.name ||
              ''
            ).slice(0, 100)}
          </span>

          <button
            type="button"
            onClick={cancelAction}
            aria-label="İptal"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {error && (
        <div
          className="enhanced-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Mesaj yazma alanı */}
      <form
        className="composer enhanced-compose"
        onSubmit={e => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/mp4,video/webm,audio/*"
          onChange={e =>
            setFile(e.target.files?.[0] || null)
          }
        />

        <button
          type="button"
          title="Medya ekle"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={19} />
        </button>

        <button
          type="button"
          title={
            recording
              ? 'Kaydı bitir'
              : 'Ses kaydet'
          }
          onClick={() => void record()}
        >
          {recording ? (
            <Square size={19} />
          ) : (
            <Mic size={19} />
          )}
        </button>

        <input
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            sendTyping(!!e.target.value.trim());
          }}
          onBlur={() => sendTyping(false)}
          placeholder={
            edit
              ? 'Mesajı düzenle…'
              : 'Mesaj yaz…'
          }
        />

        <button
          type="submit"
          disabled={
            busy || (!draft.trim() && !file)
          }
          title="Gönder"
        >
          <Send size={19} />
        </button>
      </form>

      {/* WhatsApp tarzı mesaj işlem menüsü */}
      {activeMessage && (
        <div
          onClick={closeMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mesaj işlemleri"
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(100%, 440px)',
              maxHeight: '85dvh',
              overflowY: 'auto',
              background: '#17251c',
              border: '1px solid #345440',
              borderRadius: '22px 22px 0 0',
              padding: '16px 14px',
              paddingBottom:
                'max(20px, env(safe-area-inset-bottom))',
              boxShadow:
                '0 -12px 40px rgba(0,0,0,0.35)'
            }}
          >
            {/* Tutma çizgisi */}
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 20,
                background: '#637e6b',
                margin: '0 auto 16px'
              }}
            />

            {/* Seçili mesaj */}
            <div
              style={{
                background: '#22382a',
                padding: 12,
                borderRadius: 12,
                marginBottom: 14,
                color: '#dcefe0',
                fontSize: 13,
                overflowWrap: 'anywhere',
                maxHeight: 90,
                overflowY: 'auto'
              }}
            >
              {(activeMessage.body || 'Medya mesajı')
                .slice(0, 200)}
            </div>

            {/* Emoji tepkileri */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                gap: 3,
                marginBottom: 14
              }}
            >
              {emojis.map(emoji => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => {
                    void react(activeMessage, emoji);
                    closeMenu();
                  }}
                  style={{
                    border: 0,
                    background: 'transparent',
                    fontSize: 26,
                    padding: 5,
                    cursor: 'pointer'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div
              style={{
                height: 1,
                background: '#345440',
                marginBottom: 8
              }}
            />

            <button
              type="button"
              style={menuButton}
              onClick={() => {
                setReply(activeMessage);
                setEdit(null);
                setDraft('');
                closeMenu();
              }}
            >
              <CornerUpLeft size={18} />
              Yanıtla
            </button>

            <button
              type="button"
              style={menuButton}
              onClick={() =>
                void copyMessage(activeMessage)
              }
            >
              <Copy size={18} />
              Kopyala
            </button>

            {activeMessage.sender_id === userId && (
              <>
                <button
                  type="button"
                  style={menuButton}
                  onClick={() => {
                    setEdit(activeMessage);
                    setReply(null);
                    setFile(null);
                    setDraft(
                      activeMessage.body || ''
                    );
                    closeMenu();
                  }}
                >
                  <Pencil size={18} />
                  Düzenle
                </button>

                <button
                  type="button"
                  style={{
                    ...menuButton,
                    color: '#ff8b8b'
                  }}
                  onClick={() => {
                    const selected = activeMessage;
                    closeMenu();
                    void removeMessage(selected);
                  }}
                >
                  <Trash2 size={18} />
                  Sil
                </button>
              </>
            )}

            <button
              type="button"
              style={{
                ...menuButton,
                justifyContent: 'center',
                marginTop: 8,
                background: '#263d2d'
              }}
              onClick={closeMenu}
            >
              <X size={18} />
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
