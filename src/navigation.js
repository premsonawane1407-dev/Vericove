import { state, user, userAvatar, svg, esc, roleName } from './core.js';

const navGroups = [
  { label: 'Workspace', items: [['dashboard', 'Home', 'grid'], ['my-health', 'My health', 'heart'], ['community', 'Community', 'chat'], ['discover', 'Discover', 'spark']] },
  { label: 'Account', items: [['profile', 'Profile', 'user']] },
  { label: 'Professional', roles: ['doctor', 'researcher', 'admin'], items: [['professional', 'Professional workspace', 'user'], ['verification', 'Credential verification', 'shield']] },
  { label: 'Platform', roles: ['admin'], items: [['admin', 'Admin overview', 'grid'], ['moderation', 'Community moderation', 'shield']] }
];

export function workspaceSidebar() {
  const role = user().role;
  const normalizedRoute = ['care', 'research', 'matches'].includes(state.route) ? 'discover' : ['health-journal','health-insights','health-records','health-conversation','timeline', 'records', 'medications', 'reports'].includes(state.route) ? 'my-health' : ['professional', 'verification', 'notifications'].includes(state.route) ? 'profile' : state.route;
  const groups = navGroups.filter(group => !group.roles || group.roles.includes(role)).map(group => {
    const items = group.items.filter(([id]) => !['doctor', 'researcher'].includes(role) || !['my-health', 'discover'].includes(id));
    return `<div class="nav-label">${group.label}</div><div class="nav-list">${items.map(([id, label, icon]) => `<button class="nav-item ${normalizedRoute === id ? 'active' : ''}" title="${label}" data-route="${id}"><span class="nav-icon">${svg(icon)}</span><span>${label}</span>${id === 'my-health' && state.entries.length ? `<b class="nav-meta">${state.entries.length}</b>` : ''}</button>`).join('')}</div>${group.label === 'Workspace' ? '<div class="nav-separator"></div>' : ''}`;
  }).join('');
  return `<aside class="sidebar"><a class="brand" href="/" aria-label="Vericove home"><span class="brand-mark">${svg('heart', 19)}</span><span class="brand-word">Vericove<small>UNDERSTAND · CARE · THRIVE</small></span></a><div class="nav-scroll">${groups}</div><div class="sidebar-footer"><div class="privacy-mini"><strong>${svg('shield', 14)}Your choices matter</strong><p>This demo stores sample information in your browser. Don’t enter real health details.</p></div><button type="button" class="nav-item sidebar-settings ${state.route === 'settings' ? 'active' : ''}" data-route="settings" title="Settings" aria-label="Settings"><span class="nav-icon">${svg('settings')}</span><span>Settings</span></button>${state.route==='settings'?'':`<div class="account">${userAvatar()}<div><strong>${esc(user().name || user().handle)}</strong><small>${roleName(user().role)} account</small></div><button class="account-menu" data-action="account-menu" aria-label="Account menu">${svg('more', 16)}</button></div>`}</div></aside>`;
}
