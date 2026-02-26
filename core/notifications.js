/* ===== SAMS Notification Module ===== */

class SamsNotifications {
    constructor() {
        this.notifications = [];
        this.whatsappAPI = CONFIG.api.whatsapp;
        this.load();
    }
    
    // Load saved notifications
    load() {
        const saved = localStorage.getItem('sams_notifications');
        if(saved) {
            this.notifications = JSON.parse(saved);
        }
    }
    
    // Save notifications
    save() {
        localStorage.setItem('sams_notifications', JSON.stringify(this.notifications));
    }
    
    // Send in-app notification
    sendInApp(notification) {
        const notif = {
            id: Utils.generateId('notif_'),
            title: notification.title,
            message: notification.message,
            type: notification.type || 'info',
            read: false,
            timestamp: new Date().toISOString(),
            data: notification.data || null,
            action: notification.action || null
        };
        
        this.notifications.unshift(notif);
        
        // Keep only last 50
        if(this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }
        
        this.save();
        this.showToast(notif);
        this.updateBadge();
        
        return notif.id;
    }
    
    // Send WhatsApp notification
    async sendWhatsApp(to, message, options = {}) {
        if(!Utils.isValidWhatsApp(to)) {
            console.error('Invalid WhatsApp number');
            return false;
        }
        
        try {
            let url = `${this.whatsappAPI}?to=${encodeURIComponent(to)}&text=${encodeURIComponent(message)}`;
            
            if(options.image) {
                url += `&img=${encodeURIComponent(options.image)}`;
            }
            
            const response = await fetch(url);
            
            if(response.ok) {
                this.log('whatsapp', { to, message, status: 'sent' });
                return true;
            }
            
            return false;
        } catch(error) {
            console.error('WhatsApp send failed:', error);
            this.queueWhatsApp(to, message, options);
            return false;
        }
    }
    
    // Queue WhatsApp for offline
    queueWhatsApp(to, message, options) {
        let queue = JSON.parse(localStorage.getItem('whatsapp_queue')) || [];
        queue.push({
            to,
            message,
            options,
            timestamp: new Date().toISOString(),
            retries: 0
        });
        localStorage.setItem('whatsapp_queue', JSON.stringify(queue));
    }
    
    // Process WhatsApp queue
    async processWhatsAppQueue() {
        const queue = JSON.parse(localStorage.getItem('whatsapp_queue')) || [];
        if(queue.length === 0) return;
        
        for(const item of [...queue]) {
            try {
                const success = await this.sendWhatsApp(item.to, item.message, item.options);
                if(success) {
                    const index = queue.findIndex(q => q.timestamp === item.timestamp);
                    if(index !== -1) queue.splice(index, 1);
                } else {
                    item.retries++;
                }
            } catch(error) {
                item.retries++;
            }
        }
        
        localStorage.setItem('whatsapp_queue', JSON.stringify(queue));
    }
    
    // Send verification code
    async sendVerificationCode(whatsapp, code) {
        const message = `Your SAMS verification code is: ${code}\nValid for 5 minutes.`;
        return this.sendWhatsApp(whatsapp, message);
    }
    
    // Send passkey expired notification
    async sendPasskeyExpired(whatsapp, name) {
        const message = `Hello ${name}, your SAMS passkey has expired. Please create a new one to continue using offline mode.`;
        return this.sendWhatsApp(whatsapp, message);
    }
    
    // Send attendance reminder
    async sendAttendanceReminder(whatsapp, eventName, time) {
        const message = `Reminder: ${eventName} starts at ${time}. Don't forget to sign in!`;
        return this.sendWhatsApp(whatsapp, message);
    }
    
    // Send promotion notification
    async sendPromotionNotification(whatsapp, name, newRole) {
        const message = `Congratulations ${name}! You have been promoted to ${newRole} in SAMS.`;
        return this.sendWhatsApp(whatsapp, message);
    }
    
    // Show toast notification
    showToast(notification) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            left: 20px;
            background: ${this.getColor(notification.type)};
            color: white;
            padding: 16px;
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            animation: slideDown 0.3s ease;
            max-width: 400px;
            margin: 0 auto;
        `;
        
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fas ${this.getIcon(notification.type)}"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${notification.title}</div>
                    <div style="font-size: 14px; opacity: 0.9;">${notification.message}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
    
    // Get color by type
    getColor(type) {
        const colors = {
            success: 'var(--success)',
            error: 'var(--danger)',
            warning: 'var(--warning)',
            info: 'var(--primary)'
        };
        return colors[type] || colors.info;
    }
    
    // Get icon by type
    getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
    
    // Update notification badge
    updateBadge() {
        const unread = this.notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notifBadge');
        
        if(badge) {
            if(unread > 0) {
                badge.textContent = unread > 9 ? '9+' : unread;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    
    // Mark as read
    markAsRead(id) {
        const notif = this.notifications.find(n => n.id === id);
        if(notif) {
            notif.read = true;
            this.save();
            this.updateBadge();
        }
    }
    
    // Mark all as read
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.save();
        this.updateBadge();
    }
    
    // Get unread count
    getUnreadCount() {
        return this.notifications.filter(n => !n.read).length;
    }
    
    // Log notification
    log(type, data) {
        const log = {
            type,
            data,
            timestamp: new Date().toISOString()
        };
        
        let logs = JSON.parse(localStorage.getItem('notification_logs')) || [];
        logs.unshift(log);
        
        if(logs.length > 100) {
            logs = logs.slice(0, 100);
        }
        
        localStorage.setItem('notification_logs', JSON.stringify(logs));
    }
}

// Initialize
const Notifications = new SamsNotifications();
