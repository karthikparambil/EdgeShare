const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('qrcode');
const UAParser = require('ua-parser-js');
const sessionManager = require('./sessionManager');
// Ensure temporary uploads directory exists in current working directory (cross-platform compatible for Windows, Linux, and macOS)
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
    // Clean up old temporary files from previous sessions
    fs.readdirSync(uploadsDir).forEach(file => {
        if (file !== '.gitkeep' && file !== '.gitignore') {
            const filePath = path.join(uploadsDir, file);
            try {
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                } else {
                    fs.rmSync(filePath, { recursive: true, force: true });
                }
            } catch (e) {
                console.warn(`Could not remove temporary file ${filePath}:`, e.message);
            }
        }
    });
} else {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Replace spaces with underscores and remove problematic characters
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + safeName);
    }
});
const upload = multer({ storage: storage });

const app = express();
app.use(express.json({limit: '50gb'}));
app.use(express.urlencoded({limit: '50gb', extended: true}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    
    // Pass 1: Strictly prioritize WLAN and Wi-Fi
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi')) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    }
    
    // Pass 2: Fallback to ETH, EN, or Ethernet
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().startsWith('eth') || name.toLowerCase().startsWith('en') || name.toLowerCase().includes('ethernet')) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    }
    
    // Pass 3: Fallback to any other physical interface (exclude virtual/docker/lo)
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('docker') || name.toLowerCase().startsWith('br-') || name.toLowerCase().startsWith('veth')) {
            continue;
        }
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    
    return '127.0.0.1';
}


// Express Authentication Middleware
const expressAuth = (req, res, next) => {
    if (sessionManager.isIpBlocked(req.ip)) {
        return res.status(403).json({ error: "Blocked" });
    }
    const token = req.headers.authorization || req.query.token;

    if (token === sessionManager.getPairToken()) {
        return next();
    }
    return res.status(401).json({ error: "Unauthorized" });
};

// Helper to verify if an IP address is local loopback (localhost / 127.0.0.1 / ::1)
function isLocalhost(ip) {
    if (!ip) return false;
    return ip === '127.0.0.1' || 
           ip === '::1' || 
           ip === '::ffff:127.0.0.1' || 
           ip.startsWith('127.') || 
           ip.startsWith('::ffff:127.');
}

// Route for desktop to get QR code
app.get('/api/qr', async (req, res) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).json({ error: "Access denied: Server controls can only be accessed via localhost/127.0.0.1." });
    }
    // Disable caching for this route
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
        const ip = getLocalIp();
        const port = req.socket.localPort || PORT;
        const url = `http://${ip}:${port}/connect/${sessionManager.getPairToken()}`;
        
        // Generate SVG instead of PNG for clarity
        const svgString = await qrcode.toString(url, { type: 'svg' });
        const dynamicQrCode = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        
        res.json({ qr: dynamicQrCode, isPaired: sessionManager.getIsPaired(), token: sessionManager.getPairToken() });
    } catch (err) {
        console.error('Failed to generate QR code dynamically', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Route for phone to connect via QR
app.get('/connect/:token', (req, res) => {
    if (sessionManager.isIpBlocked(req.ip)) {
        return res.status(403).send('Your IP is blocked.');
    }
    if (req.params.token === sessionManager.getPairToken()) {
        sessionManager.setPaired(true);
        io.emit('device_paired', { token: sessionManager.getPairToken() });
        res.redirect(`/phone.html?token=${sessionManager.getPairToken()}`);
    } else {
        res.status(403).send('Invalid or expired pairing token.');
    }
});

// Restrict desktop sender script to localhost
app.get('/sender.js', (req, res, next) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).send('// Access Denied: only localhost can access desktop scripts.');
    }
    next();
});

// Force no-cache for index.html and enforce localhost restriction for desktop UI
app.get(['/', '/index.html'], (req, res) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).send('<h2>Access Denied</h2><p>The server desktop dashboard is restricted and can only be accessed via localhost/127.0.0.1.</p>');
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// File upload endpoint
app.post('/upload', expressAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({ 
        url: `/uploads/${req.file.filename}`, 
        name: req.file.originalname,
        mimeType: req.file.mimetype 
    });
});

// Serve uploaded files securely
app.use('/uploads', expressAuth, express.static(uploadsDir));

// Store the last 50 messages in memory for new connections
const messageHistory = [];
const HISTORY_LIMIT = 50;

// Authentication Middleware
io.use((socket, next) => {
    const ip = socket.handshake.address;
    if (sessionManager.isIpBlocked(ip)) {
        return next(new Error("ip_blocked"));
    }

    const clientToken = socket.handshake.auth.token;
    const role = socket.handshake.auth.role;

    if (role === 'desktop' && !isLocalhost(ip)) {
        console.warn(`[SECURITY] Rejected remote connection attempt for desktop role from IP: ${ip}`);
        return next(new Error("access_denied: desktop role restricted to localhost"));
    }

    if (clientToken === sessionManager.getPairToken()) {
        socket.role = role;
        return next();
    }
    
    return next(new Error("invalid_passcode"));
});

