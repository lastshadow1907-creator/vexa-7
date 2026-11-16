import {useEffect,useState} from 'react';
import {Camera,Trash2} from 'lucide-react';
import {supabase} from './supabase';

type Identity={user_id:string;handle:string;tag_number:number;created_at:string};
export function useVexaIdentity(userId:string|undefined){
 const [identity,setIdentity]=useState<Identity|null>(null);
 useEffect(()=>{if(!userId){setIdentity(null);return;}let alive=true;void supabase.from('vexa91_identity').select('user_id,handle,tag_number,created_at').eq('user_id',userId).maybeSingle().then(({data})=>{if(alive)setIdentity(data as Identity|null)});return()=>{alive=false}},[userId]);
 return identity;
}
export function VexaIdentity({userId}:{userId:string}){
 const identity=useVexaIdentity(userId);
 return <p className="vexa9-tag">{identity?`${identity.handle}#${String(identity.tag_number).padStart(4,'0')}`:'Etiket hazırlanıyor…'}</p>;
}
export function VexaJoined({userId}:{userId:string}){
 const [joined,setJoined]=useState<string|null>(null);
 useEffect(()=>{let alive=true;void supabase.from('vexa91_identity').select('created_at').eq('user_id',userId).maybeSingle().then(({data})=>{if(alive)setJoined(data?.created_at||null)});return()=>{alive=false}},[userId]);
 return <p className="hint">Kayıt tarihi: {joined?new Date(joined).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'Bilinmiyor'}</p>;
}
export function VexaAvatarEditor({userId,onChange}:{userId:string;onChange:(url:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upload(file:File){
  if(!file.type.startsWith('image/')||file.type==='image/svg+xml'||file.size>3*1024*1024){setError('JPG, PNG, WEBP veya GIF; en fazla 3 MB.');return;}
  setBusy(true);setError('');
  try{
   const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/gif'?'gif':'jpg';
   const path=`${userId}/avatar-${Date.now()}.${ext}`;
   const {error:e}=await supabase.storage.from('vexa-avatars').upload(path,file,{contentType:file.type,upsert:false});if(e)throw e;
   const url=supabase.storage.from('vexa-avatars').getPublicUrl(path).data.publicUrl;
   const {error:saveError}=await supabase.from('profiles').update({avatar_path:url}).eq('id',userId);if(saveError)throw saveError;
   onChange(url);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function remove(){setBusy(true);const {error:e}=await supabase.from('profiles').update({avatar_path:null}).eq('id',userId);if(e)setError(e.message);else onChange('');setBusy(false)}
 return <div className="vexa91-upload"><label><Camera size={16}/> Fotoğraf seç<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=''}}/></label><button className="ghost" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/> Kaldır</button>{error&&<p className="error">{error}</p>}</div>;
}
export function VexaTagEditor({userId}:{userId:string}){
 const identity=useVexaIdentity(userId);
 const [premium,setPremium]=useState(false),[handle,setHandle]=useState(''),[number,setNumber]=useState(''),[info,setInfo]=useState('');
 useEffect(()=>{if(identity){setHandle(identity.handle);setNumber(String(identity.tag_number).padStart(4,'0'))}},[identity]);
 useEffect(()=>{void supabase.from('vexa9_accounts').select('premium_until').eq('user_id',userId).maybeSingle().then(({data})=>setPremium(!!data?.premium_until&&new Date(data.premium_until)>new Date()))},[userId]);
 async function change(){setInfo('');const {error}=await supabase.rpc('vexa91_change_tag',{p_handle:handle.toLowerCase(),p_number:Number(number)});setInfo(error?.message||'Etiket değiştirildi. Güncel halini görmek için sayfayı yenile.');}
 return <div className="vexa9-settings"><h3>Etiket özelleştirme</h3><p className="hint">Otomatik etiket herkese ücretsiz. Değiştirme şu an Premium ile kullanılabilir. İki ödüllü reklam seçeneği, doğrulama altyapısı kurulunca açılacak.</p><input aria-label="Etiket adı" disabled={!premium} value={handle} onChange={e=>setHandle(e.target.value.toLowerCase())} maxLength={20}/><input aria-label="Etiket numarası" disabled={!premium} value={number} onChange={e=>setNumber(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4}/><button disabled={!premium||handle.length<3||!Number(number)} onClick={()=>void change()}>Etiketi değiştir</button>{info&&<p className="hint">{info}</p>}</div>;
}
