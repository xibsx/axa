/* ===== SAMS Sync Manager ===== */

class SamsSync {
    constructor() {
        this.syncInProgress = false;
        this.queue = [];
        this.loadQueue();
        this.init();
    }
    
    async init() {
        if('serviceWorker' in navigator && 'SyncManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            
            // Register for background sync
            await registration.sync.register('sync-attendance');
            
            // Register for periodic sync
            if('periodicSync' in registration) {
                try {
                    await registration.periodicSync.register('update-cache', {
                        minInterval: 24 * 60 * 60 * 1000 // 1 day
                    });
                } catch(error) {
                    console.error('Periodic sync failed:', error);
                }
            }
        }
        
        // Listen for online/offline
        window.addEventListener('online', () => this.sync());
    }
    
    // Load queue from storage
    loadQueue() {
        const saved = localStorage.getItem('sync_queue');
        this.queue = saved ? JSON.parse(saved) : [];
    }
    
    // Save queue
    saveQueue() {
        localStorage.setItem('sync_queue', JSON.stringify(this.queue));
    }
    
    // Add to sync queue
    add(type, data, options = {}) {
        const item = {
            id: Utils.generateId('sync_'),
            type: type,
            data: data,
            priority: options.priority || 'normal',
            retries: 0,
            maxRetries: options.maxRetries || 3,
            createdAt: new Date().toISOString(),
            syncAfter: options.syncAfter || null
        };
        
        this.queue.push(item);
        this.saveQueue();
        
        // Try to sync immediately
        if(navigator.onLine && !this.syncInProgress) {
            this.sync();
        }
        
        return item.id;
    }
    
    // Remove from queue
    remove(id) {
        this.queue = this.queue.filter(item => item.id !== id);
        this.saveQueue();
    }
    
    // Sync all items
    async sync() {
        if(this.syncInProgress || this.queue.length === 0) return;
        
        this.syncInProgress = true;
        this.updateStatus('syncing');
        
        // Sort by priority
        const sorted = [...this.queue].sort((a, b) => {
            const priority = { high: 3, normal: 2, low: 1 };
            return priority[b.priority] - priority[a.priority];
        });
        
        for(const item of sorted) {
            // Check if item should be synced yet
            if(item.syncAfter && new Date(item.syncAfter) > new Date()) {
                continue;
            }
            
            try {
                const success = await this.syncItem(item);
                if(success) {
                    this.remove(item.id);
                } else {
                    item.retries++;
                    if(item.retries >= item.maxRetries) {
                        item.failed = true;
                        this.saveQueue();
                    }
                }
            } catch(error) {
                console.error('Sync failed for:', item.id, error);
                item.retries++;
                this.saveQueue();
            }
        }
        
        this.syncInProgress = false;
        this.updateStatus(this.queue.length > 0 ? 'pending' : 'idle');
    }
    
    // Sync single item
    async syncItem(item) {
        let endpoint = '';
        let method = 'POST';
        
        switch(item.type) {
            case 'attendance':
                endpoint = '/api/attendance';
                break;
            case 'comment':
                endpoint = '/api/comments';
                break;
            case 'event':
                endpoint = '/api/events';
                break;
            case 'user':
                endpoint = '/api/users';
                method = 'PUT';
                break;
            default:
                endpoint = '/api/sync';
        }
        
        try {
            const response = await fetch(`${CONFIG.api.base}${endpoint}`, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Sync-ID': item.id
                },
                body: JSON.stringify(item.data)
            });
            
            if(response.ok) {
                this.log('sync_success', item);
                return true;
            }
            
            return false;
        } catch(error) {
            this.log('sync_error', { item, error: error.message });
            return false;
        }
    }
    
    // Update sync status in UI
    updateStatus(status) {
        const statusEl = document.getElementById('syncStatus');
        if(statusEl) {
            const icons = {
                syncing: '<i class="fas fa-sync-alt fa-spin"></i> Syncing...',
                pending: '<i class="fas fa-clock"></i> Pending',
                idle: '<i class="fas fa-check-circle"></i> Synced'
            };
            statusEl.innerHTML = icons[status] || icons.idle;
        }
    }
    
    // Get queue stats
    getStats() {
        return {
            total: this.queue.length,
            pending: this.queue.filter(i => !i.failed && i.retries < i.maxRetries).length,
            failed: this.queue.filter(i => i.failed).length,
            byType: this.queue.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1;
                return acc;
            }, {})
        };
    }
    
    // Log sync events
    log(event, data) {
        const log = {
            event,
            data,
            timestamp: new Date().toISOString()
        };
        
        let logs = JSON.parse(localStorage.getItem('sync_logs')) || [];
        logs.unshift(log);
        
        if(logs.length > 50) {
            logs = logs.slice(0, 50);
        }
        
        localStorage.setItem('sync_logs', JSON.stringify(logs));
    }
    
    // Clear failed items
    clearFailed() {
        this.queue = this.queue.filter(item => !item.failed);
        this.saveQueue();
    }
    
    // Retry failed items
    retryFailed() {
        this.queue.forEach(item => {
            if(item.failed) {
                item.retries = 0;
                item.failed = false;
            }
        });
        this.saveQueue();
        this.sync();
    }
}

// Initialize
const Sync = new SamsSync();
