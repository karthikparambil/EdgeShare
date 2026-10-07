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

let currentUploadXhr = null;
let isUploadCancelled = false;

const cancelUploadBtn = document.getElementById('cancelUploadBtn');
if (cancelUploadBtn) {
    cancelUploadBtn.addEventListener('click', () => {
        if (typeof window.cancelCurrentUpload === 'function') {
            window.cancelCurrentUpload();
        } else {
            isUploadCancelled = true;
            if (currentUploadXhr) {
                currentUploadXhr.abort();
            }
            uploadProgressContainer.style.display = 'none';
            socket.emit('stop_uploading');
        }
    });
}

let uploadQueue = [];
let batchFiles = [];
let isUploading = false;
let currentUploadIndex = 0;
let totalUploadCount = 0;
let totalBytesToUpload = 0;
let bytesUploadedSoFar = 0;

window.cancelCurrentUpload = function() {
    const batchFileIndex = batchFiles.findIndex(f => f.status === 'uploading');
    if (batchFileIndex === -1) {
        // If nothing is uploading, we just cancel everything
        isUploadCancelled = true;
        uploadProgressContainer.style.display = 'none';
        socket.emit('stop_uploading');
        resetQueueState();
        return;
    }

    const batchFile = batchFiles[batchFileIndex];
    if (currentUploadXhr) {
        currentUploadXhr.abort();
    }
    totalBytesToUpload -= batchFile.file.size;
    batchFiles.splice(batchFileIndex, 1);
    renderQueueList();
};

function renderQueueList() {
    const container = document.getElementById('queueListContainer');
    if (!container) return;
    if (batchFiles.length <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = '';
    
    batchFiles.forEach(f => {
        const chip = document.createElement('div');
        let bg = 'rgba(255,255,255,0.05)';
        let border = 'var(--border-color)';
        let opacity = '1';
        let iconTxt = '🕒';
        
        if (f.status === 'done') {
            iconTxt = '✅';
            opacity = '0.5';
            border = '#10b981';
        } else if (f.status === 'uploading') {
            iconTxt = '⏳';
            border = '#3b82f6';
            bg = 'rgba(59, 130, 246, 0.1)';
            chip.id = 'current-uploading-chip';
        }
        
        chip.style.cssText = `background: ${bg}; border-radius: 16px; padding: 4px 10px; font-size: 0.75rem; white-space: nowrap; border: 1px solid ${border}; display: flex; align-items: center; gap: 6px; flex-shrink: 0; opacity: ${opacity}; transition: all 0.3s ease;`;
        
        const name = document.createElement('span');
        name.textContent = f.file.name;
        name.style.maxWidth = '100px';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        
        const icon = document.createElement('span');
        icon.textContent = iconTxt;
        
        chip.appendChild(name);
        chip.appendChild(icon);
        container.appendChild(chip);
    });
    
    setTimeout(() => {
        const uploadingChip = document.getElementById('current-uploading-chip');
        if (uploadingChip) {
            uploadingChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, 50);
}

async function processQueue() {
    if (isUploading) return;
    if (uploadQueue.length === 0) {
        uploadProgressContainer.style.display = 'none';
        uploadProgressBar.style.width = '0%';
        socket.emit('stop_uploading');
        resetQueueState();
        return;
    }

    isUploading = true;
    uploadProgressContainer.style.display = 'block';
    const currentToken = token || socket.auth?.token;

    if (totalUploadCount === 0) {
        totalUploadCount = uploadQueue.length;
    }
    
    socket.emit('uploading', { count: totalUploadCount - currentUploadIndex }); 

    while (uploadQueue.length > 0) {
        if (isUploadCancelled) {
            uploadQueue = [];
            break;
        }

        const fileObj = uploadQueue.shift();
        const file = fileObj.file;
        fileObj.status = 'uploading';
        currentUploadIndex++;
        renderQueueList();
        
        if (totalUploadCount > 1) {
            uploadFileName.textContent = `Uploading (${currentUploadIndex}/${totalUploadCount}): ${file.name}`;
        } else {
            uploadFileName.textContent = `Uploading: ${file.name}`;
        }
        
        await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            const xhr = new XMLHttpRequest();
            currentUploadXhr = xhr;
            xhr.open('POST', '/upload');
            xhr.setRequestHeader('Authorization', currentToken);
            
            let lastLoaded = 0;
            let lastTime = Date.now();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round(((bytesUploadedSoFar + event.loaded) / totalBytesToUpload) * 100);
                    uploadProgressBar.style.width = `${percentComplete}%`;
                    
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000;
                    
                    if (timeDiff >= 0.5 || event.loaded === event.total) {
                        const bytesDiff = event.loaded - lastLoaded;
                        const speedBps = timeDiff > 0 ? bytesDiff / timeDiff : 0;
                        
                        let speedText = '';
                        if (speedBps > 1024 * 1024) {
                            speedText = (speedBps / (1024 * 1024)).toFixed(1) + ' MB/s';
                        } else if (speedBps > 1024) {
                            speedText = (speedBps / 1024).toFixed(1) + ' KB/s';
                        } else {
                            speedText = Math.round(speedBps) + ' B/s';
                        }
                        
                        uploadPercent.textContent = `${percentComplete}% - ${speedText}`;
                        lastLoaded = event.loaded;
                        lastTime = now;
                    } else if (!uploadPercent.textContent.includes('-')) {
                        uploadPercent.textContent = `${percentComplete}%`;
                    }
                }
            };
            
            xhr.onload = () => {
                bytesUploadedSoFar += file.size;
                fileObj.status = 'done';
                renderQueueList();
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
                if (!isUploadCancelled) {
                    console.error('Error uploading file');
                    alert('Error uploading file. Check connection.');
                }
                reject(new Error('Network error'));
            };
            
            xhr.onabort = () => {
                resolve();
            };
            
            xhr.send(formData);
        }).catch(err => {
            if (!isUploadCancelled) console.error(err);
        });
    }
    
    currentUploadXhr = null;
    isUploading = false;
    
    if (isUploadCancelled) {
        uploadProgressContainer.style.display = 'none';
        uploadProgressBar.style.width = '0%';
        socket.emit('stop_uploading');
        resetQueueState();
    } else {
        setTimeout(() => {
            if (uploadQueue.length === 0 && !isUploading) {
                uploadProgressContainer.style.display = 'none';
                uploadProgressBar.style.width = '0%';
                socket.emit('stop_uploading');
                resetQueueState();
            }
        }, 1000);
    }
}

