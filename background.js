// Background service worker for Read It Later extension

// Import the core logic
importScripts('read-later-core.js');

// Listen for command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !ReadLaterCore.isSavableTab(tab)) {
        showNotification('Cannot save this page', 'Special pages like chrome:// and edge:// cannot be saved');
        return;
      }

      // Load existing entries
      const result = await chrome.storage.local.get(['readLaterItems']);
      const entries = result.readLaterItems || [];

      // Build entry from tab
      const entry = ReadLaterCore.buildEntryFromTab(tab, Date.now());

      // Check if already saved
      const existingIndex = entries.findIndex(e => e.url === entry.url);

      if (existingIndex >= 0) {
        // Already saved - remove it (toggle behavior)
        entries.splice(existingIndex, 1);
        await chrome.storage.local.set({ readLaterItems: entries });

        // Show notification
        showNotification('Removed from Read It Later', entry.title);
      } else {
        // Add new entry at the top
        entries.unshift(entry);
        await chrome.storage.local.set({ readLaterItems: entries });

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
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: title,
    message: message,
    silent: true
  });

  // Auto-clear notification after 2 seconds
  setTimeout(() => {
    chrome.notifications.getAll((notifications) => {
      Object.keys(notifications).forEach((id) => {
        chrome.notifications.clear(id);
      });
    });
  }, 2000);
}
