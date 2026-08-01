const loginOverlay = document.getElementById('loginOverlay');
const mainApp = document.getElementById('mainApp');
const loginError = document.getElementById('loginError');
const qrImage = document.getElementById('qrImage');

let appToken = '';

const socket = io({ 
    transports: ['websocket'],
    autoConnect: false
});

const sidebarQrBtn = document.getElementById('sidebarQrBtn');
const closeQrBtn = document.getElementById('closeQrBtn');
const phoneStatusIndicator = document.getElementById('phoneStatusIndicator');
const serverUrlIndicator = document.getElementById('serverUrlIndicator');

let overlayTimeout = null;
function toggleQrOverlay(show) {
    if (!loginOverlay) return;
    const isCurrentlyHidden = loginOverlay.style.display === 'none' || window.getComputedStyle(loginOverlay).display === 'none';
    const shouldShow = typeof show === 'boolean' ? show : isCurrentlyHidden;
    
    if (overlayTimeout) clearTimeout(overlayTimeout);

    if (shouldShow && isCurrentlyHidden) {
        // Trigger opening zoom & fade animation
        loginOverlay.classList.add('hidden-animate');
        loginOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                loginOverlay.classList.remove('hidden-animate');
            });
        });
    } else if (!shouldShow && !isCurrentlyHidden) {
        // Trigger closing zoom & fade animation before hiding display
        loginOverlay.classList.add('hidden-animate');
        overlayTimeout = setTimeout(() => {
            loginOverlay.style.display = 'none';
            loginOverlay.classList.remove('hidden-animate');
        }, 260);
    }
}

if (sidebarQrBtn) {
    sidebarQrBtn.addEventListener('click', () => {
        toggleQrOverlay(true);
    });
}
if (closeQrBtn) {
    closeQrBtn.addEventListener('click', () => {
        toggleQrOverlay(false);
    });
}

// Global keyboard shortcut: Ctrl+Q to toggle QR code pairing overlay, Esc to close
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        toggleQrOverlay();
    } else if (e.key === 'Escape' && loginOverlay && loginOverlay.style.display !== 'none') {
        toggleQrOverlay(false);
    }
});

// Sidebar Routing Logic
const navBtns = document.querySelectorAll('.sidebar-nav .nav-btn[data-view]');
const viewContainers = document.querySelectorAll('.view-container');

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        
        // Update active class on buttons
        navBtns.forEach(b => {
            b.classList.remove('active');
            b.style.color = 'var(--text-secondary)';
        });
        btn.classList.add('active');
        btn.style.color = 'var(--text-primary)';
        
        // Toggle views
        viewContainers.forEach(view => {
            if (view.id === targetView) {
                view.style.display = 'flex';
                view.classList.add('active');
                if (targetView === 'usersView') {
                    socket.emit('request_users');
                }
            } else {
                view.style.display = 'none';
                view.classList.remove('active');
            }
        });
    });
});

// --- Helper Functions ---
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fetch QR Code dynamically from server (no authentication needed for localhost)
function fetchQR() {
    fetch('/api/qr?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
            if (data.qr) {
                qrImage.src = data.qr;
                if (serverUrlIndicator) serverUrlIndicator.textContent = "Online and ready (port 9999)";
            }
            if (data.token) {
                appToken = data.token;
            }
            if (appToken) {
                socket.auth = { token: appToken, role: 'desktop' };
                socket.connect();
            }
        })
        .catch(err => console.error('Failed to fetch QR', err));
}

fetchQR();

socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('request_users');
    if (typeof messageInput !== 'undefined') messageInput.focus();
});

socket.on('device_paired', () => {
    toggleQrOverlay(false);
    if (phoneStatusIndicator) {
        phoneStatusIndicator.textContent = 'Connected ✅';
        phoneStatusIndicator.style.color = 'var(--success-color)';
    }
    if (typeof messageInput !== 'undefined') messageInput.focus();
});

