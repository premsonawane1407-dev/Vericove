import { state } from './core.js';
import { render, setAuthMode } from './views.js';
import './interactions.js';
import './responsive.css';
document.addEventListener('health:refresh',render);
const isCommunityPath=/^\/community(?:\/w\/[a-z0-9-]+|\/(?:explore|reels|communities|messages|notifications|profile))?\/?$/i.test(location.pathname);
if(isCommunityPath){
  state.route='community';
  const communityRoute=location.pathname.match(/^\/community\/w\/([a-z0-9-]+)/i);
  const sectionRoute=location.pathname.match(/^\/community\/(explore|reels|communities|messages|notifications|profile)/i);
  state.communitySection=communityRoute?'communities':sectionRoute?.[1]||'home';
  state.selectedCommunitySlug=communityRoute?.[1]||'';
  if(state.communitySection==='explore')state.communitySearch=new URLSearchParams(location.search).get('q')||'';
}
// A fresh visit to the root URL always starts on the public homepage, even
// when this browser has a remembered workspace session.
if (!isCommunityPath) setAuthMode('landing');
render();
