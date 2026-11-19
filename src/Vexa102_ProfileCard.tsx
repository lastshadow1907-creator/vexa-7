import {useState} from 'react';
import {X,MessageCircle,UserPlus,Copy,CalendarDays,ShieldCheck} from 'lucide-react';
import {VexaIdentity,VexaJoined} from './Vexa92_Profile';
import {VexaPublicPresence} from './Vexa102_Privacy';
import type {Profile} from './supabase';
export function Vexa102ProfileCard({profile,selfId,isFriend,onClose,onAdd,onMessage}:{profile:Profile;selfId:string;isFriend:boolean;onClose:()=>void;onAdd:()=>void;onMessage:()=>void}){
 const [copied,setCopied]=useState(false);
 const display=profile.display_name?.trim()||profile.username||'Vexa kullanıcısı';
 const avatar=profile.avatar_path&&/^https:\/\//.test(profile.avatar_path)?profile.avatar_path:null;
 const link=`${window.location.origin}/?vexa_user=${encodeURIComponent(profile.id)}`;
 return <div className="vexa102-card">
  <div className="vexa102-cover" style={profile.cover_url?{backgroundImage:`linear-gradient(transparent,rgba(0,0,0,.4)),url(${profile.cover_url})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}><span className="vexa102-brand">Vexa · Profil</span><button className="vexa102-close" aria-label="Kapat" onClick={onClose}><X size={20}/></button></div>
  <div className="vexa102-avatar">{avatar?<img src={avatar} alt={`${display} profil fotoğrafı`}/>:display.charAt(0).toUpperCase()}</div>
  <div className="vexa102-body"><h2>{display}</h2><VexaIdentity userId={profile.id}/><VexaPublicPresence userId={profile.id}/>
   {profile.bio&&<p className="vexa102-bio">{profile.bio}</p>}
   <div className="vexa102-details"><span><CalendarDays size={16}/><VexaJoined userId={profile.id}/></span><span><ShieldCheck size={16}/>Vexa kullanıcısı</span></div>
   <div className="vexa102-buttons">{profile.id!==selfId&&(isFriend?<button className="vexa102-primary" onClick={onMessage}><MessageCircle size={17}/> Mesaj gönder</button>:<button className="vexa102-primary" onClick={onAdd}><UserPlus size={17}/> Arkadaş ekle</button>)}<button onClick={()=>void navigator.clipboard.writeText(link).then(()=>setCopied(true))}><Copy size={16}/>{copied?'Kopyalandı':'Profili paylaş'}</button></div>
  </div>
 </div>
}