socket.on('device_disconnected', () => {
    console.log("Phone disconnected");
    if (phoneStatusIndicator) {
        phoneStatusIndicator.textContent = 'Disconnected ❌';
        phoneStatusIndicator.style.color = 'var(--text-secondary)';
    }
});

// Handle authentication errors
socket.on("connect_error", (err) => {
    if (err.message === "invalid_passcode") {
        appToken = '';
        socket.disconnect();
        toggleQrOverlay(true);
        fetchQR();
    }
});

const messageInput = document.getElementById('messageInput');
const pasteBtn = document.getElementById('pasteBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const messageList = document.getElementById('messageList');

const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadFileName = document.getElementById('uploadFileName');
const uploadPercent = document.getElementById('uploadPercent');
const uploadProgressBar = document.getElementById('uploadProgressBar');

// Focus input on load
messageInput.focus();

// Quick Paste feature
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        messageInput.value = text;
        messageInput.focus();
    } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
        alert('Could not paste. Please check clipboard permissions.');
    }
});

// File Attachment feature
attachBtn.addEventListener('click', () => {
    fileInput.click();
});

async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    const token = appToken;
    
    uploadProgressContainer.style.display = 'block';
    
    for (const file of files) {
        uploadFileName.textContent = `Uploading ${file.name}...`;
        uploadPercent.textContent = '0%';
        uploadProgressBar.style.width = '0%';
        
        await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload');
            xhr.setRequestHeader('Authorization', token);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    uploadPercent.textContent = `${percentComplete}%`;
                    uploadProgressBar.style.width = `${percentComplete}%`;
                }
            };
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        socket.emit('send_message', { 
                            type: 'file',
                            text: '', // optional text
                            url: data.url + '?token=' + encodeURIComponent(token),
                            name: data.name,
                            mimeType: data.mimeType
                        });
                        resolve();
                    } catch (err) {
                        console.error('Invalid JSON response:', err);
                        reject(err);
                    }
                } else {
                    console.error('Upload failed', xhr.responseText);
                    alert('Upload failed: ' + xhr.statusText);
                    reject(new Error(xhr.statusText));
                }
            };
            
            xhr.onerror = () => {
                console.error('Error uploading file');
                alert('Error uploading file. Check connection.');
                reject(new Error('Network error'));
            };
            
            xhr.send(formData);
        }).catch(err => console.error(err));
    }
    
    // Hide progress when done
    setTimeout(() => {
        uploadProgressContainer.style.display = 'none';
        uploadProgressBar.style.width = '0%';
    }, 1000);
}

fileInput.addEventListener('change', (e) => {
    const filesToUpload = Array.from(e.target.files);
    uploadFiles(filesToUpload);
    fileInput.value = ''; // reset
});

// Handle paste for files/images
window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const files = [];
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            files.push(file);
        }
    }
    if (files.length > 0) {
        e.preventDefault();
        uploadFiles(files);
    }
});

// Send message feature
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        socket.emit('send_message', { type: 'text', text });
        messageInput.value = '';
        messageInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);

// Clear messages feature
clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all messages everywhere?')) {
        socket.emit('clear_messages');
    }
});

// Allow Enter to send (Shift+Enter for newline)
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// History handling
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message-item';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (message.type === 'file') {
        if (message.mimeType && message.mimeType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = message.url;
            img.className = 'message-image';
            img.alt = message.name;
            contentDiv.appendChild(img);
        } else {
            const fileLink = document.createElement('a');
            fileLink.href = message.url;
            fileLink.target = '_blank';
            fileLink.download = message.name;
            fileLink.className = 'message-file';
            fileLink.innerHTML = `
                <svg class="message-file-icon" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                <span>${message.name}</span>
            `;
            contentDiv.appendChild(fileLink);
        }
    } else {
        contentDiv.textContent = message.text;
    }
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    if (message.type === 'file') {
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download';
        downloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = message.url;
            a.download = message.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        actionsDiv.appendChild(downloadBtn);
    } else {
        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Copy';
        
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(message.text);
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!';
                copyBtn.style.color = 'var(--success-color)';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.color = '';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        });
        
        actionsDiv.appendChild(copyBtn);
    }
    
    div.appendChild(contentDiv);
    div.appendChild(actionsDiv);
    
    return div;
}

