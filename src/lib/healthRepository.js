import { supabase } from './supabase.js';

export async function currentHealthUser(){
  if(!supabase)return null;
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  return data.session?.user||null;
}

export async function loadHealthData(){
  const user=await currentHealthUser();if(!user)return null;
  const [entries,documents,sessions]=await Promise.all([
    supabase.from('health_entries').select('*').eq('user_id',user.id).order('occurred_on',{ascending:false}),
    supabase.from('health_documents').select('*').eq('user_id',user.id).order('uploaded_at',{ascending:false}),
    supabase.from('health_sessions').select('*').eq('user_id',user.id).in('status',['active','paused','review']).order('updated_at',{ascending:false}).limit(1),
  ]);
  for(const result of [entries,documents,sessions])if(result.error)throw result.error;
  return {
    entries:(entries.data||[]).map(row=>({id:row.id,kind:row.kind,symptom:row.title,note:row.details,date:row.occurred_on,severity:row.severity==='not_recorded'?'':row.severity?.replace(/^./,s=>s.toUpperCase()),origin:row.origin})),
    records:(documents.data||[]).map(row=>({id:row.id,name:row.title,type:row.category,date:row.uploaded_at.slice(0,10),storagePath:row.storage_path,mimeType:row.mime_type})),
    session:sessions.data?.[0]||null,
  };
}

export async function saveHealthEntry(entry){
  const user=await currentHealthUser();if(!user)return {local:true};
  const row={user_id:user.id,kind:entry.kind||'symptom',title:entry.symptom||entry.title,details:entry.note||'',occurred_on:entry.date,severity:entry.severity?entry.severity.toLowerCase():'not_recorded',origin:entry.origin?.toLowerCase().includes('mira')?'mira':'manual'};
  if(entry.id&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(entry.id)))row.id=entry.id;
  const {data,error}=await supabase.from('health_entries').upsert(row).select().single();if(error)throw error;return {local:false,id:data.id};
}

export async function deleteHealthEntry(id){
  const user=await currentHealthUser();if(!user||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(id)))return;
  const {error}=await supabase.from('health_entries').delete().eq('id',id).eq('user_id',user.id);if(error)throw error;
}

export async function saveConversation(session){
  const user=await currentHealthUser();if(!user)return {local:true};
  let sessionId=session.remoteId;
  if(sessionId){const {error}=await supabase.from('health_sessions').update({status:session.status,branch:session.branch,state:{answers:session.answers}}).eq('id',sessionId).eq('user_id',user.id);if(error)throw error;}
  else{const {data,error}=await supabase.from('health_sessions').insert({user_id:user.id,status:session.status,branch:session.branch,state:{answers:session.answers}}).select('id').single();if(error)throw error;sessionId=data.id;session.remoteId=sessionId;}
  const messages=(session.answers||[]).map(a=>({session_id:sessionId,user_id:user.id,role:'user',content:a.text,question_key:a.questionKey}));
  if(messages.length){const {error}=await supabase.from('health_messages').delete().eq('session_id',sessionId).eq('user_id',user.id);if(error)throw error;const {error:insertError}=await supabase.from('health_messages').insert(messages);if(insertError)throw insertError;}
  return {local:false,id:sessionId};
}

export async function saveHealthSummary(session){
  const user=await currentHealthUser();if(!user||!session.remoteId)return {local:true};
  const facts=Object.fromEntries((session.answers||[]).map(a=>[a.questionKey,a.text]));
  const {error}=await supabase.from('health_summaries').insert({user_id:user.id,session_id:session.remoteId,title:'Mira conversation summary',reported_facts:facts,observations:[],approved_for_export:false});
  if(error)throw error;return {local:false};
}

export async function uploadHealthDocument(file,title,category='document'){
  const user=await currentHealthUser();if(!user)throw new Error('A verified account session is required for private uploads.');
  const allowed=['application/pdf','image/jpeg','image/png'];if(!allowed.includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PDF, JPG or PNG file under 10 MB.');
  const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg',path=`${user.id}/${crypto.randomUUID()}.${ext}`;
  const upload=await supabase.storage.from('private-health-records').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
  const saved=await supabase.from('health_documents').insert({user_id:user.id,title,category,storage_path:path,mime_type:file.type,byte_size:file.size}).select().single();
  if(saved.error){await supabase.storage.from('private-health-records').remove([path]);throw saved.error;}
  return saved.data;
}

export async function getHealthDocumentUrl(path){
  const user=await currentHealthUser();if(!user||!String(path).startsWith(`${user.id}/`))throw new Error('You do not have access to this document.');
  const {data,error}=await supabase.storage.from('private-health-records').createSignedUrl(path,60);if(error)throw error;return data.signedUrl;
}

export async function deleteHealthDocument(id,path){
  const user=await currentHealthUser();if(!user||!String(path).startsWith(`${user.id}/`))return;
  const {error}=await supabase.from('health_documents').delete().eq('id',id).eq('user_id',user.id);if(error)throw error;
  const removed=await supabase.storage.from('private-health-records').remove([path]);if(removed.error)throw removed.error;
}
