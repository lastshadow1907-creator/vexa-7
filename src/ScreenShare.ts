type Reply = {id?:string;ok?:boolean;session?:string;state?:string;frame?:string;number?:number};
type Bridge = {postMessage:(s:string)=>void;onmessage:((e:MessageEvent)=>void)|null};
const bridge = () => (window as unknown as {VexaScreenNative?:Bridge}).VexaScreenNative;
let sequence=0;
export function hasNativeScreen(){return !!bridge()}
function request(action:string,session='',last=-1):Promise<Reply>{
 const b=bridge(); if(!b)return Promise.reject(Error('Yeni Android APK gerekli.'));
 return new Promise((resolve,reject)=>{const id=String(++sequence);const previous=b.onmessage;const finish=()=>{clearTimeout(timer);if(b.onmessage===handler)b.onmessage=previous};const handler=(e:MessageEvent)=>{try{const r=JSON.parse(e.data) as Reply;if(r.id!==id){previous?.(e);return}finish();if(r.ok)resolve(r);else reject(Error('Android ekran paylaşımı başlatılamadı.'))}catch{}};const timer=setTimeout(()=>{finish();reject(Error('Android ekran bağlantısı zaman aşımına uğradı.'))},4000);b.onmessage=handler;try{b.postMessage(JSON.stringify({id,action,session,last}))}catch(e){finish();reject(e)}});
}
export async function nativeScreenStream(signal:AbortSignal,onStopped:()=>void):Promise<MediaStream>{
 const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
 const ctx=canvas.getContext('2d');if(!ctx||!canvas.captureStream)throw Error('Android WebView ekran aktarımını desteklemiyor.');
 let session='',stopped=false,last=-1,timer:ReturnType<typeof setTimeout>|undefined,stream:MediaStream|undefined;
 const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);signal.removeEventListener('abort',stop);stream?.getTracks().forEach(t=>t.stop());if(session)void request('stop',session).catch(()=>{});};
 signal.addEventListener('abort',stop,{once:true});
 try{
  if(signal.aborted)throw Error('Paylaşım iptal edildi.');
  const begin=await request('start');session=begin.session||'';if(!session)throw Error('Ekran oturumu oluşturulamadı.');
  if(stopped){void request('stop',session).catch(()=>{});throw Error('Paylaşım iptal edildi.')}
  const draw=async(r:Reply)=>{if(!r.frame||stopped)return;const img=new Image();img.src='data:image/jpeg;base64,'+r.frame;await img.decode();if(stopped)return;if(canvas.width!==img.width||canvas.height!==img.height){canvas.width=img.width;canvas.height=img.height}ctx.drawImage(img,0,0);last=r.number??last;};
  const deadline=Date.now()+60000;
  while(!stopped){const r=await request('poll',session,last);if(r.state==='running'&&r.frame){await draw(r);break}if(['stopped','denied','error','idle'].includes(r.state||'')||Date.now()>deadline)throw Error('Ekran izni verilmedi veya paylaşım başlatılamadı.');await new Promise(r=>setTimeout(r,250));}
  if(stopped)throw Error('Paylaşım iptal edildi.');
  stream=canvas.captureStream(5);
  const loop=async()=>{if(stopped)return;try{const r=await request('poll',session,last);if(r.state!=='running')throw Error('Paylaşım durdu.');await draw(r);if(!stopped)timer=setTimeout(()=>void loop(),200)}catch{if(!stopped){stop();onStopped()}}};
  timer=setTimeout(()=>void loop(),200);return stream;
 }catch(e){stop();throw e}
}