function resetQueueState() {
    currentUploadIndex = 0;
    totalUploadCount = 0;
    totalBytesToUpload = 0;
    bytesUploadedSoFar = 0;
    batchFiles = [];
    renderQueueList();
}

function uploadFiles(files) {
    if (!files || files.length === 0) return;
    if (isUploadCancelled) isUploadCancelled = false;
    for (let i = 0; i < files.length; i++) {
        const fileObj = { file: files[i], status: 'queued', id: Date.now() + i };
        uploadQueue.push(fileObj);
        batchFiles.push(fileObj);
        totalBytesToUpload += files[i].size;
        totalUploadCount++;
    }
    renderQueueList();
    processQueue();
}

function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (text) {
        socket.emit('send_message', { type: 'text', text });
        socket.emit('stop_typing');
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

// Activity Indicator Logic
let activityIndicator = document.getElementById('activityIndicator');
if (!activityIndicator) {
    activityIndicator = document.createElement('div');
    activityIndicator.id = 'activityIndicator';
    activityIndicator.className = 'activity-indicator';
    const historySection = document.querySelector('.history-section');
    if (historySection) {
        historySection.appendChild(activityIndicator);
    }
}

function showActivity(text) {
    if(!activityIndicator) return;
    activityIndicator.innerHTML = `<span>${text}</span><div class="typing-dots"><span></span><span></span><span></span></div>`;
    activityIndicator.classList.add('active');
    const historySection = document.querySelector('.history-section');
    if (historySection) historySection.scrollTop = historySection.scrollHeight;
}

function hideActivity() {
    if(!activityIndicator) return;
    activityIndicator.classList.remove('active');
}

socket.on('user_typing', (data) => {
    const role = data.role === 'phone' ? 'Phone' : 'Desktop';
    showActivity(`${role} is typing`);
});

socket.on('user_stop_typing', () => {
    hideActivity();
});

socket.on('user_uploading', (data) => {
    const role = data.role === 'phone' ? 'Phone' : 'Desktop';
    if (data.count && data.count > 1) {
        showActivity(`${role} is sharing ${data.count} files`);
    } else {
        showActivity(`${role} is sharing a file`);
    }
});

socket.on('user_stop_uploading', () => {
    hideActivity();
});

let typingTimeout = null;
if (typeof messageInput !== 'undefined' && messageInput) {
    messageInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop_typing');
        }, 1500);
    });
}

