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

const messagingBadge = document.getElementById('messagingBadge');
const usersBadge = document.getElementById('usersBadge');
const requestsBadge = document.getElementById('requestsBadge');
let unreadMessagesCount = 0;

function updatePageTitle() {
    const pendingCount = requestsBadge && requestsBadge.style.display !== 'none' ? parseInt(requestsBadge.textContent || '0', 10) : 0;
    if (pendingCount > 0) {
        document.title = `(${pendingCount}) Edgeshare - New Request!`;
    } else if (unreadMessagesCount > 0) {
        document.title = `(${unreadMessagesCount}) Edgeshare`;
    } else {
        document.title = 'Edgeshare';
    }
}

let overlayTimeout = null;
function toggleQrOverlay(show) {
    if (!loginOverlay) return;
    const isCurrentlyHidden = loginOverlay.style.display === 'none' || window.getComputedStyle(loginOverlay).display === 'none';
    const shouldShow = typeof show === 'boolean' ? show : isCurrentlyHidden;

    if (overlayTimeout) clearTimeout(overlayTimeout);

    if (shouldShow && isCurrentlyHidden) {
        loginOverlay.classList.add('hidden-animate');
        loginOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                loginOverlay.classList.remove('hidden-animate');
            });
        });
    } else if (!shouldShow && !isCurrentlyHidden) {
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

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        toggleQrOverlay();
    } else if (e.key === 'Escape' && loginOverlay && loginOverlay.style.display !== 'none') {
        toggleQrOverlay(false);
    }
});

const navBtns = document.querySelectorAll('.sidebar-nav .nav-btn[data-view]');
const viewContainers = document.querySelectorAll('.view-container');

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');

        navBtns.forEach(b => {
            b.classList.remove('active');
            b.style.color = 'var(--text-secondary)';
        });
        btn.classList.add('active');
        btn.style.color = 'var(--text-primary)';

        viewContainers.forEach(view => {
            if (view.id === targetView) {
                view.style.display = 'flex';
                view.classList.add('active');
                if (targetView === 'usersView' || targetView === 'requestsView' || targetView === 'deviceInfoView') {
                    socket.emit('request_users');
                }
                if (targetView === 'messagingView') {
                    unreadMessagesCount = 0;
                    if (messagingBadge) messagingBadge.style.display = 'none';
                    updatePageTitle();
                }
            } else {
                view.style.display = 'none';
                view.classList.remove('active');
            }
        });
    });
});

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

messageInput.focus();

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

attachBtn.addEventListener('click', () => {
    fileInput.click();
});

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
            uploadProgressContainer.style.display = 'none'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
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

