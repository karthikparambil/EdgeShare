const crypto = require('crypto');

class SessionManager {
    constructor() {
        this.pairToken = crypto.randomBytes(5).toString('hex');
        this.desktopSocketId = null;
        this.phoneSocketId = null;
        this.isPaired = false;
        this.connectedUsers = {};
        this.blockedIps = new Set();
        this.pendingRequests = new Map(); // socketId -> { id, ip, timestamp }
        this.approvedIps = new Set();
        this.approvedPhones = new Set();
    }

    getPairToken() {
        return this.pairToken;
    }

    getIsPaired() {
        return this.isPaired;
    }

    setPaired(status) {
        this.isPaired = status;
    }

    hasPhone() {
        return Boolean(this.phoneSocketId) || Object.values(this.connectedUsers).some(u => u.role === 'phone');
    }

    // Devices that are not approved need permission
    canPhoneConnect(socketId) {
        return true; // We now allow them to connect but place them in pending state
    }

    blockIp(ip) {
        this.blockedIps.add(ip);
        this.approvedIps.delete(ip); // Revoke approval if blocked
        
        // Remove from pending
        for (const [id, req] of this.pendingRequests.entries()) {
            if (req.ip === ip) {
                this.pendingRequests.delete(id);
            }
        }
    }

    unblockIp(ip) {
        this.blockedIps.delete(ip);
    }

    isIpBlocked(ip) {
        return this.blockedIps.has(ip);
    }

    getBlockedIps() {
        return Array.from(this.blockedIps);
    }

    registerSocket(socketId, role, ip, userAgent = '') {
        if (role === 'desktop') {
            this.desktopSocketId = socketId;
        } else if (role === 'phone') {
            this.phoneSocketId = socketId;
            if (this.approvedIps.has(ip)) {
                this.approvedPhones.add(socketId);
                this.isPaired = true;
            }
        }
        
        // Only consider the user 'active' if desktop, or if phone is approved
        if (role === 'desktop' || this.approvedIps.has(ip) || this.approvedPhones.has(socketId)) {
            this.connectedUsers[socketId] = {
                id: socketId,
                role,
                ip,
                userAgent,
                connectedAt: Date.now()
            };
        }
    }

    addPendingRequest(socketId, ip, userAgent = '') {
        this.pendingRequests.set(socketId, {
            id: socketId,
            ip,
            userAgent,
            timestamp: Date.now()
        });
    }

    approveRequest(socketId) {
        const req = this.pendingRequests.get(socketId);
        if (req) {
            this.approvedIps.add(req.ip);
            this.approvedPhones.add(socketId);
            this.pendingRequests.delete(socketId);
            
            // Move to active users
            this.connectedUsers[socketId] = {
                id: socketId,
                role: 'phone',
                ip: req.ip,
                userAgent: req.userAgent,
                connectedAt: Date.now()
            };
            return true;
        }
        return false;
    }

    denyRequest(socketId) {
        this.pendingRequests.delete(socketId);
    }

    isApproved(ip) {
        return this.approvedIps.has(ip);
    }

    getPendingRequests() {
        return Array.from(this.pendingRequests.values());
    }

    unregisterSocket(socketId) {
        const user = this.connectedUsers[socketId];
        delete this.connectedUsers[socketId];
        this.pendingRequests.delete(socketId);
        this.approvedPhones.delete(socketId);
        if (socketId === this.desktopSocketId) {
            this.desktopSocketId = null;
        } else if (this.phoneSocketId === socketId || (user && user.role === 'phone')) {
            if (this.phoneSocketId === socketId) {
                this.phoneSocketId = null;
            }
            const remainingPhones = Object.values(this.connectedUsers).some(u => u.role === 'phone');
            if (!remainingPhones) {
                this.isPaired = false;
            }
        }
    }

    getConnectedUsers() {
        return Object.values(this.connectedUsers);
    }
}

module.exports = new SessionManager();
