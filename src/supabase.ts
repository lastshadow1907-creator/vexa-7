import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key);
export const supabase=createClient(url||'https://placeholder.supabase.co',key||'placeholder');
export type Profile={id:string;username?:string;display_name?:string|null;bio?:string|null;avatar_path?:string|null;cover_url?:string|null};
export type FriendRequest={id:string;sender_id:string;recipient_id:string;status:string};
export type Message={id:string;sender_id:string;recipient_id:string;body:string|null;created_at:string;deleted_at?:string|null};
