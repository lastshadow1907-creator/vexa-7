
import {useCallback,useEffect,useState} from 'react';
import {Crown,Hash,Save,ExternalLink} from 'lucide-react';
import {supabase} from './supabase';

type Account = {
  user_id:string;
  hashtag:string|null;
  premium_until:string|null;
  animated_avatar_url:string|null;
  profile_theme:string;
};

type Ad = {
  id:string;
  title:string;
  description:string|null;
  image_url:string|null;
  destination_url:string|null;
};

const validUrl = (url:string) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

export function useVexaAccount(userId:string|undefined) {
  const [account,setAccount] = useState<Account|null>(null);
  const [loading,setLoading] = useState(true);

  const refresh = useCallback(async()=>{
    if(!userId){
      setAccount(null);
      setLoading(false);
      return;
    }

    const {data} = await supabase
      .from('vexa9_accounts')
      .select('*')
      .eq('user_id',userId)
      .maybeSingle();

    setAccount(data as Account|null);
    setLoading(false);
  },[userId]);

  useEffect(()=>{
    void refresh();
  },[refresh]);

  const premium = Boolean(
    account?.premium_until &&
    new Date(account.premium_until).getTime() > Date.now()
  );

  return {account,premium,loading,refresh};
}

export function PremiumBadge({active}:{active:boolean}) {
  if(!active)return null;

  return (
    <span className="vexa9-premium-badge" title="Vexa Premium">
      <Crown size={13}/> Premium
    </span>
  );
}

export function VexaSettings({userId}:{userId:string}) {
  const {account,premium,refresh} = useVexaAccount(userId);
  const [hashtag,setHashtag] = useState('');
  const [avatar,setAvatar] = useState('');
  const [theme,setTheme] = useState('green');
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState('');

  useEffect(()=>{
    setHashtag(account?.hashtag||'');
    setAvatar(account?.animated_avatar_url||'');
    setTheme(account?.profile_theme||'green');
  },[account]);

  async function save(){
    setSaving(true);
    setMessage('');

    const {error} = await supabase.rpc('vexa9_save_profile',{
      p_hashtag:hashtag,
      p_avatar:premium && avatar.trim()?avatar.trim():null,
      p_theme:premium?theme:'green'
    });

    if(error)setMessage(error.message);
    else {
      setMessage('Ayarlar kaydedildi.');
      await refresh();
    }

    setSaving(false);
  }

  return (
    <section className="vexa9-settings">
      <h3><Hash size={18}/> Vexa etiketi</h3>
      <p className="hint">
        Diğer kullanıcıların seni bulabileceği benzersiz etiket.
      </p>

      <input
        value={hashtag}
        onChange={e=>setHashtag(
          e.target.value.toLowerCase().replace(/^#/,'')
        )}
        maxLength={24}
        placeholder="olcay_09"
      />

      <h3><Crown size={18}/> Vexa Premium</h3>

      <PremiumBadge active={premium}/>

      <p className="hint">
        {premium
          ? `Premium bitiş: ${new Date(
              account!.premium_until!
            ).toLocaleDateString('tr-TR')}`
          : 'Ücretsiz hesap. Premium henüz aktif değil.'}
      </p>

      <label>Hareketli profil görseli (HTTPS GIF bağlantısı)</label>
      <input
        type="url"
        value={avatar}
        disabled={!premium}
        onChange={e=>setAvatar(e.target.value)}
        placeholder="https://site.com/avatar.gif"
      />

      {premium && validUrl(avatar) && (
        <img
          src={avatar}
          alt="Hareketli profil önizlemesi"
          className="vexa9-avatar-preview"
        />
      )}

      <label>Profil teması</label>
      <select
        value={theme}
        disabled={!premium}
        onChange={e=>setTheme(e.target.value)}
      >
        <option value="green">Vexa Yeşil</option>
        <option value="blue">Mavi</option>
        <option value="purple">Mor</option>
        <option value="rose">Pembe</option>
      </select>

      <button
        className="full"
        disabled={saving||hashtag.trim().length<3}
        onClick={()=>void save()}
      >
        <Save size={16}/> Kaydet
      </button>

      {message && <p className="hint">{message}</p>}

      <p className="hint">
        Premium satın alma altyapısı bağlanana kadar
        bu ekran üzerinden ödeme alınmaz.
      </p>
    </section>
  );
}

export function VexaAds({userId}:{userId:string}) {
  const {premium,loading} = useVexaAccount(userId);
  const [ads,setAds] = useState<Ad[]>([]);

  useEffect(()=>{
    if(loading||premium)return;

    let active=true;

    void supabase
      .from('vexa9_ads')
      .select('id,title,description,image_url,destination_url')
      .eq('active',true)
      .limit(1)
      .then(({data})=>{
        if(active)setAds((data||[]) as Ad[]);
      });

    return ()=>{active=false};
  },[loading,premium]);

  if(loading||premium||!ads.length)return null;

  return (
    <section className="vexa9-ad-area">
      {ads.map(ad=>(
        <div className="vexa9-ad" key={ad.id}>
          <small>Reklam</small>
          {ad.image_url && validUrl(ad.image_url) && (
            <img src={ad.image_url} alt=""/>
          )}
          <strong>{ad.title}</strong>
          {ad.description && <p>{ad.description}</p>}
          {ad.destination_url && validUrl(ad.destination_url) && (
            <a
              href={ad.destination_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              İncele <ExternalLink size={13}/>
            </a>
          )}
        </div>
      ))}
    </section>
  );
}

export function VexaPublicProfile({
  userId,
  displayName,
  bio,
  onMessage
}:{
  userId:string;
  displayName:string;
  bio?:string|null;
  onMessage:()=>void;
}) {
  const {account,premium} = useVexaAccount(userId);

  return (
    <section className="vexa9-public-profile">
      {account?.animated_avatar_url &&
       validUrl(account.animated_avatar_url) && premium && (
        <img
          src={account.animated_avatar_url}
          alt="Profil fotoğrafı"
          className="vexa9-public-avatar"
        />
      )}

      <h2>{displayName}</h2>
      <PremiumBadge active={premium}/>

      <p className="vexa9-tag">
        {account?.hashtag?'#'+account.hashtag:'Etiket yok'}
      </p>

      <p>{bio||'Hakkımda bilgisi yok.'}</p>

      <button className="full" onClick={onMessage}>
        Mesaj gönder
      </button>
    </section>
  );
}
