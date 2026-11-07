import { state, user, svg } from './core.js';

const navGroups = [
  { label: 'Workspace', items: [['dashboard', 'Home', 'grid'], ['my-health', 'My health', 'heart'], ['community', 'Community', 'chat'], ['discover', 'Discover', 'spark']] },
  { label: 'Account', items: [['profile', 'Profile', 'user']] },
  { label: 'Professional', roles: ['doctor', 'researcher', 'admin'], items: [['professional', 'Professional workspace', 'user'], ['verification', 'Credential verification', 'shield']] },
  { label: 'Platform', roles: ['admin'], items: [['admin', 'Admin overview', 'grid'], ['moderation', 'Community moderation', 'shield']] }
];

export function workspaceSidebar() {
  const role = user().role;
  const normalizedRoute = ['care', 'research', 'matches'].includes(state.route) ? 'discover' : ['health-journal','health-insights','health-records','health-conversation','talk-to-mira','timeline', 'records', 'medications', 'reports'].includes(state.route) ? 'my-health' : ['professional', 'verification', 'notifications'].includes(state.route) ? 'profile' : state.route;
  const groups = navGroups.filter(group => !group.roles || group.roles.includes(role)).map(group => {
    const items = group.items.filter(([id]) => !['doctor', 'researcher'].includes(role) || !['my-health', 'discover'].includes(id));
    return `<div class="nav-label">${group.label}</div><div class="nav-list">${items.map(([id, label, icon]) => `<button class="nav-item ${normalizedRoute === id ? 'active' : ''}" title="${label}" data-route="${id}" ${normalizedRoute === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${svg(icon)}</span><span>${label}</span>${id === 'my-health' && state.entries.length ? `<b class="nav-meta">${state.entries.length}</b>` : ''}</button>`).join('')}</div>${group.label === 'Workspace' ? '<div class="nav-separator"></div>' : ''}`;
  }).join('');
  return `<aside class="sidebar" aria-label="Workspace navigation"><a class="brand" href="/" aria-label="Vericove home"><span class="brand-mark" aria-hidden="true">${svg('heart', 19)}</span><span class="brand-word">Vericove<small>UNDERSTAND · CARE · THRIVE</small></span></a><div class="nav-scroll"><nav aria-label="Sections">${groups}</nav></div><div class="sidebar-footer"><button type="button" class="nav-item sidebar-settings ${state.route === 'settings' ? 'active' : ''}" data-route="settings" title="Settings" aria-label="Settings" ${state.route === 'settings' ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${svg('settings')}</span><span>Settings</span></button></div></aside>`;
}
