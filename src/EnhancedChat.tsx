
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  Paperclip,
  Mic,
  Square,
  Send,
  CornerUpLeft,
  Pencil,
  Trash2,
  Smile,
  Pin,
  Download,
  X,
  Search
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
  media_path?: string | null;
  media_type?: string | null;
};

type Reaction = {
  message_id: number;
  user_id: string;
  emoji: string;
};

const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

const time = (date: string) =>
  new Date(date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

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

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStream = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('messages')
      .select(
        'id,sender_id,recipient_id,body,created_at,deleted_at,edited_at,media_path,media_type'
      )
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(250);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const rows = (data || []) as Msg[];
    setMessages(rows);

    const ids = rows.map(m => m.id);

    if (ids.length) {
      const result = await supabase
        .from('vexa_message_reactions')
        .select('message_id,user_id,emoji')
        .in('message_id', ids);

      if (!result.error) {
        setReactions((result.data || []) as Reaction[]);
      } else {
        setReactions([]);
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
        const { data: urlData } = await supabase.storage
          .from('vexa-media')
          .createSignedUrl(path, 3600);

        return [path, urlData?.signedUrl || ''] as const;
      })
    );

    setUrls(Object.fromEntries(signed));
  }, [userId, peerId]);

  useEffect(() => {
    setMessages([]);
    setReactions([]);
    setDraft('');
    setReply(null);
    setEdit(null);
    setFile(null);
    setError('');
    setSearch('');
    setSearchOpen(false);

    void load();

    const channel = supabase
      .channel(
        `vexa-chat-${[userId, peerId].sort().join('-')}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          void load();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vexa_message_reactions'
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId, peerId]);

  useEffect(() => {
    void supabase
      .from('vexa_pinned_chats')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('friend_id', peerId)
      .maybeSingle()
      .then(({ data }) => {
        setPinned(!!data);
      });
  }, [userId, peerId]);

  useEffect(() => {
    if (!search.trim()) {
      bottomRef.current?.scrollIntoView({
        block: 'end'
      });
    }
  }, [messages.length, search]);

  async function send() {
    if (busy) return;

    const body = draft.trim();

    if (!body && !file && !edit) return;

    if (edit && !body) {
      setError('Düzenlenen mesaj boş olamaz.');
      return;
    }

    setBusy(true);
    setError('');

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
            throw new Error(
              'Dosya en fazla 25 MB olabilir.'
            );
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
            throw new Error(
              'Bu dosya türü desteklenmiyor.'
            );
          }

          mediaType = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : 'audio';

          const extension =
            file.name
              .split('.')
              .pop()
              ?.replace(/[^a-z0-9]/gi, '')
              .slice(0, 8) || 'bin';

          uploadedPath =
            `${userId}/${crypto.randomUUID()}.${extension}`;

          const { error: uploadError } =
            await supabase.storage
              .from('vexa-media')
              .upload(uploadedPath, file, {
                contentType: file.type
              });

          if (uploadError) throw uploadError;
        }

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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage(message: Msg) {
    if (
      !window.confirm(
        'Bu mesajı silmek istiyor musun?'
      )
    ) {
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
    }
  }

  async function react(message: Msg, emoji: string) {
    setError('');

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
        'Emoji tepkisi kaydedilemedi: ' +
          reactionError.message
      );
      return;
    }

    await load();
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
        throw new Error(
          'Tarayıcın ses kaydını desteklemiyor.'
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      recordingStream.current = stream;

      const mime =
        [
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

        const extension = blob.type.includes('mp4')
          ? 'm4a'
          : blob.type.includes('ogg')
            ? 'ogg'
            : 'webm';

        setFile(
          new File(
            [blob],
            `sesli-mesaj.${extension}`,
            { type: blob.type }
          )
        );

        stream.getTracks().forEach(track =>
          track.stop()
        );

        recordingStream.current = null;
        recorderRef.current = null;
        setRecording(false);
        setError('');
      };

      recorder.onerror = () => {
        setError('Ses kaydı sırasında hata oluştu.');
        stream.getTracks().forEach(track =>
          track.stop()
        );
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

  function cancelAction() {
    setReply(null);
    setEdit(null);
    setFile(null);
    setDraft('');
  }

  const visibleMessages = messages.filter(message => {
    if (!search.trim()) return true;

    return (message.body || '')
      .toLocaleLowerCase('tr-TR')
      .includes(
        search.trim().toLocaleLowerCase('tr-TR')
      );
  });

  return (
    <div className="enhanced-chat">
      <div className="enhanced-toolbar">
        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
          title="Sohbette ara"
        >
          <Search size={16} />
          Ara
        </button>

        <button
          type="button"
          onClick={() => void togglePin()}
          title="Sohbeti sabitle"
        >
          <Pin size={16} />
          {pinned ? 'Sabitlendi' : 'Sabitle'}
        </button>
      </div>

      {searchOpen && (
        <div className="enhanced-preview">
          <input
            aria-label="Sohbette ara"
            placeholder="Mesajlarda ara..."
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
          />

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSearchOpen(false);
            }}
            aria-label="Aramayı kapat"
          >
            <X size={17} />
          </button>
        </div>
      )}

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
            >
              <div className="message-body">
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

              <time>
                {time(message.created_at)}
                {message.edited_at
                  ? ' · düzenlendi'
                  : ''}
              </time>

              {!deleted && (
                <>
                  <div className="enhanced-reactions">
                    {messageReactions.map((r, index) => (
                      <button
                        type="button"
                        key={`${r.user_id}-${r.emoji}-${index}`}
                        className={
                          r.user_id === userId ? 'own' : ''
                        }
                        onClick={() =>
                          void react(message, r.emoji)
                        }
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>

                  <details className="enhanced-actions">
                    <summary>
                      ••• <span>İşlemler</span>
                    </summary>

                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setReply(message);
                          setEdit(null);
                        }}
                      >
                        <CornerUpLeft size={14} />
                        Yanıtla
                      </button>

                      {mine && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEdit(message);
                              setReply(null);
                              setDraft(message.body || '');
                            }}
                          >
                            <Pencil size={14} />
                            Düzenle
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void removeMessage(message)
                            }
                          >
                            <Trash2 size={14} />
                            Sil
                          </button>
                        </>
                      )}

                      <div className="enhanced-emoji">
                        <Smile size={14} />

                        {emojis.map(emoji => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() =>
                              void react(message, emoji)
                            }
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </details>
                </>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

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
            ).slice(0, 120)}
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
        <div className="enhanced-error" role="alert">
          {error}
        </div>
      )}

      <form
        className="composer enhanced-compose"
        onSubmit={event => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/mp4,video/webm,audio/*"
          onChange={event =>
            setFile(event.target.files?.[0] || null)
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
          onChange={event =>
            setDraft(event.target.value)
          }
          placeholder={
            edit
              ? 'Mesajı düzenle…'
              : 'Mesaj yaz…'
          }
        />

        <button
          type="submit"
          disabled={
            busy ||
            (!draft.trim() && !file)
          }
          title="Gönder"
        >
          <Send size={19} />
        </button>
      </form>
    </div>
  );
}
