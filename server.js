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

const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
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

function isVirtualInterface(name) {
    if (!name) return true;
    const lower = name.toLowerCase();
    return (
        lower.includes('docker') ||
        lower.startsWith('br-') ||
        lower.startsWith('veth') ||
        lower.startsWith('virbr') ||
        lower.includes('vmnet') ||
        lower.startsWith('vboxnet') ||
        lower.startsWith('tailscale') ||
        lower.startsWith('wg') ||
        lower.startsWith('tun') ||
        lower.startsWith('tap') ||
        lower.startsWith('lo') ||
        lower.includes('virtual')
    );
}

function isKnownVirtualSubnet(ip) {
    if (!ip) return true;
    if (ip.startsWith('10.42.') ||       
        ip.startsWith('10.0.2.') ||      
        ip.startsWith('192.168.122.') || 
        ip.startsWith('192.168.56.') || 
        ip.startsWith('192.168.65.') ||  
        ip.startsWith('192.168.99.')) { 
        return true;
    }
    if (ip.startsWith('172.')) {
        const secondOctet = parseInt(ip.split('.')[1], 10);
        if (secondOctet >= 17 && secondOctet <= 31) {
            return true;
        }
    }
    return false;
}

function isPrivateIp(ip) {
    if (!ip) return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const octet1 = parseInt(parts[0], 10);
    const octet2 = parseInt(parts[1], 10);
    
    if (octet1 === 10) return true;
    
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    
    if (octet1 === 192 && octet2 === 168) return true;
    
    return false;
}

function getLocalIp() {
    if (process.env.HOST_IP) {
        return process.env.HOST_IP;
    }
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        if (!isVirtualInterface(name) && (name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi') || name.toLowerCase().startsWith('wl'))) {
            for (const iface of interfaces[name]) {
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal && isPrivateIp(iface.address) && !isKnownVirtualSubnet(iface.address)) {
                    return iface.address;
                }
            }
        }
    }
    
    for (const name of Object.keys(interfaces)) {
        if (!isVirtualInterface(name) && (name.toLowerCase().startsWith('eth') || name.toLowerCase().startsWith('en') || name.toLowerCase().includes('ethernet'))) {
            for (const iface of interfaces[name]) {
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal && isPrivateIp(iface.address) && !isKnownVirtualSubnet(iface.address)) {
                    return iface.address;
                }
            }
        }
    }
    
    for (const name of Object.keys(interfaces)) {
        if (!isVirtualInterface(name)) {
            for (const iface of interfaces[name]) {
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal && isPrivateIp(iface.address) && !isKnownVirtualSubnet(iface.address)) {
                    return iface.address;
                }
            }
        }
    }

    for (const name of Object.keys(interfaces)) {
        if (!isVirtualInterface(name)) {
            for (const iface of interfaces[name]) {
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                    return iface.address;
                }
            }
        }
    }

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                return iface.address;
            }
        }
    }
    
    return '127.0.0.1';
}


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

function isLocalhost(ip) {
    if (!ip) return false;
    if (ip === '127.0.0.1' || 
        ip === '::1' || 
        ip === '::ffff:127.0.0.1' || 
        ip.startsWith('127.') || 
        ip.startsWith('::ffff:127.')) {
        return true;
    }
    if (process.env.DOCKER === 'true') {
        const strictGateways = [
            '172.17.0.1', '::ffff:172.17.0.1',
            '172.18.0.1', '::ffff:172.18.0.1',
            '192.168.65.1', '::ffff:192.168.65.1'
        ];
        return strictGateways.includes(ip);
    }
    return false;
}

app.get('/api/qr', async (req, res) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).json({ error: "Access denied: Server controls can only be accessed via localhost/127.0.0.1." });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
        const ip = getLocalIp();
        const port = req.socket.localPort || PORT;
        const url = `http://${ip}:${port}/connect/${sessionManager.getPairToken()}`;
        
        const svgString = await qrcode.toString(url, { type: 'svg' });
        const dynamicQrCode = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        
        res.json({ qr: dynamicQrCode, isPaired: sessionManager.getIsPaired(), token: sessionManager.getPairToken() });
    } catch (err) {
        console.error('Failed to generate QR code dynamically', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

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

app.get('/sender.js', (req, res, next) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).send('// Access Denied: only localhost can access desktop scripts.');
    }
    next();
});

app.get(['/', '/index.html'], (req, res) => {
    if (!isLocalhost(req.ip)) {
        return res.status(403).send('<h2>Access Denied</h2><p>The server desktop dashboard is restricted and can only be accessed via localhost/127.0.0.1.</p>');
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

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

app.use('/uploads', expressAuth, express.static(uploadsDir));

const messageHistory = [];
const HISTORY_LIMIT = 50;
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
    if (socket.role === 'phone' && !isApproved && sessionManager.approvedIps.size === 0 && !sessionManager.hasPhone()) {
        sessionManager.approvedIps.add(ip);
        sessionManager.approvedPhones.add(socket.id);
        sessionManager.setPaired(true);
        isApproved = true;
        console.log(`[AUTO-APPROVE] First phone client automatically allowed from IP: ${ip}`);
    }

    if (socket.role === 'phone' && !isApproved) {
        sessionManager.addPendingRequest(socket.id, ip, deviceInfoStr);
        broadcastUsersUpdate();
    } else {
        sessionManager.registerSocket(socket.id, socket.role, ip, deviceInfoStr);
        broadcastUsersUpdate();
        
        if (socket.role === 'phone') {
            io.to(socket.id).emit('device_paired', { token: sessionManager.getPairToken() });
            socket.emit('history', messageHistory);
        }
    }
    
    if (socket.role === 'desktop') {
        socket.emit('history', messageHistory);
    }

    socket.on('send_message', (data) => {
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

        messageHistory.push(messageObj);
        if (messageHistory.length > HISTORY_LIMIT) {
            messageHistory.shift();
        }
        io.emit('receive_message', messageObj);
    });

    socket.on('clear_messages', () => {
        messageHistory.length = 0;
        io.emit('messages_cleared'); 
    });

    socket.on('admin_action', (data) => {
        if (socket.role !== 'desktop') return;
        
        const targetSocket = io.sockets.sockets.get(data.targetId);
        
        if (data.action === 'kick' && targetSocket) {
            targetSocket.emit('access_revoked', { reason: 'kicked', message: 'You have been kicked and disconnected by the desktop host.' });
            setTimeout(() => targetSocket.disconnect(true), 150);
        } else if (data.action === 'block') {
            const targetIp = data.targetId ? sessionManager.connectedUsers[data.targetId]?.ip : null;
            if (targetIp) {
                sessionManager.blockIp(targetIp);
                if (targetSocket) {
                    targetSocket.emit('access_revoked', { reason: 'blocked', message: 'Your device IP has been blocked from accessing the EdgeShare server.' });
                    setTimeout(() => targetSocket.disconnect(true), 150);
                }
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
        } else if (data.action === 'restart') {
            console.log('[SYSTEM] Service restart requested from desktop dashboard...');
            io.emit('service_restarting', { message: 'Server is restarting...' });
            
            setTimeout(() => {
                if (process.env.DOCKER === 'true') {
                    process.exit(1);
                } else {
                    const { spawn } = require('child_process');
                    const child = spawn(process.argv[0], process.argv.slice(1), {
                        env: process.env,
                        detached: true,
                        stdio: 'inherit'
                    });
                    child.unref();
                    process.exit(0);
                }
            }, 700);
            return;
        }
        
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

const PORT = process.env.PORT || 9999;
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
