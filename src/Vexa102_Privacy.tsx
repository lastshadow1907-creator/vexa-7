import {useCallback,useEffect,useRef,useState} from 'react';
import {QrCode,Copy,Shield,Activity,Moon,ScanLine} from 'lucide-react';
import {supabase} from './supabase';

type Visibility='everyone'|'friends'|'nobody';
type Status='online'|'busy'|'away'|'dnd';
type Settings={user_id:string;status:Status;status_visibility:Visibility;last_seen_visibility:Visibility;profile_visibility:Visibility;read_receipts:boolean;focus_until:string|null;last_seen_at:string|null};
const defaults=(userId:string):Settings=>({user_id:userId,status:'online',status_visibility:'friends',last_seen_visibility:'friends',profile_visibility:'everyone',read_receipts:true,focus_until:null,last_seen_at:null});
const statuses:Record<Status,string>={online:'Müsait',busy:'Meşgul',away:'Boşta',dnd:'Rahatsız etmeyin'};
const vis=[{value:'everyone',label:'Herkes'},{value:'friends',label:'Yalnızca arkadaşlar'},{value:'nobody',label:'Hiç kimse'}] as const;
export function VexaPrivacySettings({userId}:{userId:string}){
 const [data,setData]=useState<Settings>(defaults(userId));const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 useEffect(()=>{let alive=true;void supabase.from('vexa101_privacy').select('*').eq('user_id',userId).maybeSingle().then(({data,error})=>{if(!alive)return;if(error)setNotice(error.message);else if(data)setData({...defaults(userId),...data} as Settings)});return()=>{alive=false}},[userId]);
 const save=async(next:Settings)=>{setBusy(true);setNotice('');const {error}=await supabase.from('vexa101_privacy').upsert({...next,user_id:userId},{onConflict:'user_id'});setBusy(false);setNotice(error?error.message:'Ayarlar kaydedildi.');};
 const set=<K extends keyof Settings>(key:K,value:Settings[K])=>setData(p=>({...p,[key]:value}));
 const focusActive=!!data.focus_until&&new Date(data.focus_until).getTime()>Date.now();
 return <section className="vexa101-section"><h3><Shield size={17}/> Gizlilik ve aktivite</h3>
  <label>Aktivite durumum<select value={data.status} onChange={e=>set('status',e.target.value as Status)}>{Object.entries(statuses).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
  <label>Aktivite durumumu kim görebilir?<select value={data.status_visibility} onChange={e=>set('status_visibility',e.target.value as Visibility)}>{vis.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
  <label>Son görülmemi kim görebilir?<select value={data.last_seen_visibility} onChange={e=>set('last_seen_visibility',e.target.value as Visibility)}>{vis.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
  <label>Profil ayrıntılarımı kim görebilir?<select value={data.profile_visibility} onChange={e=>set('profile_visibility',e.target.value as Visibility)}>{vis.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
  <label className="vexa101-check"><input type="checkbox" checked={data.read_receipts} onChange={e=>set('read_receipts',e.target.checked)}/> Okundu bilgisi gönder</label>
  <h4><Moon size={16}/> Odak modu</h4><p className="hint">Odak modunda durumun “Rahatsız etmeyin” görünür. Uygulama içi bildirimleri susturmak için bildirim sisteminin de bu ayarı okuması gerekir.</p>
  <div className="vexa101-actions"><button type="button" onClick={()=>{set('focus_until',new Date(Date.now()+60*60000).toISOString());set('status','dnd')}}>1 saat odaklan</button><button type="button" onClick={()=>set('focus_until',null)}>Odağı kapat</button></div>
  <p className="hint">Odak: {focusActive?'Etkin':'Kapalı'}</p><button className="full" disabled={busy} onClick={()=>void save(data)}>{busy?'Kaydediliyor…':'Gizlilik ayarlarını kaydet'}</button>{notice&&<p role="status" className="hint">{notice}</p>}
 </section>
}
export function useVexaPresenceHeartbeat(userId:string|undefined){
 useEffect(()=>{if(!userId)return;let alive=true;const ping=()=>{if(alive&&document.visibilityState==='visible')void supabase.from('vexa101_privacy').upsert({user_id:userId,last_seen_at:new Date().toISOString()},{onConflict:'user_id'})};ping();const timer=window.setInterval(ping,60000);document.addEventListener('visibilitychange',ping);return()=>{alive=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',ping)}},[userId]);
}
type PublicPresence={status:Status|null;last_seen_at:string|null;profile_visible:boolean;focus_until:string|null};
export function VexaPublicPresence({userId}:{userId:string}){
 const [value,setValue]=useState<PublicPresence|null>(null);const [error,setError]=useState('');
 const load=useCallback(async()=>{const {data,error}=await supabase.rpc('vexa101_public_presence',{p_user_id:userId});if(error)setError(error.message);else setValue((data||null) as PublicPresence|null)},[userId]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer)},[load]);
 return <div className="vexa101-presence">{value?.status&&<p><Activity size={15}/> {statuses[value.status]||value.status}{value.focus_until&&new Date(value.focus_until)>new Date()?' · Odak modu':''}</p>}{value?.last_seen_at&&<p className="hint">Son görülme: {new Date(value.last_seen_at).toLocaleString('tr-TR')}</p>}{value&&!value.profile_visible&&<p className="hint">Bu kişinin profil ayrıntıları gizli.</p>}{error&&<p className="hint">Durum bilgisi alınamadı: {error}</p>}</div>
}
export function VexaProfileQR({userId}:{userId:string}){
 const [shown,setShown]=useState(false);const [copied,setCopied]=useState(false);
 const link=`${window.location.origin}/?vexa_user=${encodeURIComponent(userId)}`;
 // QR yalnızca kullanıcı isteğiyle üretilir. Harici QR servisi bağlantıyı görür.
 const src=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(link)}`;
 return <section className="vexa101-section"><h3><QrCode size={17}/> Profil QR kodum</h3><p className="hint">QR oluşturmak harici QR servisine profil bağlantını gönderir. İstersen yalnızca bağlantıyı kopyalayabilirsin.</p>
 <div className="vexa101-actions"><button type="button" onClick={()=>setShown(v=>!v)}><QrCode size={16}/>{shown?'QR kodu gizle':'QR kod oluştur'}</button><button type="button" onClick={()=>{void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setCopied(false))}}><Copy size={16}/>{copied?'Kopyalandı':'Bağlantıyı kopyala'}</button></div>{shown&&<img className="vexa101-qr" src={src} alt="Vexa profil QR kodu"/>}</section>
}
type QRDetector={detect:(input:ImageBitmapSource)=>Promise<Array<{rawValue:string}>>};
type QRDetectorCtor=new(options:{formats:string[]})=>QRDetector;
export function VexaQRFind({onFound}:{onFound:(id:string)=>void}){
 const [value,setValue]=useState(''),[error,setError]=useState(''),[scanning,setScanning]=useState(false);
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),frame=useRef<number|null>(null);
 const parse=(raw:string)=>{try{const u=new URL(raw.trim());if(u.origin!==window.location.origin)throw Error('Yalnızca bu Vexa sitesinin QR kodunu okut.');const id=u.searchParams.get('vexa_user');if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Geçerli bir Vexa profil bağlantısı gir.');onFound(id);setError('');stop()}catch(e){setError((e as Error).message)}};
 const stop=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setScanning(false)};
 useEffect(()=>()=>stop(),[]);
 const detector=()=>{const C=(window as Window&{BarcodeDetector?:QRDetectorCtor}).BarcodeDetector;if(!C)throw Error('Tarayıcın QR taramayı desteklemiyor. Chrome/Edge güncelle veya QR bağlantısını yapıştır.');return new C({formats:['qr_code']})};
 const start=async()=>{setError('');try{const d=detector();if(!navigator.mediaDevices?.getUserMedia)throw Error('Kamera için HTTPS ve kamera izni gerekli.');const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});stream.current=s;setScanning(true);await new Promise(r=>setTimeout(r,80));if(!video.current){stop();return}video.current.srcObject=s;await video.current.play();const tick=async()=>{if(!stream.current||!video.current)return;try{const codes=await d.detect(video.current);if(codes[0]?.rawValue){parse(codes[0].rawValue);return}}catch{/* continue scanning */}frame.current=requestAnimationFrame(()=>{void tick()})};void tick()}catch(e){stop();setError((e as Error).message)}};
 const fromFile=async(f:File)=>{setError('');try{const d=detector();const bitmap=await createImageBitmap(f);try{const codes=await d.detect(bitmap);if(!codes.length)throw Error('Resimde QR kodu bulunamadı.');parse(codes[0].rawValue)}finally{bitmap.close()}}catch(e){setError((e as Error).message)}};
 return <section className="vexa101-section vexa102-qr-find"><h3><ScanLine size={17}/> QR ile kişi bul</h3><p className="hint">Kamerayla tara, galeriden QR seç veya bağlantıyı yapıştır.</p><div className="vexa101-actions"><button type="button" onClick={()=>void(scanning?Promise.resolve(stop()):start())}>{scanning?'Kamerayı kapat':'Kamerayı aç'}</button><label className="vexa102-file-btn">Galeriden okut<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void fromFile(f);e.target.value=''}}/></label></div>{scanning&&<video ref={video} playsInline muted className="vexa102-qr-video"/>}<div className="vexa101-actions"><input aria-label="Profil QR bağlantısı" value={value} onChange={e=>setValue(e.target.value)} placeholder="https://.../?vexa_user=..."/><button type="button" onClick={()=>parse(value)}>Profili bul</button></div>{error&&<p role="alert" className="error">{error}</p>}</section>
}
