/* ===== SAMS Offline Module ===== */

class SamsOffline {
    constructor() {
        this.syncInProgress = false;
        this.queue = this.loadQueue();
        this.initListeners();
    }
    
    // Initialize event listeners
    initListeners() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    // Handle coming online
    handleOnline() {
        console.log('Connection restored');
        this.showNotification('Connection restored', 'success');
        if(this.queue.length > 0) {
            this.sync();
        }
    }
    
    // Handle going offline
    handleOffline() {
        console.log('Going offline');
        this.showNotification(CONFIG.messages.offline, 'warning');
    }
    
    // Load queue from storage
    loadQueue() {
        const saved = localStorage.getItem(CONFIG.storage.offlineQueue);
        return saved ? JSON.parse(saved) : [];
    }
    
    // Save queue to storage
    saveQueue() {
        localStorage.setItem(CONFIG.storage.offlineQueue, JSON.stringify(this.queue));
    }
    
    // Add item to queue
    addToQueue(item) {
        const queueItem = {
            id: this.generateId(),
            type: item.type || 'attendance',
            data: item.data,
            timestamp: new Date().toISOString(),
            retries: 0
        };
        
        this.queue.push(queueItem);
        this.saveQueue();
        this.updateBadge();
        
        // Try to sync immediately if online
        if(navigator.onLine) {
            this.sync();
        }
        
        return queueItem.id;
    }
    
    // Remove from queue
    removeFromQueue(id) {
        this.queue = this.queue.filter(item => item.id !== id);
        this.saveQueue();
        this.updateBadge();
    }
    
    // Sync all pending items
    async sync() {
        if(this.syncInProgress || this.queue.length === 0) return;
        
        this.syncInProgress = true;
        this.updateSyncStatus('syncing');
        
        for(const item of [...this.queue]) {
            try {
                const success = await this.syncItem(item);
                if(success) {
                    this.removeFromQueue(item.id);
                } else {
                    item.retries++;
                    if(item.retries >= 3) {
                        this.markAsFailed(item.id);
                    }
                }
            } catch(error) {
                console.error('Sync failed:', item.id, error);
            }
        }
        
        this.syncInProgress = false;
        this.updateSyncStatus('idle');
        
        if(this.queue.length === 0) {
            this.showNotification('All data synced!', 'success');
        }
    }
    
    // Sync single item
    async syncItem(item) {
        try {
            let endpoint = '';
            let method = 'POST';
            
            switch(item.type) {
                case 'attendance':
                    endpoint = '/api/attendance';
                    break;
                case 'comment':
                    endpoint = '/api/comments';
                    break;
                default:
                    endpoint = '/api/sync';
            }
            
            const response = await fetch(`${CONFIG.api.base}${endpoint}`, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.data)
            });
            
            return response.ok;
        } catch(error) {
            console.error('Sync error:', error);
            return false;
        }
    }
    
    // Save attendance offline
    saveAttendance(eventId, location) {
        const currentUser = Auth.getCurrentUser();
        if(!currentUser) return false;
        
        const attendance = {
            regNumber: currentUser.regNumber,
            eventId: eventId,
            timestamp: new Date().toISOString(),
            location: location,
            synced: false
        };
        
        // Store in pending attendance
        let pending = this.getPendingAttendance();
        pending.push(attendance);
        localStorage.setItem(CONFIG.storage.pendingAttendance, JSON.stringify(pending));
        
        // Add to sync queue
        this.addToQueue({
            type: 'attendance',
            data: attendance
        });
        
        return true;
    }
    
    // Get pending attendance
    getPendingAttendance() {
        const saved = localStorage.getItem(CONFIG.storage.pendingAttendance);
        return saved ? JSON.parse(saved) : [];
    }
    
    // Mark item as failed
    markAsFailed(id) {
        const item = this.queue.find(i => i.id === id);
        if(item) {
            item.failed = true;
            this.saveQueue();
        }
    }
    
    // Clear queue
    clearQueue() {
        this.queue = [];
        this.saveQueue();
        this.updateBadge();
    }
    
    // Generate unique ID
    generateId() {
        return 'off_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Update sync badge in UI
    updateBadge() {
        const badge = document.getElementById('offlineBadge');
        if(badge) {
            if(this.queue.length > 0) {
                badge.textContent = this.queue.length;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    
    // Update sync status icon
    updateSyncStatus(status) {
        const icon = document.getElementById('syncIcon');
        if(icon) {
            if(status === 'syncing') {
                icon.className = 'fas fa-sync-alt fa-spin';
            } else if(this.queue.length > 0) {
                icon.className = 'fas fa-clock';
                icon.style.color = 'var(--warning)';
            } else {
                icon.className = 'fas fa-check-circle';
                icon.style.color = 'var(--success)';
            }
        }
    }
    
    // Show notification
    showNotification(message, type) {
        // Could use toast or custom notification
        console.log(`[${type}] ${message}`);
    }
    
    // Get queue stats
    getStats() {
        return {
            total: this.queue.length,
            pending: this.queue.filter(i => !i.failed).length,
            failed: this.queue.filter(i => i.failed).length,
            oldest: this.queue.length > 0 ? this.queue[0].timestamp : null
        };
    }
    
    // Check if online
    isOnline() {
        return navigator.onLine;
    }
    
    // Register for background sync
    async registerSync() {
        if('serviceWorker' in navigator && 'SyncManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-attendance');
        }
    }
}

// Initialize
const Offline = new SamsOffline();
