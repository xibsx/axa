// PWA Installation Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67+ from automatically showing prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Show install button (if you want)
  showInstallButton();
});

function showInstallButton() {
  const installBtn = document.getElementById('installPWA');
  if(installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', installPWA);
  }
}

function installPWA() {
  if(!deferredPrompt) return;
  
  // Show install prompt
  deferredPrompt.prompt();
  
  // Wait for user response
  deferredPrompt.userChoice.then((choiceResult) => {
    if(choiceResult.outcome === 'accepted') {
      console.log('User accepted install');
    } else {
      console.log('User dismissed install');
    }
    deferredPrompt = null;
  });
}

// Check if app is installed
window.addEventListener('appinstalled', () => {
  console.log('SAMS installed as PWA');
  // Hide install button
  const installBtn = document.getElementById('installPWA');
  if(installBtn) installBtn.style.display = 'none';
});

// Check online/offline status
function updateOnlineStatus() {
  if(navigator.onLine) {
    document.body.classList.remove('offline');
    // Trigger sync when coming online
    if('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync.register('sync-attendance');
      });
    }
  } else {
    document.body.classList.add('offline');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
