import { supabase } from './supabase.js';

let activeChannel;
let activeDbChannel;
let activeConversationId;
let inboxChannel;
const drafts = new Map();

const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(`dm:${name}`, { detail }));
const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured for this environment.');
  return supabase;
};

export async function getMessagingUser() {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function loadInbox() {
  const client = requireClient();
  const user = await getMessagingUser();
  if (!user) return { user: null, conversations: [] };
  const { data, error } = await client.rpc('dm_get_inbox');
  if (error) throw error;
  const conversations = (data || []).map(row => {
    const last = row.last_message;
    return {
      id: row.id,
      peerId: row.peer_id,
      name: row.display_name || 'Vericove member',
      handle: row.handle ? `@${row.handle}` : '',
      avatar: row.avatar_url || '',
      preview: last?.content || (last?.message_type ? `Sent a ${last.message_type}` : 'Start a conversation'),
      time: last?.created_at || row.updated_at,
      lastMessage: last,
      lastReadAt: row.last_read_at,
      peerReadAt: row.peer_read_at,
      unread: Boolean(last && last.sender_id !== user.id && (!row.last_read_at || new Date(last.created_at) > new Date(row.last_read_at))),
      request: row.request,
      requestPending: row.request_status === 'pending',
      canRespond: Boolean(row.can_respond),
      requestId: row.request_id,
      requestStatus: row.request_status,
      muted: row.muted,
      archived: row.archived,
      messages: [],
      loaded: false,
    };
  });
  window.__dmUserId = user.id;
  return { user, conversations };
}

export async function loadMessages(conversationId, before) {
  const client = requireClient();
  let query = client.from('dm_messages').select('id,conversation_id,sender_id,content,message_type,reply_to_message_id,created_at,edited_at,deleted_at,dm_reactions(emoji,user_id),dm_attachments(storage_path,file_name,mime_type,file_size)').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
  if (before) query = query.lte('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  return Promise.all((data || []).reverse().map(async message => {
    const attachment = Array.isArray(message.dm_attachments) ? message.dm_attachments[0] : message.dm_attachments;
    let signedUrl = '';
    if (attachment?.storage_path) {
      const signed = await client.storage.from('private-dm-files').createSignedUrl(attachment.storage_path, 300);
      if (!signed.error) signedUrl = signed.data.signedUrl;
    }
    return { ...message, from: message.sender_id === (window.__dmUserId || '') ? 'me' : 'them', text: message.deleted_at ? 'Message deleted' : message.content || attachment?.file_name || '', reactions: message.dm_reactions || [], attachment: attachment ? { ...attachment, signedUrl } : null };
  }));
}

export async function searchPeople(query) {
  if (!query.trim()) return [];
  const { data, error } = await requireClient().rpc('dm_search_people', { query: query.trim() });
  if (error) throw error;
  return data || [];
}

export async function startRequest(handle, content) {
  const { data, error } = await requireClient().rpc('dm_start_request', { target_handle: handle.replace(/^@/, ''), initial_content: content.trim() });
  if (error) throw error;
  await refreshInbox();
  return data;
}

export async function respondToRequest(requestId, accept) {
  const { error } = await requireClient().rpc('dm_respond_request', { target_request: requestId, accept });
  if (error) throw error;
  await refreshInbox();
}

export async function sendMessage(conversationId, text, replyToMessageId = null) {
  const client = requireClient();
  const user = await getMessagingUser();
  if (!user) throw new Error('Sign in to send a private message.');
  const optimistic = { id: `pending-${crypto.randomUUID()}`, conversation_id: conversationId, sender_id: user.id, from: 'me', text, content: text, created_at: new Date().toISOString(), pending: true, reactions: [] };
  emit('optimistic-message', { conversationId, message: optimistic });
  const { data, error } = await client.from('dm_messages').insert({ conversation_id: conversationId, sender_id: user.id, content: text.trim(), reply_to_message_id: replyToMessageId }).select('id,conversation_id,sender_id,content,message_type,reply_to_message_id,created_at,edited_at,deleted_at').single();
  if (error) {
    emit('send-failed', { conversationId, messageId: optimistic.id, error: error.message });
    throw error;
  }
  emit('message-sent', { conversationId, pendingId: optimistic.id, message: { ...data, from: 'me', text: data.content, reactions: [] } });
  await client.from('dm_conversations').update({ updated_at: data.created_at, last_message_at: data.created_at }).eq('id', conversationId);
  return data;
}

export async function markRead(conversationId) {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client.from('dm_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', user.id);
  if (error) throw error;
}

