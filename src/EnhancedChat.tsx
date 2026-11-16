
import {useCallback,useEffect,useRef,useState} from 'react';
import {
  Paperclip,Mic,Square,Send,CornerUpLeft,Pencil,
  Trash2,Smile,Pin,Download,X,Search,Check,CheckCheck
} from 'lucide-react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {supabase} from './supabase';

type Msg={
  id:number;
  sender_id:string;
  recipient_id:string;
  body:string|null;
  created_at:string;
  deleted_at?:string|null;
  edited_at?:string|null;
  read_at?:string|null;
  media_path?:string|null;
  media_type?:string|null;
};

type Reaction={
  message_id:number;
  user_id:string;
  emoji:string;
};

const emojis=['❤️','😂','👍','😮','😢','🔥'];

const time=(date:string)=>
  new Date(date).toLocaleTimeString('tr-TR',{
    hour:'2-digit',
    minute:'2-digit'
  });

export default function EnhancedChat({
  userId,peerId
}:{
  userId:string;
  peerId:string;
}){
  const [messages,setMessages]=useState<Msg[]>([]);
  const [reactions,setReactions]=useState<Reaction[]>([]);
  const [urls,setUrls]=useState<Record<string,string>>({});
  const [draft,setDraft]=useState('');
  const [reply,setReply]=useState<Msg|null>(null);
  const [edit,setEdit]=useState<Msg|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pinned,setPinned]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [recording,setRecording]=useState(false);
  const [online,setOnline]=useState(false);
  const [typing,setTyping]=useState(false);

  const fileRef=useRef<HTMLInputElement>(null);
  const bottomRef=useRef<HTMLDivElement>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const channelRef=useRef<RealtimeChannel|null>(null);
  const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastTyping=useRef(0);
  const activeRef=useRef(true);

  const load=useCallback(async()=>{
    const {data,error:e}=await supabase
      .from('messages')
      .select('id,sender_id,recipient_id,body,created_at,deleted_at,edited_at,read_at,media_path,media_type')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
      .order('created_at',{ascending:true})
      .limit(250);

    if(e){
      setError(e.message);
      return;
    }

    const rows=(data||[]) as Msg[];
    setMessages(rows);

    const unread=rows
      .filter(m=>
        m.sender_id===peerId &&
        m.recipient_id===userId &&
        !m.read_at &&
        !m.deleted_at
      )
      .map(m=>m.id);

    if(unread.length && document.visibilityState==='visible'){
      const {error:readError}=await supabase
        .from('messages')
        .update({read_at:new Date().toISOString()})
        .in('id',unread)
        .eq('recipient_id',userId)
        .is('read_at',null);

      if(!readError){
        setMessages(old=>old.map(m=>
          unread.includes(m.id)
            ? {...m,read_at:new Date().toISOString()}
            : m
        ));
      }
    }

    const ids=rows.map(m=>m.id);

    if(ids.length){
      const result=await supabase
        .from('vexa_message_reactions')
        .select('message_id,user_id,emoji')
        .in('message_id',ids);

      setReactions(
        result.error?[]:(result.data||[]) as Reaction[]
      );
    }else{
      setReactions([]);
    }

    const paths=[
      ...new Set(
        rows.map(m=>m.media_path)
          .filter((p):p is string=>!!p)
      )
    ];

    if(paths.length){
      const signed=await Promise.all(paths.map(async path=>{
        const {data:d}=await supabase.storage
          .from('vexa-media')
          .createSignedUrl(path,3600);
        return [path,d?.signedUrl||''] as const;
      }));
      setUrls(Object.fromEntries(signed));
    }else{
      setUrls({});
    }
  },[userId,peerId]);

  useEffect(()=>{
    activeRef.current=true;
    setMessages([]);
    setReactions([]);
    setOnline(false);
    setTyping(false);
    setDraft('');
    setReply(null);
    setEdit(null);
    setFile(null);
    setError('');
    void load();

    const room=[userId,peerId].sort().join('-');

    const channel=supabase.channel(
      `vexa-presence-${room}`,
      {config:{presence:{key:userId}}}
    );

    channelRef.current=channel;

    channel
      .on('presence',{event:'sync'},()=>{
        const state=channel.presenceState();
        setOnline((state[peerId]||[]).length>0);
      })
      .on('broadcast',{event:'typing'},({payload})=>{
        if(payload?.userId!==peerId)return;

        setTyping(!!payload.typing);

        if(typingTimer.current){
          clearTimeout(typingTimer.current);
        }

        if(payload.typing){
          typingTimer.current=setTimeout(
            ()=>setTyping(false),3500
          );
        }
      })
      .on('broadcast',{event:'chat-updated'},()=>{
        void load();
      })
      .subscribe(async status=>{
        if(status==='SUBSCRIBED'){
          await channel.track({
            userId,
            active:true,
            at:new Date().toISOString()
          });
        }
      });

    const databaseChannel=supabase.channel(
      `vexa-db-${room}`
    ).on('postgres_changes',{
      event:'*',
      schema:'public',
      table:'messages'
    },()=>{
      void load();
    }).on('postgres_changes',{
      event:'*',
      schema:'public',
      table:'vexa_message_reactions'
    },()=>{
      void load();
    }).subscribe();

    const onVisible=()=>{
      if(document.visibilityState==='visible'){
        void load();
        void channel.track({
          userId,active:true
        });
      }else{
        void channel.untrack();
      }
    };

    document.addEventListener(
      'visibilitychange',onVisible
    );

    return ()=>{
      activeRef.current=false;
      document.removeEventListener(
        'visibilitychange',onVisible
      );
      if(typingTimer.current){
        clearTimeout(typingTimer.current);
      }
      void channel.untrack();
      void supabase.removeChannel(channel);
      void supabase.removeChannel(databaseChannel);
      channelRef.current=null;
    };
  },[load,userId,peerId]);

  useEffect(()=>{
    void supabase.from('vexa_pinned_chats')
      .select('friend_id')
      .eq('user_id',userId)
      .eq('friend_id',peerId)
      .maybeSingle()
      .then(({data})=>setPinned(!!data));
  },[userId,peerId]);

  useEffect(()=>{
    if(!search.trim()){
      bottomRef.current?.scrollIntoView({
        block:'end'
      });
    }
  },[messages.length,search]);

  function broadcastUpdate(){
    void channelRef.current?.send({
      type:'broadcast',
      event:'chat-updated',
      payload:{userId}
    });
  }

  function sendTyping(value:boolean){
    const now=Date.now();
    if(value && now-lastTyping.current<1200)return;
    lastTyping.current=now;

    void channelRef.current?.send({
      type:'broadcast',
      event:'typing',
      payload:{userId,typing:value}
    });
  }

  async function send(){
    if(busy)return;

    const body=draft.trim();
    if(!body&&!file)return;

    setBusy(true);
    setError('');
    sendTyping(false);

    let uploadedPath:string|null=null;

    try{
      if(edit){
        const {error:e}=await supabase
          .from('messages')
          .update({
            body,
            edited_at:new Date().toISOString()
          })
          .eq('id',edit.id)
          .eq('sender_id',userId);

        if(e)throw e;
        setEdit(null);
      }else{
        let mediaType:string|null=null;

        if(file){
          if(file.size>25*1024*1024){
            throw Error('Dosya en fazla 25 MB olabilir.');
          }

          const allowed=[
            'image/jpeg','image/png','image/webp',
            'image/gif','video/mp4','video/webm',
            'video/quicktime','audio/webm',
            'audio/mp4','audio/ogg','audio/mpeg'
          ];

          if(!allowed.includes(file.type)){
            throw Error('Desteklenmeyen dosya türü.');
          }

          mediaType=file.type.startsWith('image/')
            ?'image'
            :file.type.startsWith('video/')
              ?'video':'audio';

          const ext=file.name.split('.').pop()
            ?.replace(/[^a-z0-9]/gi,'')
            .slice(0,8)||'bin';

          uploadedPath=
            `${userId}/${crypto.randomUUID()}.${ext}`;

          const {error:e}=await supabase.storage
            .from('vexa-media')
            .upload(uploadedPath,file,{
              contentType:file.type
            });

          if(e)throw e;
        }

        const messageBody=reply
          ?`↳ ${(reply.body||'Medya').slice(0,100)}\n\n${body}`
          :body||null;

        const {error:e}=await supabase
          .from('messages')
          .insert({
            sender_id:userId,
            recipient_id:peerId,
            body:messageBody,
            media_path:uploadedPath,
            media_type:mediaType
          });

        if(e){
          if(uploadedPath){
            await supabase.storage
              .from('vexa-media')
              .remove([uploadedPath]);
          }
          throw e;
        }

        setReply(null);
        setFile(null);
      }

      setDraft('');
      await load();
      broadcastUpdate();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  }

  async function removeMessage(m:Msg){
    if(!window.confirm('Mesaj silinsin mi?'))return;

    const {error:e}=await supabase
      .from('messages')
      .update({deleted_at:new Date().toISOString()})
      .eq('id',m.id)
      .eq('sender_id',userId);

    if(e)setError(e.message);
    else{
      await load();
      broadcastUpdate();
    }
  }

  async function react(m:Msg,emoji:string){
    const existing=reactions.find(r=>
      r.message_id===m.id &&
      r.user_id===userId &&
      r.emoji===emoji
    );

    const query=existing
      ?supabase.from('vexa_message_reactions')
        .delete()
        .eq('message_id',m.id)
        .eq('user_id',userId)
        .eq('emoji',emoji)
      :supabase.from('vexa_message_reactions')
        .insert({
          message_id:m.id,
          user_id:userId,
          emoji
        });

    const {error:e}=await query;

    if(e){
      setError('Tepki kaydedilemedi: '+e.message);
    }else{
      await load();
      broadcastUpdate();
    }
  }

  async function togglePin(){
    const {error:e}=pinned
      ?await supabase.from('vexa_pinned_chats')
        .delete()
        .eq('user_id',userId)
        .eq('friend_id',peerId)
      :await supabase.from('vexa_pinned_chats')
        .insert({
          user_id:userId,
          friend_id:peerId
        });

    if(e)setError(e.message);
    else setPinned(!pinned);
  }

  async function record(){
    if(recording){
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try{
      const stream=await navigator.mediaDevices
        .getUserMedia({audio:true});

      const mime=[
        'audio/webm','audio/mp4','audio/ogg'
      ].find(x=>MediaRecorder.isTypeSupported(x))||'';

      const rec=new MediaRecorder(
        stream,mime?{mimeType:mime}:undefined
      );

      recorderRef.current=rec;
      chunksRef.current=[];

      rec.ondataavailable=e=>{
        if(e.data.size)chunksRef.current.push(e.data);
      };

      rec.onstop=()=>{
        const blob=new Blob(chunksRef.current,{
          type:rec.mimeType||'audio/webm'
        });

        const ext=blob.type.includes('mp4')
          ?'m4a'
          :blob.type.includes('ogg')
            ?'ogg':'webm';

        if(activeRef.current){
          setFile(new File(
            [blob],`sesli-mesaj.${ext}`,
            {type:blob.type}
          ));
          setRecording(false);
        }

        stream.getTracks().forEach(t=>t.stop());
        recorderRef.current=null;
      };

      rec.start();
      setRecording(true);
      setError('');
    }catch(e){
      setError((e as Error).message);
      setRecording(false);
    }
  }

  const visible=messages.filter(m=>
    !search.trim() ||
    (m.body||'')
      .toLocaleLowerCase('tr-TR')
      .includes(search.trim().toLocaleLowerCase('tr-TR'))
  );

  return (
    <div className="enhanced-chat">
      <div className="enhanced-toolbar">
        <span style={{
          display:'flex',
          alignItems:'center',
          gap:7,
          fontSize:13
        }}>
          <span style={{
            width:8,
            height:8,
            borderRadius:'50%',
            background:online?'#49db83':'#77847c'
          }}/>
          {typing
            ?'Yazıyor...'
            :online
              ?'Çevrimiçi'
              :'Sohbette değil'}
        </span>

        <button
          type="button"
          onClick={()=>setSearchOpen(!searchOpen)}
        >
          <Search size={16}/> Ara
        </button>

        <button
          type="button"
          onClick={()=>void togglePin()}
        >
          <Pin size={16}/>
          {pinned?'Sabitlendi':'Sabitle'}
        </button>
      </div>

      {searchOpen&&(
        <div className="enhanced-preview">
          <input
            placeholder="Mesajlarda ara..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={()=>{
              setSearch('');
              setSearchOpen(false);
            }}
          >
            <X size={17}/>
          </button>
        </div>
      )}

      <div className="message-list enhanced-list">
        {visible.map(m=>{
          const mine=m.sender_id===userId;
          const deleted=!!m.deleted_at;
          const rs=reactions.filter(r=>
            r.message_id===m.id
          );

          return (
            <div
              key={m.id}
              className={'message '+(mine?'mine':'')}
            >
              <div className="message-body">
                {deleted?(
                  <i>Bu mesaj silindi</i>
                ):(
                  <>
                    {m.body&&(
                      <div style={{
                        whiteSpace:'pre-wrap',
                        overflowWrap:'anywhere'
                      }}>
                        {m.body}
                      </div>
                    )}

                    {m.media_path&&urls[m.media_path]&&(
                      m.media_type==='image'
                        ?<img
                          className="enhanced-media"
                          src={urls[m.media_path]}
                          alt="Gönderilen fotoğraf"
                        />
                        :m.media_type==='video'
                          ?<video
                            className="enhanced-media"
                            controls
                            src={urls[m.media_path]}
                          />
                          :<audio
                            controls
                            src={urls[m.media_path]}
                          />
                    )}

                    {m.media_path&&urls[m.media_path]&&(
                      <a
                        className="enhanced-download"
                        href={urls[m.media_path]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download size={13}/>
                        Dosyayı aç
                      </a>
                    )}
                  </>
                )}
              </div>

              <time style={{
                display:'flex',
                alignItems:'center',
                gap:5
              }}>
                {time(m.created_at)}
                {m.edited_at?' · düzenlendi':''}

                {mine&&!deleted&&(
                  <span
                    title={
                      m.read_at
                        ?`Okundu: ${time(m.read_at)}`
                        :'Gönderildi'
                    }
                    style={{
                      color:m.read_at
                        ?'#55d993'
                        :'inherit',
                      display:'inline-flex'
                    }}
                  >
                    {m.read_at
                      ?<CheckCheck size={15}/>
                      :<Check size={15}/>}
                  </span>
                )}
              </time>

              {!deleted&&(
                <>
                  <div className="enhanced-reactions">
                    {rs.map((r,i)=>(
                      <button
                        type="button"
                        key={`${r.user_id}-${r.emoji}-${i}`}
                        className={
                          r.user_id===userId?'own':''
                        }
                        onClick={()=>void react(m,r.emoji)}
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
                        onClick={()=>{
                          setReply(m);
                          setEdit(null);
                        }}
                      >
                        <CornerUpLeft size={14}/>
                        Yanıtla
                      </button>

                      {mine&&(
                        <>
                          <button
                            type="button"
                            onClick={()=>{
                              setEdit(m);
                              setReply(null);
                              setDraft(m.body||'');
                            }}
                          >
                            <Pencil size={14}/>
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={()=>
                              void removeMessage(m)
                            }
                          >
                            <Trash2 size={14}/>
                            Sil
                          </button>
                        </>
                      )}

                      <div className="enhanced-emoji">
                        <Smile size={14}/>
                        {emojis.map(emoji=>(
                          <button
                            type="button"
                            key={emoji}
                            onClick={()=>
                              void react(m,emoji)
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

        {typing&&(
          <div style={{
            padding:'8px 14px',
            fontSize:13,
            opacity:.8
          }}>
            ••• Yazıyor...
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {(reply||edit||file)&&(
        <div className="enhanced-preview">
          <span>
            {edit?'Düzenleniyor: '
              :reply?'Yanıt: ':'Ek: '}
            {(
              edit?.body||
              reply?.body||
              file?.name||''
            ).slice(0,100)}
          </span>

          <button
            type="button"
            onClick={()=>{
              setReply(null);
              setEdit(null);
              setFile(null);
              setDraft('');
            }}
          >
            <X size={17}/>
          </button>
        </div>
      )}

      {error&&(
        <div className="enhanced-error" role="alert">
          {error}
        </div>
      )}

      <form
        className="composer enhanced-compose"
        onSubmit={e=>{
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/mp4,video/webm,audio/*"
          onChange={e=>
            setFile(e.target.files?.[0]||null)
          }
        />

        <button
          type="button"
          title="Medya ekle"
          onClick={()=>fileRef.current?.click()}
        >
          <Paperclip size={19}/>
        </button>

        <button
          type="button"
          title={recording?'Kaydı bitir':'Ses kaydet'}
          onClick={()=>void record()}
        >
          {recording
            ?<Square size={19}/>
            :<Mic size={19}/>}
        </button>

        <input
          value={draft}
          onChange={e=>{
            setDraft(e.target.value);
            sendTyping(!!e.target.value.trim());
          }}
          onBlur={()=>sendTyping(false)}
          placeholder={
            edit?'Mesajı düzenle…':'Mesaj yaz…'
          }
        />

        <button
          type="submit"
          disabled={
            busy||(!draft.trim()&&!file)
          }
          title="Gönder"
        >
          <Send size={19}/>
        </button>
      </form>
    </div>
  );
}
