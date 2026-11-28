import {useCallback,useEffect,useState} from 'react';
import {PhoneIncoming,PhoneOutgoing,PhoneMissed,RefreshCw} from 'lucide-react';
import {supabase} from './supabase';
type CallRow={id:string;caller_id:string;callee_id:string;kind:'audio'|'video';status:string;created_at:string;connected_at:string|null;duration_seconds:number|null};
export default function Vexa14CallHistory({userId,lookupName}:{userId:string;lookupName:(id:string)=>string}){
 const [rows,setRows]=useState<CallRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState('all');
 const load=useCallback(async()=>{setBusy(true);const {data,error:e}=await supabase.from('vexa_calls').select('id,caller_id,callee_id,kind,status,created_at,connected_at,duration_seconds').or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order('created_at',{ascending:false}).limit(100);setBusy(false);if(e)setError(e.message);else{setRows((data||[]) as CallRow[]);setError('')}},[userId]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[load]);
 return <section className="vexa14-history"><header><h2>Son aramalar</h2><button onClick={()=>void load()} disabled={busy} title="Yenile"><RefreshCw size={18}/></button></header><p>Sesli ve görüntülü görüşmelerinin kayıtları.</p><div className="polish151-tabs">{[["all","Tümü"],["missed","Cevapsız"],["video","Görüntülü"]].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>{error&&<p role="alert">{error}</p>}{!rows.length&&!busy&&<p>Henüz arama kaydı yok.</p>}{rows.filter(r=>filter==='all'||filter==='video'&&r.kind==='video'||filter==='missed'&&!r.connected_at&&!(['ringing','accepted'].includes(r.status)&&Date.now()-new Date(r.created_at).getTime()<90000)).map(r=>{
 const outgoing=r.caller_id===userId;
 const answered=!!r.connected_at;
 const pending=!answered&&['ringing','accepted'].includes(r.status)&&Date.now()-new Date(r.created_at).getTime()<90000;
 const ongoing=answered&&['ringing','accepted'].includes(r.status);
 const missed=!answered&&!pending;
 const Icon=missed?PhoneMissed:outgoing?PhoneOutgoing:PhoneIncoming;
 const seconds=r.duration_seconds??0;
 const duration=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 return <article key={r.id} className={missed?'vexa16-history-missed':answered?'vexa16-history-answered':'vexa16-history-pending'}>
 <span className="polish151-call-icon"><Icon size={20}/></span><div><strong>{lookupName(outgoing?r.callee_id:r.caller_id)}</strong>
 <small>{outgoing?'Giden':'Gelen'} · {r.kind==='video'?'Görüntülü':'Sesli'} · {pending?'Aranıyor':ongoing?'Görüşme sürüyor':answered?`Görüşme ${duration}`:'Cevapsız'}</small></div>
 <time><span>{new Date(r.created_at).toLocaleDateString('tr-TR',{day:'2-digit',month:'short'})}</span><small>{new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</small></time></article>;
})}</section>
}
