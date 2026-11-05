import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBank, validateQuestion, getNextQuestion, getCurrentQuestion, buildAnswer } from '../src/healthQuestionEngine.js';

function answer(session, question, value){session.answers.push(buildAnswer(question,value));}
function afterConcern(concern){const session={status:'active',answers:[]};answer(session,questionBank.concern,concern);return session;}

test('all MCQ question schemas have unique selectable options and mappings',()=>{
  for(const question of Object.values(questionBank)){
    assert.equal(validateQuestion(question),true,question.id);
    assert.equal(new Set(question.options.map(option=>option.id)).size,question.options.length);
    for(const option of question.options)assert.ok(question.answerMapping[option.id]);
  }
});

test('fatigue follow-ups are contextual and use different wording',()=>{
  const session=afterConcern('fatigue');
  assert.equal(getCurrentQuestion(session).id,'onset');
  answer(session,questionBank.onset,'few_days');
  assert.equal(getCurrentQuestion(session).id,'pattern_energy');
});

test('headache, pelvic and digestive concerns ask a location follow-up',()=>{
  for(const concern of ['headache','pelvic','digestive'])assert.equal(getNextQuestion(afterConcern(concern)).id,'location');
});

test('menstrual changes use a cycle-specific onset prompt without a location question',()=>{
  const session=afterConcern('menstrual');
  assert.equal(getCurrentQuestion(session).id,'onset_cycle');
  answer(session,questionBank.onset,'week');
  assert.equal(getCurrentQuestion(session).id,'pattern');
});

test('sleep changes skip irrelevant location questions',()=>{
  assert.equal(getNextQuestion(afterConcern('sleep')).id,'onset');
});

test('unknown concerns use open-ended fallback followed by useful general questions',()=>{
  const session=afterConcern('other');
  assert.equal(getNextQuestion(session).id,'onset');
});

test('a resolved experience skips the impact prompt',()=>{
  const session=afterConcern('fatigue');
  answer(session,questionBank.onset,'yesterday');
  answer(session,questionBank.pattern,'stopped');
  assert.equal(getNextQuestion(session).id,'associated');
});

test('no associated changes ends the interview without an unnecessary context question',()=>{
  const session=afterConcern('sleep');
  answer(session,questionBank.onset,'few_days');
  answer(session,questionBank.pattern,'comes_goes');
  answer(session,questionBank.impact,'little');
  answer(session,questionBank.associated,'none');
  assert.equal(getNextQuestion(session),null);
});

test('completion and refinement remain user controlled',()=>{
  const session={status:'active',answers:[],refinementIndex:1,pendingQuestion:{...questionBank.refinement,id:'refinement_1'}};
  assert.equal(getCurrentQuestion(session).id,'refinement_1');
  session.status='complete';
  assert.equal(getCurrentQuestion(session),null);
});