// Receive history on connect
socket.on('history', (messages) => {
    messageList.innerHTML = '';
    // Append in normal order so newest is at the bottom
    messages.forEach(msg => {
        messageList.appendChild(createMessageElement(msg));
    });
    // Scroll to bottom
    const historySection = document.querySelector('.history-section');
    historySection.scrollTop = historySection.scrollHeight;
});

// Receive a single message
socket.on('receive_message', (message) => {
    messageList.appendChild(createMessageElement(message));
    // Scroll to bottom
    const historySection = document.querySelector('.history-section');
    historySection.scrollTop = historySection.scrollHeight;
});

// Clear messages
socket.on('messages_cleared', () => {
    messageList.innerHTML = '';
});

const usersList = document.getElementById('usersList');
const blockedList = document.getElementById('blockedList');
const requestsList = document.getElementById('requestsList');
const deviceInfoList = document.getElementById('deviceInfoList');

socket.on('users_update', (data) => {
    if (!usersList || !blockedList || !requestsList || !deviceInfoList) {
        console.error("Missing DOM elements!", { usersList, blockedList, requestsList, deviceInfoList });
        return;
    }
    usersList.innerHTML = '';
    blockedList.innerHTML = '';
    requestsList.innerHTML = '';
    deviceInfoList.innerHTML = '';
    
    // Render Active Users
    const users = data.active || [];
    if (users.length === 0) {
        usersList.innerHTML = '<li style="color: var(--text-secondary); font-size: 0.9rem;">No connected devices</li>';
    } else {
        users.forEach(user => {
            const li = document.createElement('li');
            li.style.background = 'var(--surface-color)';
            li.style.padding = '1rem';
            li.style.borderRadius = '8px';
            li.style.border = '1px solid var(--border-color)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            const roleIcon = user.role === 'desktop' ? '💻' : '📱';
            const roleLabel = user.role === 'desktop' ? 'Desktop Server' : 'Connected Phone';
            
            let actionsHtml = '';
            if (user.role === 'phone') {
                actionsHtml = `
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="kick-btn" data-id="${user.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">Kick</button>
                        <button class="block-btn" data-id="${user.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: rgba(255,50,50,0.2); color: #ff5555; border: 1px solid #ff5555; border-radius: 4px; cursor: pointer;">Block IP</button>
                    </div>
                `;
            } else {
                actionsHtml = `<span style="font-size: 0.85rem; color: var(--success-color);">(Active)</span>`;
            }

            li.innerHTML = `
                <div>
                    <strong>${roleIcon} ${roleLabel}</strong>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">IP: ${user.ip}</div>
                </div>
                ${actionsHtml}
            `;
            
            usersList.appendChild(li);

            // Also populate Device Info List
            const devLi = document.createElement('li');
            devLi.style.background = 'var(--surface-color)';
            devLi.style.padding = '1rem';
            devLi.style.borderRadius = '8px';
            devLi.style.border = '1px solid var(--border-color)';
            devLi.style.display = 'flex';
            devLi.style.justifyContent = 'space-between';
            
            const uaParts = (user.userAgent || 'unknown|unknown|unknown').split('|');
            const [devType, browser, os] = uaParts;
            
            const connectedSince = new Date(user.connectedAt).toLocaleTimeString();
            
            devLi.innerHTML = `
                <div>
                    <strong>${roleIcon} ${roleLabel}</strong>
                    <div style="display: grid; grid-template-columns: auto auto; gap: 4px 16px; font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">
                        <span><strong style="color: var(--text-primary);">Type:</strong> ${devType}</span>
                        <span><strong style="color: var(--text-primary);">OS:</strong> ${os}</span>
                        <span><strong style="color: var(--text-primary);">Browser:</strong> ${browser}</span>
                        <span><strong style="color: var(--text-primary);">Connected:</strong> ${connectedSince}</span>
                    </div>
                </div>
                <div>
                    <span style="font-size: 0.85rem; padding: 4px 8px; border-radius: 12px; background: rgba(0, 200, 83, 0.1); color: var(--success-color);">Active</span>
                </div>
            `;
            deviceInfoList.appendChild(devLi);
        });
    }

    // Render Blocked IPs
    const blocked = data.blocked || [];
    if (blocked.length === 0) {
        blockedList.innerHTML = '<li style="color: var(--text-secondary); font-size: 0.9rem;">No blocked IPs</li>';
    } else {
        blocked.forEach(ip => {
            const li = document.createElement('li');
            li.style.background = 'rgba(255,50,50,0.05)';
            li.style.padding = '1rem';
            li.style.borderRadius = '8px';
            li.style.border = '1px solid rgba(255,50,50,0.3)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            li.innerHTML = `
                <div>
                    <strong>🚫 Blocked IP</strong>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">IP: ${ip}</div>
                </div>
                <button class="unblock-btn" data-ip="${ip}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">Unblock</button>
            `;
            blockedList.appendChild(li);
        });
    }

    // Render Pending Requests
    const pending = data.pending || [];
    if (pending.length === 0) {
        requestsList.innerHTML = '<li style="color: var(--text-secondary); font-size: 0.9rem;">No access requests</li>';
    } else {
        pending.forEach(req => {
            const li = document.createElement('li');
            li.style.background = 'rgba(255,165,0,0.05)';
            li.style.padding = '1rem';
            li.style.borderRadius = '8px';
            li.style.border = '1px solid rgba(255,165,0,0.3)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            li.innerHTML = `
                <div>
                    <strong>📱 Phone Requesting Access</strong>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">IP: ${req.ip}</div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="approve-btn" data-id="${req.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--success-color); color: white; border: none; border-radius: 4px; cursor: pointer;">Allow</button>
                    <button class="deny-btn" data-id="${req.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">Deny</button>
                </div>
            `;
            requestsList.appendChild(li);
        });
    }

    // Add listeners for Kick/Block/Unblock/Approve/Deny buttons
    document.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            socket.emit('admin_action', { action: 'kick', targetId });
        });
    });

    document.querySelectorAll('.block-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            if(confirm("Are you sure you want to permanently block this IP address?")) {
                socket.emit('admin_action', { action: 'block', targetId });
            }
        });
    });

    document.querySelectorAll('.unblock-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetIp = e.currentTarget.getAttribute('data-ip');
            socket.emit('admin_action', { action: 'unblock', targetIp });
        });
    });

    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            socket.emit('admin_action', { action: 'approve_request', targetId });
        });
    });

    document.querySelectorAll('.deny-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            socket.emit('admin_action', { action: 'deny_request', targetId });
        });
    });
});

// --- Drag and Drop ---
const dragOverlay = document.getElementById('dragOverlay');
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragOverlay) dragOverlay.style.display = 'flex';
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        if (dragOverlay) dragOverlay.style.display = 'none';
    }
});

window.addEventListener('dragover', (e) => {
    e.preventDefault();
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (dragOverlay) dragOverlay.style.display = 'none';
    
    if (e.dataTransfer && e.dataTransfer.files) {
        uploadFiles(e.dataTransfer.files);
    }
});

// --- System Settings Controls ---
const restartServerBtn = document.getElementById('restartServerBtn');
if (restartServerBtn) {
    restartServerBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to restart the EdgeShare service? All mobile devices will be disconnected and session tokens regenerated.')) {
            restartServerBtn.disabled = true;
            restartServerBtn.style.opacity = '0.6';
            restartServerBtn.style.cursor = 'not-allowed';
            restartServerBtn.innerHTML = 'Restarting...';
            
            socket.emit('admin_action', { action: 'restart' });
            
            // Reload page automatically once server finishes restarting
            setTimeout(() => {
                window.location.reload();
            }, 2500);
        }
    });
}

