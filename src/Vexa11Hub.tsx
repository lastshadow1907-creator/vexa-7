
import {useEffect,useState} from 'react';
import {supabase} from './supabase';

type Note={id:string;title:string;body:string|null;created_at:string;read_at:string|null};
type Msg={role:'user'|'assistant';content:string};

export default function Vexa11Hub({userId,groupId}:{userId:string;groupId:string|null}){
 const [view,setView]=useState<'notifications'|'safety'|'premium'|'ai'|'meeting'>('notifications');
 const [notes,setNotes]=useState<Note[]>([]);
 const [error,setError]=useState('');
 const [info,setInfo]=useState('');
 const [target,setTarget]=useState('');
 const [reason,setReason]=useState('');
 const [blocked,setBlocked]=useState<string[]>([]);
 const [messages,setMessages]=useState<Msg[]>([]);
 const [question,setQuestion]=useState('');
 const [loading,setLoading]=useState(false);
 const [theme,setTheme]=useState('green');

 useEffect(()=>{
  let alive=true;
  void Promise.all([
   supabase.from('vexa11_notifications').select('id,title,body,created_at,read_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(50),
   supabase.from('vexa11_blocks').select('blocked_id').eq('blocker_id',userId),
   supabase.from('vexa11_preferences').select('theme').eq('user_id',userId).maybeSingle()
  ]).then(([n,b,p])=>{
   if(!alive)return;
   if(n.error)setError(n.error.message);
   else setNotes((n.data||[]) as Note[]);
   if(!b.error)setBlocked((b.data||[]).map(x=>x.blocked_id));
   if(p.data?.theme)setTheme(p.data.theme);
  });
  return()=>{alive=false};
 },[userId]);

 async function mark(id:string){
  const now=new Date().toISOString();
  const {error:e}=await supabase.from('vexa11_notifications').update({read_at:now}).eq('id',id).eq('user_id',userId);
  if(e)setError(e.message);
  else setNotes(s=>s.map(n=>n.id===id?{...n,read_at:now}:n));
 }

 async function block(){
  setError('');setInfo('');
  if(!/^[0-9a-f-]{36}$/i.test(target)){setError('Geçerli kullanıcı UUID gir.');return}
  if(target===userId){setError('Kendini engelleyemezsin.');return}
  const {error:e}=await supabase.from('vexa11_blocks').insert({blocker_id:userId,blocked_id:target});
  if(e)setError(e.message);
  else{setBlocked(s=>[...s,target]);setInfo('Kullanıcı engellendi.')}
 }

 async function report(){
  setError('');setInfo('');
  if(!/^[0-9a-f-]{36}$/i.test(target)||reason.trim().length<10){
   setError('Geçerli kullanıcı UUID ve en az 10 karakter açıklama gerekli.');
   return;
  }
  const {error:e}=await supabase.from('vexa11_reports').insert({
   reporter_id:userId,reported_id:target,reason:reason.trim().slice(0,1000)
  });
  if(e)setError(e.message);
  else{setReason('');setInfo('Şikâyetin inceleme için kaydedildi.')}
 }

 async function saveTheme(){
  const {error:e}=await supabase.from('vexa11_preferences').upsert({user_id:userId,theme},{onConflict:'user_id'});
  if(e)setError(e.message);
  else setInfo('Tema tercihi kaydedildi.');
 }

 async function askAI(){
  const content=question.trim();
  if(!content||loading)return;
  setQuestion('');
  const history:Msg[]=[...messages,{role:'user',content}];
  setMessages(history);
  setLoading(true);
  setError('');
  const {data,error:e}=await supabase.functions.invoke('vexa-ai',{
   body:{messages:history.slice(-12)}
  });
  if(e||typeof data?.reply!=='string'){
   setError('AI sunucusu bağlı değil veya yanıt vermedi.');
  }else{
   setMessages(s=>[...s,{role:'assistant',content:data.reply}]);
  }
  setLoading(false);
 }

 const room=groupId
  ?`https://meet.jit.si/vexa-${encodeURIComponent(groupId.replace(/[^a-zA-Z0-9-]/g,''))}`
  :null;

 return <section className="vexa11-hub">
  <h2>Vexa 11.0</h2>
  <div className="vexa11-tabs">
   {([
    ['notifications','Bildirimler'],
    ['safety','Güvenlik'],
    ['premium','Premium'],
    ['ai','Vexa AI'],
    ['meeting','Grup görüşmesi']
   ] as const).map(([id,label])=>
    <button key={id} className={view===id?'active':''}
     onClick={()=>{setView(id);setError('');setInfo('')}}>{label}</button>
   )}
  </div>

  {error&&<p role="alert" className="vexa11-error">{error}</p>}
  {info&&<p role="status">{info}</p>}

  {view==='notifications'&&<div>
   <p>Bildirimler uygulamanın kaydettiği olaylardan oluşur.</p>
   {notes.length===0?<p>Henüz bildirim yok.</p>:notes.map(n=>
    <article key={n.id} className="vexa11-item">
     <strong>{n.title}</strong>
     <p>{n.body}</p>
     <small>{new Date(n.created_at).toLocaleString('tr-TR')}</small>
     {!n.read_at&&<button onClick={()=>void mark(n.id)}>Okundu işaretle</button>}
    </article>
   )}
  </div>}

  {view==='safety'&&<div>
   <p>Engelleme ve şikâyet kayıtları hesabına bağlanır.</p>
   <label>Kullanıcı kimliği (UUID)
    <input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Kullanıcı UUID"/>
   </label>
   <label>Şikâyet nedeni
    <textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/>
   </label>
   <div className="vexa11-actions">
    <button onClick={()=>void block()}>Engelle</button>
    <button onClick={()=>void report()}>Şikâyet et</button>
   </div>
   <h3>Engellediklerin</h3>
   {blocked.map(id=><div className="vexa11-item" key={id}>
    <code>{id}</code>
    <button onClick={async()=>{
     const {error:e}=await supabase.from('vexa11_blocks').delete().eq('blocker_id',userId).eq('blocked_id',id);
     if(e)setError(e.message);
     else setBlocked(s=>s.filter(x=>x!==id));
    }}>Engeli kaldır</button>
   </div>)}
  </div>}

  {view==='premium'&&<div>
   <p>Şimdilik ücretsiz tema tercihi. Ödeme sistemi aktif değil.</p>
   <label>Profil teması
    <select value={theme} onChange={e=>setTheme(e.target.value)}>
     <option value="green">Yeşil</option>
     <option value="midnight">Gece</option>
     <option value="violet">Mor</option>
    </select>
   </label>
   <button onClick={()=>void saveTheme()}>Tercihi kaydet</button>
  </div>}

  {view==='ai'&&<div>
   <p>Gerçek AI yanıtları için Supabase'de vexa-ai Edge Function kurulmalıdır.</p>
   <div className="vexa11-messages">
    {messages.map((m,i)=><div className="vexa11-item" key={i}>
     <strong>{m.role==='user'?'Sen':'Vexa AI'}</strong>
     <p>{m.content}</p>
    </div>)}
   </div>
   <form onSubmit={e=>{e.preventDefault();void askAI()}}>
    <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Vexa AI'a sor..."/>
    <button disabled={loading||!question.trim()}>{loading?'Bekleniyor':'Gönder'}</button>
   </form>
  </div>}

  {view==='meeting'&&<div>
   <p>Grup görüşmesi harici Jitsi Meet üzerinde açılır.</p>
   {room
    ?<a href={room} target="_blank" rel="noopener noreferrer">Grup görüşmesini aç</a>
    :<p>Önce sohbet listesinden bir grup seç.</p>}
  </div>}
 </section>;
}
