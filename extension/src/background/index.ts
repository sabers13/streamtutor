import { DEFAULT_SETTINGS } from '../types';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[GermanTutor] Extension installed.');
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
});
