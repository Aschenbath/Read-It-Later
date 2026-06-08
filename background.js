// Background service worker for Read It Later extension

// Import the core logic
importScripts('read-later-core.js');

// Listen for command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    try {
      const storageKey = ReadLaterCore.STORAGE_KEY;
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !ReadLaterCore.isSavableTab(tab)) {
        showNotification('Cannot save this page', 'This page type is not supported');
        return;
      }

      // Load existing entries
      const result = await chrome.storage.local.get([storageKey]);
      const entries = Array.isArray(result[storageKey])
        ? result[storageKey].map(entry => ReadLaterCore.normalizeEntry(entry))
        : [];

      // Build entry from tab
      const entry = ReadLaterCore.buildEntryFromTab(tab, Date.now());

      // Check if already saved
      const existingEntry = ReadLaterCore.findEntryByUrl(entries, entry.url);

      if (existingEntry) {
        // Already saved - remove it (toggle behavior)
        const next = ReadLaterCore.deleteEntry(entries, existingEntry.id);
        await chrome.storage.local.set({ [storageKey]: next.entries });

        // Show notification
        showNotification('Removed from Read It Later', entry.title);
      } else {
        // Add new entry through shared dedupe/sort logic
        const next = ReadLaterCore.upsertEntry(entries, entry);
        await chrome.storage.local.set({ [storageKey]: next.entries });

        // Show notification
        showNotification('Saved to Read It Later', entry.title);
      }
    } catch (error) {
      console.error('Failed to save page:', error);
    }
  }
});

// Show a notification to the user
function showNotification(title, message) {
  const notificationId = `read-later-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: title,
    message: message,
    silent: true
  });

  // Auto-clear notification after 2 seconds
  setTimeout(() => {
    chrome.notifications.clear(notificationId);
  }, 2000);
}
