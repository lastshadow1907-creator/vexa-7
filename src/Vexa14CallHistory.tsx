import {useCallback,useEffect,useState} from 'react';
import {PhoneIncoming,PhoneOutgoing,PhoneMissed,RefreshCw} from 'lucide-react';
import {supabase} from './supabase';
type CallRow={id:string;caller_id:string;callee_id:string;kind:'audio'|'video';status:string;created_at:string;connected_at:string|null;duration_seconds:number|null};
export default function Vexa14CallHistory({userId,lookupName}:{userId:string;lookupName:(id:string)=>string}){
 const [rows,setRows]=useState<CallRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{setBusy(true);const {data,error:e}=await supabase.from('vexa_calls').select('id,caller_id,callee_id,kind,status,created_at,connected_at,duration_seconds').or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order('created_at',{ascending:false}).limit(100);setBusy(false);if(e)setError(e.message);else{setRows((data||[]) as CallRow[]);setError('')}},[userId]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[load]);
 return <section className="vexa14-history"><header><h2>Son aramalar</h2><button onClick={()=>void load()} disabled={busy} title="Yenile"><RefreshCw size={18}/></button></header><p>Sesli ve görüntülü görüşmelerinin kayıtları.</p>{error&&<p role="alert">{error}</p>}{!rows.length&&!busy&&<p>Henüz arama kaydı yok.</p>}{rows.map(r=>{
 const outgoing=r.caller_id===userId;
 const answered=!!r.connected_at;
 const pending=!answered&&['ringing','accepted'].includes(r.status)&&Date.now()-new Date(r.created_at).getTime()<90000;
 const ongoing=answered&&['ringing','accepted'].includes(r.status);
 const missed=!answered&&!pending;
 const Icon=missed?PhoneMissed:outgoing?PhoneOutgoing:PhoneIncoming;
 const seconds=r.duration_seconds??0;
 const duration=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 return <article key={r.id} className={missed?'vexa16-history-missed':answered?'vexa16-history-answered':'vexa16-history-pending'}>
 <Icon size={20}/><div><strong>{lookupName(outgoing?r.callee_id:r.caller_id)}</strong>
 <small>{outgoing?'Giden':'Gelen'} · {r.kind==='video'?'Görüntülü':'Sesli'} · {pending?'Aranıyor':ongoing?'Görüşme sürüyor':answered?`Görüşme ${duration}`:'Cevapsız'}</small></div>
 <time>{new Date(r.created_at).toLocaleString('tr-TR')}</time></article>;
})}</section>
}