window.cancelCurrentUpload = function () {
    const batchFileIndex = batchFiles.findIndex(f => f.status === 'uploading');
    if (batchFileIndex === -1) {
        // If nothing is uploading, we just cancel everything
        isUploadCancelled = true;
        uploadProgressContainer.style.display = 'none'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
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
        uploadProgressContainer.style.display = 'none'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
        uploadProgressBar.style.width = '0%';
        socket.emit('stop_uploading');
        resetQueueState();
        return;
    }

    isUploading = true;
    uploadProgressContainer.style.display = 'block'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
    const token = appToken;

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
            xhr.setRequestHeader('Authorization', token);

            let lastLoaded = 0;
            let lastTime = Date.now();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round(((bytesUploadedSoFar + event.loaded) / totalBytesToUpload) * 100);
                    uploadProgressBar.style.width = `${percentComplete}%`;
                    const ssFrame = document.getElementById('ssFrame');
                    if (ssFrame && ssFrame.contentWindow) {
                        ssFrame.contentWindow.postMessage({ type: 'progress', progress: percentComplete }, '*');
                    }

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
        uploadProgressContainer.style.display = 'none'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
        uploadProgressBar.style.width = '0%';
        socket.emit('stop_uploading');
        resetQueueState();
    } else {
        setTimeout(() => {
            if (uploadQueue.length === 0 && !isUploading) {
                uploadProgressContainer.style.display = 'none'; if(typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
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

fileInput.addEventListener('change', (e) => {
    const filesToUpload = Array.from(e.target.files);
    uploadFiles(filesToUpload);
    fileInput.value = '';
});

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

function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        socket.emit('send_message', { type: 'text', text });
        socket.emit('stop_typing');
        messageInput.value = '';
        messageInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);

clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all messages everywhere?')) {
        socket.emit('clear_messages');
    }
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message-item';
    div.setAttribute('data-id', message.id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (message.type === 'file') {
        if (message.mimeType && message.mimeType.startsWith('image/')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'privacy-wrapper';
            wrapper.addEventListener('click', (e) => {
                if (!wrapper.classList.contains('revealed')) {
                    e.preventDefault();
                    wrapper.classList.add('revealed');
                }
            });

            const placeholder = document.createElement('div');
            placeholder.className = 'privacy-placeholder';
            placeholder.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11.83 9L15 12.16V12a3 3 0 0 0-3-3h-.17zm-4.3.8l1.55 1.55c-.05.21-.08.42-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7z"/></svg><span>Hidden</span>`;
            wrapper.appendChild(placeholder);

            const img = document.createElement('img');
            img.src = message.url;
            img.className = 'message-image';
            img.alt = message.name;
            wrapper.appendChild(img);
            contentDiv.appendChild(wrapper);
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

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Delete';
    deleteBtn.style.color = '#ef4444';
    deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this from the server history?')) {
            socket.emit('delete_message', message.id);
        }
    });
    actionsDiv.appendChild(deleteBtn);

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
    historySection.scrollTop = historySection.scrollHeight;
});

socket.on('receive_message', (message) => {
    messageList.appendChild(createMessageElement(message));
    const historySection = document.querySelector('.history-section');
    historySection.scrollTop = historySection.scrollHeight;

    const messagingView = document.getElementById('messagingView');
    if (messagingView && !messagingView.classList.contains('active')) {
        unreadMessagesCount++;
        if (messagingBadge) {
            messagingBadge.textContent = unreadMessagesCount;
            messagingBadge.style.display = 'inline-flex';
        }
        updatePageTitle();
    }
});

socket.on('messages_cleared', () => {
    messageList.innerHTML = '';
    unreadMessagesCount = 0;
    if (messagingBadge) messagingBadge.style.display = 'none';
    updatePageTitle();
});

socket.on('message_deleted', (messageId) => {
    const el = document.querySelector(`.message-item[data-id="${messageId}"]`);
    if (el) el.remove();
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

    if (usersBadge) {
        const activeCount = (data.active || []).length;
        usersBadge.textContent = activeCount;
        usersBadge.style.display = 'inline-flex';
    }
    if (requestsBadge) {
        const pendingCount = (data.pending || []).length;
        requestsBadge.textContent = pendingCount;
        requestsBadge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
    }
    updatePageTitle();

    usersList.innerHTML = '';
    blockedList.innerHTML = '';
    requestsList.innerHTML = '';
    deviceInfoList.innerHTML = '';

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

    document.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            socket.emit('admin_action', { action: 'kick', targetId });
        });
    });

    document.querySelectorAll('.block-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-id');
            if (confirm("Are you sure you want to permanently block this IP address?")) {
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

const restartServerBtn = document.getElementById('restartServerBtn');
if (restartServerBtn) {
    restartServerBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to restart the EdgeShare service? All mobile devices will be disconnected and session tokens regenerated.')) {
            restartServerBtn.disabled = true;
            restartServerBtn.style.opacity = '0.6';
            restartServerBtn.style.cursor = 'not-allowed';
            restartServerBtn.innerHTML = 'Restarting...';

            socket.emit('admin_action', { action: 'restart' });

            setTimeout(() => {
                window.location.reload();
            }, 2500);
        }
    });
}

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

const activeUsers = new Map();

