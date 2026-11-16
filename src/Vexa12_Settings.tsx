import {useEffect,useState} from 'react';
import {supabase} from './supabase';

const colors=[['emerald','Zümrüt','#49c984'],['ocean','Okyanus','#65a8ff'],['violet','Mor','#b38bfa'],['rose','Pembe','#ff8bb8'],['amber','Turuncu','#ffb66b']] as const;
type ThemeMode='dark'|'light';
export function applyVexaTheme(color:string,mode:ThemeMode){
 const found=colors.find(x=>x[0]===color)||colors[0];
 document.documentElement.dataset.vexaTheme=color;
 document.documentElement.dataset.vexaMode=mode;
 document.documentElement.style.setProperty('--vexa12-accent',found[2]);
}
export default function Vexa12Settings({userId}:{userId:string}){
 const key='vexa12-theme-'+userId;
 const [color,setColor]=useState('emerald'),[mode,setMode]=useState<ThemeMode>('dark');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [email,setEmail]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [query,setQuery]=useState(''),[matches,setMatches]=useState<{id:number;body:string|null;created_at:string}[]>([]);
 const [wallpaper,setWallpaper]=useState('none');
 useEffect(()=>{
  try{const t=JSON.parse(localStorage.getItem(key)||'{}') as {color?:string;mode?:ThemeMode;wallpaper?:string};
   const c=t.color||'emerald',m=t.mode==='light'?'light':'dark';
   setColor(c);setMode(m);setWallpaper(t.wallpaper||'none');applyVexaTheme(c,m);
  }catch{applyVexaTheme('emerald','dark')}
 },[key]);
 function save(c:string,m:ThemeMode,w:string){
  localStorage.setItem(key,JSON.stringify({color:c,mode:m,wallpaper:w}));
  applyVexaTheme(c,m);document.documentElement.dataset.vexaWallpaper=w;
 }
 async function changePassword(){
  setNotice('');
  if(password.length<8){setNotice('Şifre en az 8 karakter olmalı.');return}
  if(password!==confirm){setNotice('Şifreler eşleşmiyor.');return}
  setBusy(true);
  const {error}=await supabase.auth.updateUser({password});
  setBusy(false);setNotice(error?error.message:'Şifren güncellendi.');if(!error){setPassword('');setConfirm('')}
 }
 async function changeEmail(){
  setNotice('');if(!email.includes('@')){setNotice('Geçerli e-posta gir.');return}
  setBusy(true);const {error}=await supabase.auth.updateUser({email:email.trim()});
  setBusy(false);setNotice(error?error.message:'E-posta değişikliği için doğrulama mesajlarını kontrol et.');
 }
 async function signOutOthers(){
  setBusy(true);const {error}=await supabase.auth.signOut({scope:'others'});
  setBusy(false);setNotice(error?error.message:'Diğer oturumları kapatma isteği gönderildi.');
 }
 async function searchMessages(){
  const q=query.trim();if(q.length<2){setNotice('En az iki karakter yaz.');return}
  setBusy(true);setNotice('');
  const escaped=q.replace(/[%_,()]/g,' ').trim();
  const {data,error}=await supabase.from('messages').select('id,body,created_at')
   .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
   .ilike('body',`%${escaped}%`).order('created_at',{ascending:false}).limit(40);
  setBusy(false);if(error)setNotice(error.message);else setMatches(data||[]);
 }
 return <section className="vexa12-settings">
  <header className="vexa12-heading"><h2>Görünüm ve hesap</h2><p>Vexa'yı kendine göre düzenle. Tercihler bu tarayıcıda saklanır.</p></header>
  <div className="vexa12-panel"><h3>Renk teması</h3><div className="vexa12-swatches">
   {colors.map(([id,label,hex])=><button key={id} type="button" aria-pressed={color===id} onClick={()=>{setColor(id);save(id,mode,wallpaper)}}><span style={{background:hex}}/>{label}</button>)}
  </div><label className="vexa12-field">Görünüm<select value={mode} onChange={e=>{const m=e.target.value as ThemeMode;setMode(m);save(color,m,wallpaper)}}><option value="dark">Koyu</option><option value="light">Açık</option></select></label>
  <label className="vexa12-field">Sohbet arka planı<select value={wallpaper} onChange={e=>{setWallpaper(e.target.value);save(color,mode,e.target.value)}}><option value="none">Düz</option><option value="dots">Noktalar</option><option value="grid">Izgara</option></select></label></div>
  <div className="vexa12-panel"><h3>Şifremi değiştir</h3><p>Hesabına giriş yaptıysan yeni şifre belirleyebilirsin.</p>
   <label className="vexa12-field">Yeni şifre<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8}/></label>
   <label className="vexa12-field">Yeni şifre tekrar<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
   <button disabled={busy} onClick={()=>void changePassword()}>Şifreyi güncelle</button></div>
  <div className="vexa12-panel"><h3>E-posta ve oturumlar</h3>
   <label className="vexa12-field">Yeni e-posta<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="yeni@ornek.com"/></label>
   <div className="vexa12-actions"><button disabled={busy} onClick={()=>void changeEmail()}>E-posta değiştir</button><button disabled={busy} onClick={()=>void signOutOthers()}>Diğer oturumlardan çıkış yap</button></div>
   <p>İki aşamalı doğrulama için Supabase MFA kurulumu ayrıca gereklidir; bu ekran MFA etkinleştirmez.</p></div>
  <div className="vexa12-panel"><h3>Mesajlarında ara</h3>
   <form className="vexa12-actions" onSubmit={e=>{e.preventDefault();void searchMessages()}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mesaj metni ara"/><button disabled={busy}>Ara</button></form>
   {matches.map(m=><div className="vexa12-result" key={m.id}><small>{new Date(m.created_at).toLocaleString('tr-TR')}</small><p>{m.body}</p></div>)}
  </div>
  {notice&&<p role="status" className="vexa12-notice">{notice}</p>}
 </section>
}