io.on('connection', (socket) => {
    const ip = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'] || '';
    
    const parser = new UAParser(userAgent);
    const parsedUa = parser.getResult();
    
    // Create a compact device info string for the UI
    const deviceType = parsedUa.device.type || (parsedUa.os.name === 'iOS' || parsedUa.os.name === 'Android' ? 'mobile' : 'desktop');
    const browser = parsedUa.browser.name || 'Unknown Browser';
    const os = parsedUa.os.name || 'Unknown OS';
    const deviceInfoStr = `${deviceType}|${browser}|${os}`;

    console.log('A user connected:', socket.id, 'Role:', socket.role, 'IP:', ip, 'Device:', deviceInfoStr);

    const broadcastUsersUpdate = () => {
        io.emit('users_update', {
            active: sessionManager.getConnectedUsers(),
            blocked: sessionManager.getBlockedIps(),
            pending: sessionManager.getPendingRequests()
        });
    };

    let isApproved = sessionManager.approvedIps.has(ip);
    
    // Automatically approve the very first phone without requiring explicit permission or request
    if (socket.role === 'phone' && !isApproved && sessionManager.approvedIps.size === 0 && !sessionManager.hasPhone()) {
        sessionManager.approvedIps.add(ip);
        sessionManager.approvedPhones.add(socket.id);
        sessionManager.setPaired(true);
        isApproved = true;
        console.log(`[AUTO-APPROVE] First phone client automatically allowed from IP: ${ip}`);
    }

    if (socket.role === 'phone' && !isApproved) {
        // Subsequent new phone connections require manual desktop approval
        sessionManager.addPendingRequest(socket.id, ip, deviceInfoStr);
        broadcastUsersUpdate();
    } else {
        sessionManager.registerSocket(socket.id, socket.role, ip, deviceInfoStr);
        broadcastUsersUpdate();
        
        if (socket.role === 'phone') {
            io.to(socket.id).emit('device_paired', { token: sessionManager.getPairToken() });
            // Send history to approved phone
            socket.emit('history', messageHistory);
        }
    }
    
    if (socket.role === 'desktop') {
        socket.emit('history', messageHistory);
    }

    // Listen for new messages from the sender
    socket.on('send_message', (data) => {
        // Block unapproved phones
        if (socket.role === 'phone' && !sessionManager.approvedPhones.has(socket.id)) {
            return;
        }
        
        const messageObj = {
            id: Date.now().toString(),
            type: data.type || 'text',
            text: data.text,
            url: data.url,
            name: data.name,
            mimeType: data.mimeType,
            timestamp: new Date().toISOString()
        };

        // Add to history
        messageHistory.push(messageObj);
        if (messageHistory.length > HISTORY_LIMIT) {
            messageHistory.shift();
        }

        // Broadcast to all connected clients (including the sender for acknowledgment)
        io.emit('receive_message', messageObj);
    });

    socket.on('clear_messages', () => {
        messageHistory.length = 0; // Clear history array
        io.emit('messages_cleared'); // Notify all clients
    });

    // Admin actions from desktop
    socket.on('admin_action', (data) => {
        if (socket.role !== 'desktop') return;
        
        const targetSocket = io.sockets.sockets.get(data.targetId);
        
        if (data.action === 'kick' && targetSocket) {
            targetSocket.disconnect(true);
        } else if (data.action === 'block') {
            const targetIp = data.targetId ? sessionManager.connectedUsers[data.targetId]?.ip : null;
            if (targetIp) {
                sessionManager.blockIp(targetIp);
                if (targetSocket) targetSocket.disconnect(true);
            }
        } else if (data.action === 'unblock' && data.targetIp) {
            sessionManager.unblockIp(data.targetIp);
        } else if (data.action === 'approve_request' && data.targetId) {
            if (sessionManager.approveRequest(data.targetId)) {
                if (targetSocket) {
                    targetSocket.emit('device_paired', { token: sessionManager.getPairToken() });
                    targetSocket.emit('history', messageHistory);
                }
            }
        } else if (data.action === 'deny_request' && data.targetId) {
            sessionManager.denyRequest(data.targetId);
            if (targetSocket) {
                targetSocket.emit('request_denied');
                targetSocket.disconnect(true);
            }
        }
        
        // Immediately broadcast the updated lists to all clients
        broadcastUsersUpdate();
    });

    socket.on('request_users', () => {
        if (socket.role === 'desktop') {
            socket.emit('users_update', {
                active: sessionManager.getConnectedUsers(),
                blocked: sessionManager.getBlockedIps(),
                pending: sessionManager.getPendingRequests()
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        sessionManager.unregisterSocket(socket.id);
        broadcastUsersUpdate();
        if (socket.role === 'phone') {
            io.emit('device_disconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
    const ip = getLocalIp();
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access on desktop: http://localhost:${PORT}`);
    console.log(`[DEBUG] Detected network IP for phone: ${ip}`);
    
    try {
        const open = (await import('open')).default;
        await open(`http://localhost:${PORT}`);
    } catch (err) {
        console.error('Failed to open browser automatically:', err);
    }
});
