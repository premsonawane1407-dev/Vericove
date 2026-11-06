export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE = 'Vericove-demo-v2';
const today = new Date();
export const isoToday = today.toISOString().slice(0,10);
export const dateLabel = new Intl.DateTimeFormat('en', { month:'short', day:'numeric' }).format(today);
// No source-backed research records are configured in this local preview yet.
export const researchPapers = [];
const iconPaths = {
  grid:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  heart:'<path d="M20.8 8.5c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.5Z"/><path d="M7.5 12h2l1.2-2.5 2.1 5 1.4-2.5H17"/>',
  pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  flask:'<path d="M9 3h6M10 3v6l-5.3 8.6A2.3 2.3 0 0 0 6.7 21h10.6a2.3 2.3 0 0 0 2-3.4L14 9V3"/><path d="M8 15h8"/>',
  chat:'<path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 21 11.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01" stroke-width="2.5"/>',
  pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  file:'<path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h8"/>',
  bookmark:'<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trend:'<path d="M4 18V6M4 18h17M8 15l4-4 3 2 5-6"/>',
  spark:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
  up:'<path d="m7 14 5-5 5 5"/>',
  down:'<path d="m7 10 5 5 5-5"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M4 18a2.5 2.5 0 0 1 2.5-2.5H20"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.8 1.8 0 0 0-1.9 0l-.2.1h-3.4l-.1-.2a1.8 1.8 0 0 0-1.5-1l-.2-.1-1.7-2.9.1-.2a1.8 1.8 0 0 0 0-1.8l-.1-.2V10l.2-.1a1.8 1.8 0 0 0 1-1.5l.1-.2 2.9-1.7.2.1a1.8 1.8 0 0 0 1.8 0l.2-.1h3.4l.1.2a1.8 1.8 0 0 0 1.5 1l.2.1 1.7 2.9-.1.2a1.8 1.8 0 0 0 0 1.8l.1.2v3.4l-.2.1a1.8 1.8 0 0 0-1 1.5"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  close:'<path d="m18 6-12 12M6 6l12 12"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  comment:'<path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 21 11.5Z"/>',
  sort:'<path d="M4 6h16M7 12h10m-7 6h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v4h16v-4"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  play:'<path d="m8 5 12 7-12 7V5Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  replay:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.5 15"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  volume:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  volumeOff:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3.2a2 2 0 0 1-.6 1.7L7.2 10.4a16 16 0 0 0 6.4 6.4l1.8-1.8a2 2 0 0 1 1.7-.6l3.2.5a2 2 0 0 1 1.7 2Z"/>',
  video:'<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  microphone:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
};
export const svg = (name, size=17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.spark}</svg>`;
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const initials = name => String(name||'A').split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('');
const defaultState = () => ({
  session:{loggedIn:false,demo:true,name:'',email:'',role:'patient',handle:'QuietRiver',avatarTone:''},
  route:'dashboard',
  entries:[
    {id:1,symptom:'Pelvic discomfort',date:isoToday,time:'9:20 AM',severity:'Moderate',duration:'About 2 hours',note:'More noticeable after a restless night.'},
    {id:2,symptom:'Low energy',date:'2026-11-01',time:'2:10 PM',severity:'Mild',duration:'Most of the afternoon',note:'Energy felt lower than usual.'},
    {id:3,symptom:'Dizziness',date:'2026-10-29',time:'10:45 AM',severity:'Mild',duration:'A few minutes',note:'Happened after standing up quickly.'},
    {id:4,symptom:'Pelvic discomfort',date:'2026-10-27',time:'7:30 PM',severity:'Moderate',duration:'About 1 hour',note:'Rest helped a little.'}
  ],
  records:[
    {name:'Complete blood count',type:'Lab result',date:'2026-10-28',file:'CBC_Oct_2026.pdf'},
    {name:'Primary care visit notes',type:'Consultation',date:'2026-10-16',file:'Visit_notes.pdf'},
    {name:'Current prescription',type:'Prescription',date:'2026-10-02',file:'Prescription.pdf'}
  ],
  medications:[],
  publications:[],
  enquiries:[],
  posts:[
    {id:'p1',author:'QuietRiver',time:'2 hr ago',community:'Endometriosis support',tag:'Question',title:'How do you prepare for an appointment when you have a lot to explain?',body:'I have been keeping notes, but I still worry that I will forget something important when I am in the room. What has helped you feel a little more prepared?',visualQuote:'Your questions deserve the time they need.',visualTone:'rose',votes:28,comments:[{author:'SoftMorning',text:'A one page timeline made a big difference for me. I put my top three questions at the top.'},{author:'MapleSky',text:'I bring someone I trust if I can. You deserve to take your time.'}],voted:false,saved:false},
    {id:'p2',author:'SoftMorning',time:'5 hr ago',community:'Living with chronic pain',tag:'Experience',title:'A small thing that helped me feel heard at my last visit',body:'I started each visit with the one thing affecting my day the most, then shared my notes. It made the conversation feel more focused for me. Sharing in case it helps someone else.',visualQuote:'Start with what matters most today.',visualTone:'sage',votes:46,comments:[{author:'QuietRiver',text:'Thank you for sharing this. I might try leading with the thing that is affecting my day most.'}],voted:false,saved:false},
    {id:'p3',author:'KindOak',time:'1 day ago',community:'Women’s health questions',tag:'Experience',title:'A note on tracking symptoms between visits',body:'I started noting when something happened, how long it lasted and what else was going on. It helped me remember what I wanted to ask at my next visit.',visualQuote:'Small notes can make space for patterns.',visualTone:'blue',votes:21,comments:[{author:'QuietRiver',text:'The reminder about duration is helpful.'}],voted:false,saved:false}
  ],
  followed:['Endometriosis support','Living with chronic pain'],
  communityTopics:['Women’s health','Mental wellness','Reproductive health','PCOS','Research & science','Personal stories'],
  followedTopics:[],
  exploreCategory:'For You',
  exploreRecentSearches:[],
  exploreLiked:[],
  exploreSaved:[],
  savedProviders:[],
  savedPapers:[],
  reviews:[],
  reports:[],
  notifications:[{title:'A new discussion in Endometriosis support',time:'1 hr ago',read:false},{title:'New research in a topic you follow',time:'Yesterday',read:false}],
  notificationSettings:{messages:true,community:true,productUpdates:false},
  uiTheme:'light',
  viewedSampleStories:[],
  storyLikes:[],
  consent:{researchMatching:false,sharedReports:false},
  profile:{location:'Boston, MA',specialty:'',privacy:true}
});
export let state;
export const sessionMedia = new Map();
try { state = {...defaultState(), ...JSON.parse(localStorage.getItem(STORE)||'{}')}; }
catch { state=defaultState(); }
state.session ||= defaultState().session;
state.entries ||= defaultState().entries;
state.records ||= defaultState().records;
state.medications ||= [];
state.publications ||= [];
state.enquiries ||= [];
state.posts ||= defaultState().posts;
state.stories ||= [];
state.communityView ||= 'FYP';
state.savedPapers ||= [];
state.reports ||= [];
state.route ||= 'dashboard';
state.uiTheme ||= 'light';
export const persist = () => {
  // Authenticated health content stays in memory and Supabase, not browser storage.
  const snapshot = state.session?.authUserId
    ? { ...state, entries: [], records: [], healthSession: null, healthDraft: '' }
    : state;
  localStorage.setItem(STORE, JSON.stringify(snapshot));
};
export const app = $('#app');
let toastTimer;
export function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2500)}
export const roleName = role => ({patient:'Patient',doctor:'Doctor',researcher:'Researcher',explorer:'Public explorer',admin:'Administrator'}[role]||'Patient');
export const user = () => state.session || {name:'Guest',role:'explorer',handle:'Guest'};
export const userAvatar = (who=user()) => {const crop=who.avatarCrop||{x:50,y:50,zoom:1};return `<span class="avatar ${esc(who.avatarTone||'')}">${who.avatar?`<img src="${esc(who.avatar)}" alt="" style="object-position:${Number(crop.x??50)}% ${Number(crop.y??50)}%;transform:scale(${Number(crop.zoom??1)})" />`:esc(initials(who.displayName||who.name||who.handle||'A'))}</span>`};
export const fmtDate = raw => { if(!raw) return ''; try{return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${raw}T12:00:00`))}catch{return raw} };

