const loginOverlay = document.getElementById('loginOverlay');
const mainApp = document.getElementById('mainApp');
const loginError = document.getElementById('loginError');

const urlParams = new URLSearchParams(window.location.search);
let token = urlParams.get('token') || localStorage.getItem('edgeshare_passcode') || localStorage.getItem('textit_passcode');

const socket = io({ 
    transports: ['websocket'],
    autoConnect: false
});

function attemptLogin(passcode) {
    socket.auth = { token: passcode, role: 'phone' };
    socket.connect();
}

socket.on('connect', () => {
    loginOverlay.style.display = 'none';
    loginError.style.display = 'none';
    
    const waitingOverlay = document.getElementById('waitingOverlay');
    if (waitingOverlay) waitingOverlay.style.display = 'flex';
});

socket.on('device_paired', (data) => {
    const waitingOverlay = document.getElementById('waitingOverlay');
    if (waitingOverlay) waitingOverlay.style.display = 'none';
    
    mainApp.style.display = 'flex';
    localStorage.setItem('edgeshare_passcode', data.token || socket.auth.token);
});

socket.on('request_denied', () => {
    const waitingOverlay = document.getElementById('waitingOverlay');
    if (waitingOverlay) waitingOverlay.style.display = 'none';
    
    loginOverlay.style.display = 'flex';
    loginError.style.display = 'block';
    loginError.textContent = 'Access request denied by server.';
    localStorage.removeItem('edgeshare_passcode');
    localStorage.removeItem('textit_passcode');
});

function revokeClientAccess(messageText) {
    if (mainApp) mainApp.style.display = 'none';
    const waitingOverlay = document.getElementById('waitingOverlay');
    if (waitingOverlay) waitingOverlay.style.display = 'none';
    if (loginOverlay) loginOverlay.style.display = 'none';
    
    const msgList = document.getElementById('messageList');
    if (msgList) msgList.innerHTML = '';
    
    localStorage.removeItem('edgeshare_passcode');
    localStorage.removeItem('textit_passcode');
    
    const revokedOverlay = document.getElementById('revokedOverlay');
    const revokedMessage = document.getElementById('revokedMessage');
    if (revokedMessage && messageText) revokedMessage.textContent = messageText;
    if (revokedOverlay) revokedOverlay.style.display = 'flex';
}

socket.on('access_revoked', (data) => {
    revokeClientAccess(data.message || 'Your connection access has been revoked by the desktop server.');
    socket.disconnect();
});

socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
        const revokedOverlay = document.getElementById('revokedOverlay');
        if (revokedOverlay && revokedOverlay.style.display !== 'flex') {
            revokeClientAccess('You have been disconnected by the desktop host.');
        }
    }
});

socket.on("connect_error", (err) => {
    if (err.message === "invalid_passcode") {
        loginError.style.display = 'block';
        loginError.textContent = 'Invalid or expired connection token.';
        localStorage.removeItem('edgeshare_passcode');
        localStorage.removeItem('textit_passcode');
        socket.disconnect();
    } else if (err.message === "device_limit_reached") {
        loginError.style.display = 'block';
        loginError.textContent = 'Another device is already connected.';
        localStorage.removeItem('edgeshare_passcode');
        localStorage.removeItem('textit_passcode');
        socket.disconnect();
    } else if (err.message === "ip_blocked") {
        revokeClientAccess('Your device IP has been blocked by the administrator.');
        socket.disconnect();
    }
});

if (token) {
    attemptLogin(token);
} else {
    loginError.style.display = 'block';
    loginError.textContent = 'No connection token provided.';
}
const messageList = document.getElementById('messageList');

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message-item phone-message-item';
    
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
        downloadBtn.className = 'primary';
        downloadBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download File';
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
        copyBtn.className = 'primary';
        copyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Copy to Clipboard';
        
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(message.text);
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!';
                copyBtn.style.backgroundColor = 'var(--success-color)';
                copyBtn.style.color = '#fff';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.backgroundColor = '';
                    copyBtn.style.color = '';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                const textArea = document.createElement("textarea");
                textArea.value = message.text;
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!';
                    copyBtn.style.backgroundColor = 'var(--success-color)';
                    copyBtn.style.color = '#fff';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                        copyBtn.style.backgroundColor = '';
                        copyBtn.style.color = '';
                    }, 2000);
                } catch (err) {
                    console.error('Fallback: Oops, unable to copy', err);
                }
                document.body.removeChild(textArea);
            }
        });
        
        actionsDiv.appendChild(copyBtn);
    }
    
    div.appendChild(contentDiv);
    div.appendChild(actionsDiv);
    
    return div;
}

socket.on('history', (messages) => {
    messageList.innerHTML = '';
    messages.forEach(msg => {
        messageList.appendChild(createMessageElement(msg));
    });
    const historySection = document.querySelector('.history-section');
    if (historySection) historySection.scrollTop = historySection.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

socket.on('receive_message', (message) => {
    messageList.appendChild(createMessageElement(message));
    const historySection = document.querySelector('.history-section');
    if (historySection) historySection.scrollTop = historySection.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

socket.on('messages_cleared', () => {
    messageList.innerHTML = '';
});

const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadFileName = document.getElementById('uploadFileName');
const uploadPercent = document.getElementById('uploadPercent');
const uploadProgressBar = document.getElementById('uploadProgressBar');

if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const filesToUpload = Array.from(e.target.files);
        uploadFiles(filesToUpload);
        fileInput.value = ''; 
    });
}

async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    const currentToken = token || socket.auth?.token;

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
            xhr.setRequestHeader('Authorization', currentToken);

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
                            text: '', 
                            url: data.url + '?token=' + encodeURIComponent(currentToken),
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

    setTimeout(() => {
        uploadProgressContainer.style.display = 'none';
        uploadProgressBar.style.width = '0%';
    }, 1000);
}

function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (text) {
        socket.emit('send_message', { type: 'text', text });
        messageInput.value = '';
        messageInput.focus();
    }
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

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
