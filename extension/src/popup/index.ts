import { DEFAULT_SETTINGS, TutorSettings, CefrLevel, OverlayPosition } from '../types';
import { backendClient } from '../services/backend-client';

document.addEventListener('DOMContentLoaded', async () => {
  const tutorEnabledInput = document.getElementById('tutor-enabled') as HTMLInputElement;
  const aiEnabledInput = document.getElementById('ai-enabled') as HTMLInputElement;
  const thresholdSelect = document.getElementById('threshold-select') as HTMLSelectElement;
  const userLevelSelect = document.getElementById('user-level-select') as HTMLSelectElement;
  const positionSelect = document.getElementById('position-select') as HTMLSelectElement;
  const backendUrlInput = document.getElementById('backend-url') as HTMLInputElement;
  const checkBackendBtn = document.getElementById('check-backend-btn') as HTMLButtonElement;
  const backendStatusBadge = document.getElementById('backend-status-badge') as HTMLElement;
  const backendDetails = document.getElementById('backend-details') as HTMLElement;
  const openTestPageBtn = document.getElementById('open-test-page-btn') as HTMLButtonElement;

  // 1. Load settings from storage
  let settings: TutorSettings = { ...DEFAULT_SETTINGS };
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
      settings = { ...DEFAULT_SETTINGS, ...stored };
    }
  } catch (e) {
    console.warn('Storage read error:', e);
  }

  tutorEnabledInput.checked = settings.enabled;
  if (aiEnabledInput) aiEnabledInput.checked = settings.aiEnabled !== false;
  thresholdSelect.value = settings.threshold;
  userLevelSelect.value = settings.userLevel;
  if (positionSelect) positionSelect.value = settings.position || 'bottom';
  backendUrlInput.value = settings.backendUrl;

  // Helper to save settings
  const save = async (changes: Partial<TutorSettings>) => {
    settings = { ...settings, ...changes };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set(settings);
    }
  };

  // Event handlers for inputs
  tutorEnabledInput.addEventListener('change', () => {
    save({ enabled: tutorEnabledInput.checked });
  });

  if (aiEnabledInput) {
    aiEnabledInput.addEventListener('change', () => {
      save({ aiEnabled: aiEnabledInput.checked });
    });
  }

  thresholdSelect.addEventListener('change', () => {
    save({ threshold: thresholdSelect.value as CefrLevel });
  });

  userLevelSelect.addEventListener('change', () => {
    save({ userLevel: userLevelSelect.value as CefrLevel });
  });

  if (positionSelect) {
    positionSelect.addEventListener('change', () => {
      save({ position: positionSelect.value as OverlayPosition });
    });
  }

  backendUrlInput.addEventListener('change', () => {
    const cleanUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    save({ backendUrl: cleanUrl });
    checkBackend();
  });

  // Flashcards UI elements
  const flashcardCountBadge = document.getElementById('flashcard-count-badge') as HTMLElement;
  const downloadCsvBtn = document.getElementById('download-csv-btn') as HTMLButtonElement;
  const clearFlashcardsBtn = document.getElementById('clear-flashcards-btn') as HTMLButtonElement;

  const updateFlashcardCount = async () => {
    if (!flashcardCountBadge) return;
    const url = backendUrlInput.value.trim();
    const count = await backendClient.getFlashcardCount(url);
    flashcardCountBadge.textContent = `${count} saved`;
  };

  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      const url = backendUrlInput.value.trim();
      const exportUrl = backendClient.getExportUrl('csv', url);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: exportUrl });
      } else {
        window.open(exportUrl, '_blank');
      }
    });
  }

  if (clearFlashcardsBtn) {
    clearFlashcardsBtn.addEventListener('click', async () => {
      if (!confirm('Clear all saved flashcards from file and database?')) return;
      const url = backendUrlInput.value.trim();
      await backendClient.clearFlashcards(url);
      await updateFlashcardCount();
    });
  }

  // Check backend health
  const checkBackend = async () => {
    const url = backendUrlInput.value.trim();
    backendStatusBadge.textContent = 'Checking...';
    backendStatusBadge.className = 'badge';

    const res = await backendClient.checkHealth(url);
    if (res.ok) {
      backendStatusBadge.textContent = 'Online';
      backendStatusBadge.className = 'badge badge-online';
      const count = res.data?.cache_entries ?? 0;
      const prov = res.data?.provider ?? 'ready';
      backendDetails.textContent = `Provider: ${prov} • Cached items: ${count}`;
      updateFlashcardCount();
    } else {
      backendStatusBadge.textContent = 'Offline';
      backendStatusBadge.className = 'badge badge-offline';
      backendDetails.textContent = `Error: ${res.error}`;
    }
  };

  checkBackendBtn.addEventListener('click', checkBackend);

  // Open Test Page
  openTestPageBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('test-page.html') });
    } else {
      window.open('test-page.html', '_blank');
    }
  });

  // Initial check
  checkBackend();
  updateFlashcardCount();
});
