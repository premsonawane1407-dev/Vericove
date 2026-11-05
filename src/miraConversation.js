import { state, persist, esc, svg, toast, isoToday } from './core.js';
import { saveConversation, saveHealthEntry, saveHealthSummary } from './lib/healthRepository.js';
import { questionBank, validateQuestion, getNextQuestion, getCurrentQuestion, buildAnswer } from './healthQuestionEngine.js';
import './health.css';

const recognizedVoice = voice => /female|woman|samantha|serena|aria|jenny|ava|zira|hazel|susan|google uk english female/i.test(voice.name||'');
const deviceVoices = () => 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
function createSession(){
  const session=state.healthSession ||= {id:`hs-${Date.now()}`,status:'active',answers:[],createdAt:new Date().toISOString()};
  session.answers||=[];
  if(session.answers.some(answer=>!answer.questionKey)){
    session.answers=session.answers.map((answer,index)=>({questionId:index?`refinement_legacy_${index}`:'concern',questionKey:index?'refinement':'concern',category:index?'refinement':'concern',value:'other',label:answer.label||'What you shared',text:answer.text||'',custom:answer.text||''}));
    session.status='review';session.pendingQuestion=null;state.healthOtherDraft||=state.healthDraft||'';state.healthDraft='';persist();
  }
  return session;
}
function persistSession(){persist();saveConversation(createSession()).catch(error=>{console.error('Mira session sync failed',error);toast('Your answer is saved on this device. Account sync needs a connection.');});}
function selected(s,q){return s.selection?.questionId===q.id?s.selection.value:'';}
function answerHistory(s){return (s.answers||[]).map((answer,index)=>`<article class="mira-answer"><span>${esc(answer.label)}</span><p>${esc(answer.text)}</p><button type="button" data-mira-action="edit" data-index="${index}">Edit</button></article>`).join('');}
const summaryCategories=[
  {title:'Your concern and timing',keys:['concern','location','onset','frequency']},
  {title:'How it affects you',keys:['impact']},
  {title:'Other changes and context',keys:['associated','context']},
  {title:'Additional notes',keys:['refinement']},
];
const categoryNames={location:'Where you notice it',onset:'When it began',frequency:'How it happens',impact:'Effect on your usual day',associated:'Other changes'};
function summaryGaps(s){
  const answered=new Set(s.answers.map(answer=>answer.questionKey));
  const concern=s.answers.find(answer=>answer.questionKey==='concern')?.value;
  const gaps=[];
  if(['headache','pelvic','digestive'].includes(concern)&&!answered.has('location'))gaps.push('location');
  if(!answered.has('onset'))gaps.push('onset');
  if(!answered.has('pattern'))gaps.push('frequency');
  if(s.answers.find(answer=>answer.questionKey==='pattern')?.value!=='stopped'&&!answered.has('impact'))gaps.push('impact');
  if(!answered.has('associated'))gaps.push('associated');
  return gaps;
}
function summaryDetails(s){
  return summaryCategories.map(group=>{
    const rows=s.answers.filter(answer=>group.keys.includes(answer.questionKey));
    return rows.length?`<section class="summary-group"><h3>${group.title}</h3>${rows.map(answer=>`<div class="summary-row"><strong>${esc(answer.label)}</strong><p>${esc(answer.text||'No additional detail added')}</p></div>`).join('')}</section>`:'';
  }).join('');
}
function voiceControls(){
  const voices=deviceVoices(), lang=navigator.languages?.[0]||navigator.language||'en-US';
  const relevant=voices.filter(v=>v.lang?.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
  const suggested=relevant.find(recognizedVoice)||relevant.find(v=>/en/i.test(v.lang))||voices.find(recognizedVoice)||voices[0];
  if(!state.speechVoice&&suggested)state.speechVoice=suggested.name;
  return `${voices.length?`<label class="speech-setting"><span>Voice</span><select id="mira-voice" aria-label="Mira device voice"><option value="">Suggested device voice</option>${voices.map(v=>`<option value="${esc(v.name)}" ${state.speechVoice===v.name?'selected':''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}</select></label>`:''}<label class="speech-setting"><span>Speed</span><select id="mira-rate" aria-label="Speech speed">${[['0.85','Slower'],['0.95','Calm'],['1.1','Faster']].map(([v,l])=>`<option value="${v}" ${(state.speechRate||'0.95')===v?'selected':''}>${l}</option>`).join('')}</select></label>`;
}
function questionMarkup(s,q){
  const value=selected(s,q), answer=s.answers[s.editIndex], otherValue=value==='other'?(answer?.custom||state.healthOtherDraft||''):'';
  return `<article class="mira-question"><span>${esc(q.category.replaceAll('_',' ').toUpperCase())}</span><h2 tabindex="-1">${esc(q.message)}</h2><p>${esc(q.help||'')}</p><form id="mira-mcq-form" data-question-id="${esc(q.id)}" ${Number.isInteger(s.editIndex)?`data-edit-index="${s.editIndex}"`:''}><div class="mira-options" role="group" aria-label="Choose one answer">${q.options.map(option=>`<button type="button" class="mira-option ${value===option.id?'selected':''}" aria-pressed="${value===option.id}" data-mira-option="${esc(option.id)}">${esc(option.label)}</button>`).join('')}</div><section class="mira-response-tools" aria-label="Optional answer methods"><div class="mira-other-tools"><button type="button" class="text-link" data-mira-action="other" aria-controls="mira-other" aria-expanded="${value==='other'}">${svg('edit',15)} Something else? Add a few words</button><button type="button" class="text-link" data-mira-action="voice-answer" aria-label="Speak an answer">${svg('microphone',15)} Speak an answer</button></div><div id="mira-other-field" class="mira-other-field" ${value==='other'?'':'hidden'}><label for="mira-other">Your answer <span class="optional">Optional</span></label><input id="mira-other" name="other" maxlength="300" value="${esc(otherValue)}" placeholder="Add a few words…" autocomplete="off"><small>Your words stay editable until you continue.</small></div></section><div class="mira-control-groups"><section class="mira-playback-group" aria-label="Voice playback controls"><button type="button" class="mira-icon-control" data-mira-action="replay" aria-label="Replay question" title="Replay question">${svg('replay',17)}</button><button type="button" class="mira-icon-control" data-mira-action="pause-speech" aria-label="Pause or resume playback" title="Pause or resume">${svg('pause',16)}</button><button type="button" class="mira-icon-control" data-mira-action="stop-speech" aria-label="Stop playback" title="Stop">${svg('stop',16)}</button>${voiceControls()}<button type="button" class="mira-icon-control" data-mira-action="mute" aria-label="${state.voiceMuted?'Turn voice on':'Mute voice'}" title="${state.voiceMuted?'Turn voice on':'Mute voice'}">${svg('volumeOff',16)}</button></section><div class="mira-navigation"><button type="button" class="mira-finish" data-mira-action="finish">Finish early</button><button class="btn primary mira-continue" type="submit" ${!value||value==='other'&&!otherValue.trim()?'disabled':''}>Continue ${svg('arrow',15)}</button></div></div><p class="voice-status" aria-live="polite">Browser voice fallback · naturalness varies by device. No question or answer is spoken without your action.</p></form></article>`;
}
function summaryMarkup(s){
  const gaps=summaryGaps(s);
  return `<div class="health-review"><h2 tabindex="-1">Your conversation summary</h2><p class="summary-intro">A clear record of what you chose to share. This is a summary, not an assessment.</p>${summaryDetails(s)}${gaps.length?`<section class="summary-group summary-open"><h3>Not discussed</h3><p>${gaps.map(key=>categoryNames[key]).join(' · ')}</p></section>`:''}<section class="summary-ai-status"><strong>AI observations aren’t available in this preview</strong><p>No AI provider is connected. Mira’s prompts are guided demo questions; this summary only groups your answers. Symptom duration and intensity are not collected here.</p></section><p class="health-disclaimer">This is not a diagnosis. Clinician-reviewed safety guidance is not available in this preview.</p><div class="mira-actions">${s.status==='complete'?'<span class="status-tag">Conversation complete</span>':`<button class="btn" data-mira-action="edit" data-index="${Math.max(0,s.answers.length-1)}">Edit answers</button><button class="btn primary" data-mira-action="continue">Continue with Mira</button><button class="btn soft" data-mira-action="satisfied">I’m satisfied</button><button class="btn" data-mira-action="save">Save to journal</button>`}<button class="btn soft" data-mira-action="print">Prepare appointment copy</button></div></div>`;
}
export function miraConversationPage(){
  const s=createSession(), q=getCurrentQuestion(s);
  const nav=`<nav class="health-tabs" aria-label="My Health"><button class="active" aria-current="page" data-route="my-health">Overview</button><button data-route="health-journal">Journal</button><button data-route="health-insights">Insights</button><button data-route="health-records">Records</button></nav>`;
  const mira=`<span class="mira-avatar-small" aria-hidden="true"><span class="mira-flower"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span></span>`;
  const localPreview=!state.session?.authUserId||state.session?.demo;
  const notice=localPreview?`<div class="health-notice" role="note"><span>${svg('shield',15)}</span><p><strong>Local preview</strong> Sign-in is simulated, and Mira uses deterministic demo questions. Health information stays in this browser. Browser speech recognition may use your browser’s speech service; choose a card or type instead if you prefer.</p></div>`:'';
  if(!q||s.status==='review')return `${nav}${notice}<header class="health-heading conversation-heading"><div><span class="health-eyebrow">MIRA · YOUR CONVERSATION</span><h1>Let’s look at what we’ve gathered.</h1><p>Here’s a structured summary of what you reported.</p></div><button class="btn" data-mira-action="pause">Save and pause</button></header><section class="health-conversation"><div class="conversation-top"><div class="conversation-identity">${mira}<div><strong>Mira</strong><small>Guided health companion · Demo prompts</small></div></div><span class="privacy-pill">${svg('shield',13)} Private to this device</span></div>${answerHistory(s)}${summaryMarkup(s)}</section>`;
  if(!validateQuestion(q)){console.error('Invalid Mira question schema',q);return '<p role="alert">This question could not be prepared. Your saved answers are safe. Please resume the conversation.</p>';}
  return `${nav}${notice}<header class="health-heading conversation-heading"><div><span class="health-eyebrow">MIRA · GUIDED CONVERSATION</span><h1>Let’s take it one step at a time.</h1><p>Your choices shape what Mira asks next. Skip any answer you don’t want to share.</p></div><button class="btn" data-mira-action="pause">Pause</button></header><section class="health-conversation"><div class="conversation-top"><div class="conversation-identity">${mira}<div><strong>Mira</strong><small>Guided questions · Device voice fallback</small></div></div><span class="privacy-pill">${svg('shield',13)} Private to this device</span></div>${answerHistory(s)}${questionMarkup(s,q)}</section>`;
}
if('speechSynthesis'in window)speechSynthesis.addEventListener?.('voiceschanged',()=>{if(state.route==='health-conversation')document.dispatchEvent(new CustomEvent('health:refresh'));});
function selectOption(s,q,id){
  s.selection={questionId:q.id,value:id};state.healthOtherDraft=id==='other'?(state.healthOtherDraft||''):'';persist();
  const form=document.querySelector('#mira-mcq-form');form?.querySelectorAll('[data-mira-option]').forEach(option=>{const active=option.dataset.miraOption===id;option.classList.toggle('selected',active);option.setAttribute('aria-pressed',String(active));});
  const other=form?.querySelector('.mira-other-field');if(other)other.hidden=id!=='other';const next=form?.querySelector('[type="submit"]');if(next)next.disabled=id==='other'?!state.healthOtherDraft.trim():false;
  const otherToggle=form?.querySelector('[data-mira-action="other"]');otherToggle?.setAttribute('aria-expanded',String(id==='other'));
}
function submitAnswer(form){
  const s=createSession(),q=getCurrentQuestion(s);if(!q||!validateQuestion(q))return;
  const selection=s.selection?.questionId===q.id?s.selection:null;if(!selection){toast('Choose an answer to continue.');return;}
  const custom=String(form.elements.other?.value||'').trim();if(selection.value==='other'&&!custom){toast('Add a few words or choose another answer.');return;}
  const answer=buildAnswer(q,selection.value,custom);
  const index=Number(form.dataset.editIndex);
  if(Number.isInteger(index)&&form.dataset.editIndex!==''){s.answers[index]=answer;s.answers=s.answers.slice(0,index+1);delete s.editIndex;delete s.pendingQuestion;}
  else s.answers.push(answer);
  if(answer.questionKey==='concern')s.branch=['fatigue','headache','pelvic','menstrual','sleep','digestive'].includes(answer.value)?answer.value:'unknown';
  state.healthOtherDraft='';
  if(q.category==='refinement'){delete s.pendingQuestion;s.refinementIndex=null;s.status='review';}
  else{delete s.selection;delete s.pendingQuestion;const next=getNextQuestion(s);s.status=next?'active':'review';}
  persistSession();document.dispatchEvent(new CustomEvent('health:refresh'));setTimeout(()=>document.querySelector('.mira-question h2,.health-review h2')?.focus(),0);
}

document.addEventListener('click',event=>{
  const optionButton=event.target.closest('[data-mira-option]');
  if(optionButton){const s=createSession(),q=getCurrentQuestion(s);if(!q)return;selectOption(s,q,optionButton.dataset.miraOption);return;}
  const button=event.target.closest('[data-mira-action]');if(!button)return;
  const action=button.dataset.miraAction,s=createSession();
  if(action==='other'){const q=getCurrentQuestion(s);if(q?.allowOther)selectOption(s,q,'other');document.querySelector('#mira-other')?.focus();return;}
  if(action==='edit'){const index=Number(button.dataset.index),answer=s.answers[index];if(answer){s.editIndex=index;s.pendingQuestion={...(questionBank[answer.questionKey]||questionBank.refinement),id:answer.questionId,message:answer.label};s.selection={questionId:answer.questionId,value:answer.value};state.healthOtherDraft=answer.custom||'';s.status='active';persist();document.dispatchEvent(new CustomEvent('health:refresh'));}return;}
  if(action==='pause'){s.status='paused';persistSession();state.route='my-health';persist();document.dispatchEvent(new CustomEvent('health:refresh'));toast('Conversation saved on this device');return;}
  if(action==='finish'){s.pendingQuestion=null;s.status='review';s.refinementIndex=null;persistSession();document.dispatchEvent(new CustomEvent('health:refresh'));return;}
  if(action==='continue'){s.refinementIndex=(s.refinementCount||0)+1;s.refinementCount=s.refinementIndex;s.pendingQuestion={...questionBank.refinement,id:`refinement_${s.refinementIndex}`};s.selection=null;s.status='active';persist();document.dispatchEvent(new CustomEvent('health:refresh'));return;}
  if(action==='satisfied'){s.status='complete';s.pendingQuestion=null;persistSession();state.route='health-conversation';document.dispatchEvent(new CustomEvent('health:refresh'));toast('Conversation marked complete');return;}
  if(action==='save'){const first=s.answers.find(a=>a.questionKey==='concern'),entry={id:`mira-${Date.now()}`,symptom:first?.text||'Health conversation',date:isoToday,time:new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit'}).format(new Date()),note:s.answers.filter(a=>a.questionKey!=='concern').map(a=>`${a.label} ${a.text}`).join(' · '),kind:'symptom',origin:'Mira conversation · your reported information'};state.entries.unshift(entry);s.status='complete';persist();state.route='health-journal';document.dispatchEvent(new CustomEvent('health:refresh'));toast('Your reviewed summary was added to the journal');(async()=>{await saveConversation(s);await saveHealthEntry(entry);await saveHealthSummary(s);})().catch(error=>{console.error(error);toast('Summary is saved in this preview; account sync did not complete.');});return;}
  if(action==='print'){window.print();return;}
  if(action==='replay'){const q=getCurrentQuestion(s);if(!q||!('speechSynthesis'in window)){toast('Speech playback is unavailable on this device.');return;}if(state.voiceMuted){toast('Mira’s voice is muted.');return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(q.message);utterance.lang=navigator.languages?.[0]||navigator.language||'en-US';utterance.rate=Number(state.speechRate||0.95);utterance.pitch=1.02;const voice=deviceVoices().find(v=>v.name===state.speechVoice);if(voice)utterance.voice=voice;speechSynthesis.speak(utterance);return;}
  if(action==='pause-speech'){if('speechSynthesis'in window){if(speechSynthesis.paused)speechSynthesis.resume();else if(speechSynthesis.speaking)speechSynthesis.pause();}return;}
  if(action==='stop-speech'){if('speechSynthesis'in window)speechSynthesis.cancel();return;}
  if(action==='mute'){state.voiceMuted=!state.voiceMuted;if(state.voiceMuted&&'speechSynthesis'in window)speechSynthesis.cancel();persist();document.dispatchEvent(new CustomEvent('health:refresh'));return;}
  if(action==='voice-answer'){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){toast('Speech input is unavailable. Choose a card or use Something else.');return;}if('speechSynthesis'in window)speechSynthesis.cancel();const recognition=new Recognition();recognition.lang=navigator.languages?.[0]||navigator.language||'en-US';recognition.interimResults=true;recognition.continuous=false;const status=document.querySelector('.voice-status');if(status)status.textContent='Listening… Your words are not submitted automatically.';recognition.onresult=e=>{const text=Array.from(e.results).map(r=>r[0].transcript).join(' ');state.healthOtherDraft=text;const q=getCurrentQuestion(createSession());if(q)state.healthSession.selection={questionId:q.id,value:'other'};persist();document.dispatchEvent(new CustomEvent('health:refresh'));document.querySelector('#mira-other')?.focus();};recognition.onerror=e=>{const live=document.querySelector('.voice-status');if(live)live.textContent=e.error==='not-allowed'?'Microphone access was denied. You can select a card or add a short typed response.':'Speech input stopped. You can try again or choose a card.';};recognition.start();return;}
});
document.addEventListener('submit',event=>{if(event.target.id==='mira-mcq-form'){event.preventDefault();submitAnswer(event.target);}});
document.addEventListener('input',event=>{if(event.target.id==='mira-other'){state.healthOtherDraft=event.target.value;const submit=event.target.closest('form')?.querySelector('[type="submit"]');if(submit)submit.disabled=!event.target.value.trim();persist();}});
document.addEventListener('change',event=>{if(event.target.id==='mira-rate'){state.speechRate=event.target.value;persist();}if(event.target.id==='mira-voice'){state.speechVoice=event.target.value;persist();}});