export async function toggleReaction(messageId, emoji, selected) {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to react to messages.');
  const result = selected
    ? await client.from('dm_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji)
    : await client.from('dm_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
  if (result.error) throw result.error;
}

export async function editMessage(messageId, content) {
  const { data: { user } } = await requireClient().auth.getUser();
  if (!user) throw new Error('Sign in to edit messages.');
  const { error } = await requireClient().from('dm_messages').update({ content: content.trim(), edited_at: new Date().toISOString() }).eq('id', messageId).eq('sender_id', user.id);
  if (error) throw error;
}

export async function deleteMessage(messageId) {
  const { data: { user } } = await requireClient().auth.getUser();
  if (!user) throw new Error('Sign in to delete messages.');
  const { error } = await requireClient().from('dm_messages').update({ content: '', deleted_at: new Date().toISOString() }).eq('id', messageId).eq('sender_id', user.id);
  if (error) throw error;
}

export async function loadPreferences() {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to change messaging preferences.');
  const { data, error } = await client.from('dm_user_preferences').select('allow_message_requests,show_read_receipts,show_online_status').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data || { allow_message_requests: false, show_read_receipts: true, show_online_status: false };
}

export async function savePreferences(preferences) {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to change messaging preferences.');
  const { error } = await client.from('dm_user_preferences').upsert({ user_id: user.id, ...preferences, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function blockUser(userId) {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to manage blocked accounts.');
  const existing = await client.from('dm_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;
  const { error } = await client.from('dm_blocks').insert({ blocker_id: user.id, blocked_id: userId });
  if (error) throw error;
}

export async function reportUser(userId, conversationId, messageId, reason) {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to report this account.');
  const { error } = await client.from('dm_reports').insert({ reporter_id: user.id, reported_user_id: userId, conversation_id: conversationId || null, message_id: messageId || null, reason: reason.trim() });
  if (error) throw error;
}

const acceptedTypes = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'],
  ['application/pdf', '.pdf'], ['text/plain', '.txt'],
  ['audio/webm', '.webm'], ['audio/ogg', '.ogg'], ['audio/mp4', '.m4a'],
]);

export async function sendAttachment(conversationId, file, messageType = 'file') {
  const client = requireClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in to share an attachment.');
  if (!(file instanceof Blob) || file.size < 1 || file.size > 50 * 1024 * 1024) throw new Error('Choose a file under 50 MB.');
  const mime = String(file.type || '').split(';')[0].toLowerCase();
  if (!acceptedTypes.has(mime)) throw new Error('This file type is not supported.');
  const attachmentId = crypto.randomUUID();
  const storagePath = `${conversationId}/${user.id}/${attachmentId}${acceptedTypes.get(mime)}`;
  const { error: uploadError } = await client.storage.from('private-dm-files').upload(storagePath, file, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const { data: message, error: messageError } = await client.from('dm_messages').insert({ conversation_id: conversationId, sender_id: user.id, content: '', message_type: messageType }).select('id,conversation_id,sender_id,content,message_type,created_at').single();
  if (messageError) { await client.storage.from('private-dm-files').remove([storagePath]); throw messageError; }
  const safeName = String(file.name || 'attachment').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 255);
  const { error: metadataError } = await client.from('dm_attachments').insert({ message_id: message.id, storage_path: storagePath, file_name: safeName, mime_type: mime, file_size: file.size });
  if (metadataError) { await client.from('dm_messages').update({ deleted_at: new Date().toISOString(), content: '' }).eq('id', message.id); await client.storage.from('private-dm-files').remove([storagePath]); throw metadataError; }
  return { ...message, from: 'me', text: safeName, attachment: { storage_path: storagePath, file_name: safeName, mime_type: mime, file_size: file.size } };
}

export async function searchMessages(query) {
  const { data, error } = await requireClient().rpc('dm_search_messages', { query: query.trim() });
  if (error) throw error;
  return data || [];
}

export async function getMessageTimestamp(messageId) {
  const { data, error } = await requireClient().from('dm_messages').select('created_at').eq('id', messageId).single();
  if (error) throw error;
  return data.created_at;
}

export async function refreshInbox() {
  const inbox = await loadInbox();
  emit('inbox', inbox);
  return inbox;
}

export function getDraft(conversationId) { return drafts.get(conversationId) || ''; }
export function setDraft(conversationId, value) { drafts.set(conversationId, value); }

export function stopConversation() {
  if (activeChannel) requireClient().removeChannel(activeChannel);
  if (activeDbChannel) requireClient().removeChannel(activeDbChannel);
  activeChannel = null;
  activeDbChannel = null;
  activeConversationId = null;
}

export async function watchConversation(conversationId) {
  const client = requireClient();
  if (activeConversationId === conversationId && activeChannel) return;
  stopConversation();
  activeConversationId = conversationId;
  activeDbChannel = client.channel(`dm-data:${conversationId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${conversationId}` }, payload => emit('message-change', { conversationId, payload }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_reactions' }, payload => emit('reaction-change', { conversationId, payload }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_participants', filter: `conversation_id=eq.${conversationId}` }, payload => emit('read-change', { conversationId, payload }))
    .subscribe();
  activeChannel = client.channel(`dm:${conversationId}`, { config: { private: true } })
    .on('broadcast', { event: 'typing' }, payload => emit('typing', { conversationId, payload: payload.payload }))
    .subscribe();
  return activeDbChannel;
}

export async function sendTyping(conversationId, isTyping) {
  if (!activeChannel || activeConversationId !== conversationId) return;
  const { data: { user } } = await requireClient().auth.getUser();
  if (user) await activeChannel.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id, isTyping } });
}

export function watchInbox() {
  const client = requireClient();
  if (inboxChannel) return inboxChannel;
  inboxChannel = client.channel('dm:inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => refreshInbox().catch(error => emit('error', { error: error.message })))
    .subscribe();
  return inboxChannel;
}

export function stopInbox() {
  if (inboxChannel) requireClient().removeChannel(inboxChannel);
  inboxChannel = null;
}

export async function refreshDmInbox() {
  return refreshInbox();
}
