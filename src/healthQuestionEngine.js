const asOptions = pairs => pairs.map(([id,label])=>({id,label}));

export const questionBank = {
  concern:{id:'concern',category:'concern',message:'What would you like to talk through today?',help:'Choose the closest fit. You can add a few words if none feels right.',allowOther:true,options:asOptions([['fatigue','A change in my energy'],['headache','Head discomfort'],['pelvic','Pelvic or lower abdominal discomfort'],['menstrual','A change in my menstrual cycle'],['sleep','A change in my sleep'],['digestive','Digestive discomfort'],['other','Something else'],['unsure','I’m not sure']]),followUps:['onset','pattern','impact','associated','context']},
  onset:{id:'onset',category:'onset',message:'When did you first notice this?',help:'An estimate is completely fine.',allowOther:true,options:asOptions([['today','Today'],['yesterday','Yesterday'],['few_days','A few days ago'],['week','About a week ago'],['weeks','A few weeks ago'],['month','More than a month ago'],['unsure','I’m not sure'],['na','Not applicable'],['other','Something else']]),followUps:['pattern']},
  location:{id:'location',category:'location',message:'Where do you notice it most?',help:'A broad description is enough.',allowOther:true,options:asOptions([['one_area','Mostly in one area'],['several_areas','In a few different areas'],['moves','It moves around'],['unsure','I’m not sure'],['na','Not applicable'],['other','Something else']]),followUps:['pattern']},
  pattern:{id:'pattern',category:'frequency',message:'How has it been happening?',help:'Choose the description that comes closest.',allowOther:true,options:asOptions([['continuous','Most of the time'],['comes_goes','It comes and goes'],['certain_times','At certain times'],['stopped','It has stopped for now'],['unsure','I’m not sure'],['na','Not applicable'],['other','Something else']]),followUps:['impact','associated']},
  impact:{id:'impact',category:'impact',message:'How has this been affecting your usual day?',help:'There is no right answer.',allowOther:true,options:asOptions([['little','I notice it, but it has little effect'],['some','It changes some of what I do'],['a_lot','It makes usual activities difficult'],['varies','It varies from day to day'],['unsure','I’m not sure'],['na','Not applicable'],['other','Something else']]),followUps:['associated']},
  associated:{id:'associated',category:'associated',message:'Have you noticed any other changes alongside this?',help:'You can keep this general or skip it.',allowOther:true,options:asOptions([['none','No other changes that I’ve noticed'],['some','Yes, there have been other changes'],['unsure','I’m not sure'],['na','Not applicable'],['prefer_not','I’d rather not say'],['other','Something else']]),followUps:['context']},
  context:{id:'context',category:'context',message:'Has anything else changed around the same time?',help:'Only share context that feels relevant to you.',allowOther:true,options:asOptions([['stress','Stress or routine has changed'],['health','Another health change or treatment'],['nothing','Nothing else comes to mind'],['unsure','I’m not sure'],['na','Not applicable'],['prefer_not','I’d rather not say'],['other','Something else']]),followUps:[]},
  refinement:{id:'refinement',category:'refinement',message:'Is there anything else you’d like me to understand?',help:'I’ll keep what you have already shared and add only what you choose.',allowOther:true,options:asOptions([['timing','A detail about when it happens'],['change','A change since it began'],['another','Another observation'],['other','Something else'],['none','Nothing more for now']]),followUps:[]},
};

for(const question of Object.values(questionBank)){
  question.followUpCategories=question.followUps;
  question.answerMapping=Object.fromEntries(question.options.map(option=>[option.id,{category:question.category,value:option.id}]));
  question.completionRelevance=question.category==='context'||question.category==='refinement'?'optional':'relevant';
}

export function validateQuestion(question){
  return Boolean(question?.id&&question.category&&question.message&&Array.isArray(question.options)&&question.options.length>1&&question.followUpCategories&&question.answerMapping&&question.completionRelevance&&new Set(question.options.map(option=>option.id)).size===question.options.length);
}
const hasAnswer=(session,key)=>(session.answers||[]).some(answer=>answer.questionKey===key);
export function getNextQuestion(session){
  if(session.status==='complete')return null;
  if(Number.isInteger(session.editIndex))return questionBank[session.answers[session.editIndex]?.questionKey]||null;
  const concern=session.answers.find(answer=>answer.questionKey==='concern')?.value;
  if(!concern)return questionBank.concern;
  const branch=['fatigue','headache','pelvic','menstrual','sleep','digestive'].includes(concern)?concern:'unknown';
  if(['headache','pelvic','digestive'].includes(branch)&&!hasAnswer(session,'location'))return questionBank.location;
  if(!hasAnswer(session,'onset'))return questionBank.onset;
  if(!hasAnswer(session,'pattern'))return questionBank.pattern;
  if(session.answers.find(answer=>answer.questionKey==='pattern')?.value!=='stopped'&&!hasAnswer(session,'impact'))return questionBank.impact;
  if(!hasAnswer(session,'associated'))return questionBank.associated;
  if(session.answers.find(answer=>answer.questionKey==='associated')?.value==='none')return null;
  if(!hasAnswer(session,'context'))return questionBank.context;
  return null;
}
export function getCurrentQuestion(session){
  if(session.status==='complete')return null;
  if(session.pendingQuestion)return session.pendingQuestion;
  if(session.status==='review'||session.status==='complete')return null;
  const question=getNextQuestion(session);if(!question)return null;
  if(question===questionBank.onset&&session.answers.find(answer=>answer.questionKey==='concern')?.value==='menstrual')return {...question,id:'onset_cycle',message:'When did you first notice this change in your cycle?'};
  if(question===questionBank.pattern&&session.answers.find(answer=>answer.questionKey==='concern')?.value==='fatigue')return {...question,id:'pattern_energy',message:'Has this change in your energy been there most days, or does it come and go?'};
  return question;
}
export function normalizeQuestionKey(id){return id.replace(/_cycle|_energy|_\d+$/,'');}
export function buildAnswer(question, value, custom=''){
  const option=question.options.find(item=>item.id===value);
  return {questionId:question.id,questionKey:normalizeQuestionKey(question.id),category:question.category,value,label:question.message,text:value==='other'?custom:option?.label||'',custom:value==='other'?custom:''};
}