function updateActivityIndicator() {
    if (!activityIndicator) return;

    if (activeUsers.size === 0) {
        activityIndicator.classList.remove('active');
        if (typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
        return;
    }

    let textParts = [];
    for (const [id, data] of activeUsers.entries()) {
        const role = data.role === 'phone' ? 'Phone' : 'Desktop';
        let devName = role;
        if (data.deviceInfo && data.deviceInfo !== 'Unknown Device') {
            const parts = data.deviceInfo.split('|');
            if (parts.length === 3) {
                const b = parts[1];
                const o = parts[2];
                if (b !== 'Unknown Browser' && o !== 'Unknown OS') {
                    devName = `${b} on ${o}`;
                } else if (o !== 'Unknown OS') {
                    devName = o;
                } else if (b !== 'Unknown Browser') {
                    devName = b;
                } else {
                    devName = parts[0] === 'mobile' ? 'Mobile' : 'Desktop';
                }
            }
        }

        if (data.type === 'uploading') {
            textParts.push(`${devName} is sharing ${data.count > 1 ? data.count + ' files' : 'a file'}`);
        } else if (data.type === 'typing') {
            textParts.push(`${devName} is typing`);
        }
    }

    activityIndicator.innerHTML = `<span>${textParts.join(', ')}</span><div class="typing-dots"><span></span><span></span><span></span></div>`;
    activityIndicator.classList.add('active');
    const historySection = document.querySelector('.history-section');
    if (historySection) historySection.scrollTop = historySection.scrollHeight;
    if (typeof toggleScreensaverBtn === 'function') toggleScreensaverBtn();
    const ssFrame = document.getElementById('ssFrame');
    if (ssFrame && ssFrame.contentWindow) {
        ssFrame.contentWindow.postMessage({ type: 'remote_uploading' }, '*');
    }
}

socket.on('user_typing', (data) => {
    const existing = activeUsers.get(data.id);
    if (!existing || existing.type !== 'uploading') {
        activeUsers.set(data.id, { type: 'typing', role: data.role, deviceInfo: data.deviceInfo });
        updateActivityIndicator();
    }
});

socket.on('user_stop_typing', (data) => {
    const existing = activeUsers.get(data.id);
    if (existing && existing.type === 'typing') {
        activeUsers.delete(data.id);
        updateActivityIndicator();
    }
});

socket.on('user_uploading', (data) => {
    activeUsers.set(data.id, { type: 'uploading', role: data.role, deviceInfo: data.deviceInfo, count: data.count });
    updateActivityIndicator();
});

socket.on('user_stop_uploading', (data) => {
    const existing = activeUsers.get(data.id);
    if (existing && existing.type === 'uploading') {
        activeUsers.delete(data.id);
        updateActivityIndicator();
    }
});

let typingTimeout = null;
if (typeof messageInput !== 'undefined') {
    messageInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop_typing');
        }, 1500);
    });
}

const screensaverBtn = document.getElementById('screensaverBtn');
if (screensaverBtn) {
    screensaverBtn.addEventListener('click', () => {
        let ssFrame = document.getElementById('ssFrame');
        if (!ssFrame) {
            ssFrame = document.createElement('iframe');
            ssFrame.id = 'ssFrame';
            ssFrame.src = 'screensaver.html';
            ssFrame.allow = 'fullscreen; screen-wake-lock';
            ssFrame.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; border:none; z-index:999999; background:#000;';
            document.body.appendChild(ssFrame);
            
            try {
                if (ssFrame.requestFullscreen) {
                    ssFrame.requestFullscreen().catch(e => console.log(e));
                } else if (ssFrame.webkitRequestFullscreen) {
                    ssFrame.webkitRequestFullscreen();
                }
            } catch(e) {}
            
            const closeHandler = (e) => {
                if (e.data === 'close_screensaver') {
                    if (ssFrame && ssFrame.parentNode) {
                        ssFrame.parentNode.removeChild(ssFrame);
                    }
                    window.removeEventListener('message', closeHandler);
                }
            };
            window.addEventListener('message', closeHandler);
        }
    });
}

function toggleScreensaverBtn() {
    const btn = document.getElementById('screensaverBtn');
    if (!btn) return;
    
    let isRemoteUploading = false;
    if (typeof activeUsers !== 'undefined') {
        for (const data of activeUsers.values()) {
            if (data.type === 'uploading') {
                isRemoteUploading = true;
                break;
            }
        }
    }
    
    if (isUploading || isRemoteUploading) {
        btn.style.display = 'flex';
    } else {
        btn.style.display = 'none';
    }
}
