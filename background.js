importScripts('shared.js');

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tm-fill-field', title: 'Fill with temp email', contexts: ['editable'] });
    chrome.contextMenus.create({ id: 'tm-fill-pass', title: 'Fill with generated password', contexts: ['editable'] });
    chrome.contextMenus.create({ id: 'tm-fill-form', title: 'Autofill form with TempMail', contexts: ['page', 'editable'] });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  createMenus();
  await TM.setupAlarm();
  TM.ensureEmail().then(() => TM.refreshInbox()).catch(() => {});
});

chrome.runtime.onStartup.addListener(async () => {
  await TM.setupAlarm();
  TM.refreshInbox({ notify: true }).catch(() => {});
});

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'poll') TM.refreshInbox({ notify: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  try {
    const cur = await TM.ensureEmail();
    if (info.menuItemId === 'tm-fill-field') await TM.fillFocused(tab.id, info.frameId, cur.email);
    else if (info.menuItemId === 'tm-fill-pass') await TM.fillFocused(tab.id, info.frameId, cur.identity.password);
    else if (info.menuItemId === 'tm-fill-form') await TM.autofill(tab.id);
  } catch (e) { console.warn('TempMail:', e); }
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'autofill-form') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) TM.autofill(tab.id).catch(e => console.warn('TempMail:', e));
});

chrome.notifications.onClicked.addListener(id => chrome.notifications.clear(id));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ensure') {
    TM.ensureEmail().then(c => sendResponse({ email: c.email })).catch(() => sendResponse(null));
    return true;
  }
  if (msg && msg.type === 'autofill' && sender.tab) {
    TM.autofill(sender.tab.id).then(n => sendResponse({ filled: n })).catch(() => sendResponse(null));
    return true;
  }
});
