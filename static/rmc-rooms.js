///////// RMC-ROOMS //////////////

let client = null; 
let current = null;
const MESSAGE_ID = 1; 
const activeSeeds = new Map();
const fileChunks = new Map(); // fileName -> { chunks: [], totalChunks: 0, fileSize: 0 }
        
    function getRoomPassword() {
        const hostEl = document.getElementById('hostpassword');
        const joinEl = document.getElementById('password');
        const hostPw = hostEl && hostEl.value ? hostEl.value.trim() : '';
        const joinPw = joinEl && joinEl.value ? joinEl.value.trim() : '';
        return hostPw || joinPw;
    }

    const WIRE_CHAT_KDF_SALT = new TextEncoder().encode('ratemycop-wire-chat-v1'); /// add variable salt
    const WIRE_CHAT_KDF_ITERATIONS = 150000;

    function uint8ToBase64(bytes) {
        let binary = '';
        const len = bytes.length;
        const chunk = 0x8000;
        for (let i = 0; i < len; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
        }
        return btoa(binary);
    }

    function base64ToUint8(b64) {
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    async function deriveWireChatKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: WIRE_CHAT_KDF_SALT,
                iterations: WIRE_CHAT_KDF_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-CBC', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /** Same pattern as QR w encrypted offer.html: PBKDF2 + AES-CBC, IV prepended; returns base64 ciphertext blob. */
    async function encryptWireChatObject(obj, password) {
        const jsonString = JSON.stringify(obj);
        const enc = new TextEncoder();
        const key = await deriveWireChatKey(password);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv },
            key,
            enc.encode(jsonString)
        );
        const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.byteLength);
        return uint8ToBase64(combined);
    }

    async function decryptWireChatObject(ciphertextB64, password) {
        const combined = base64ToUint8(ciphertextB64);
        if (combined.length < 17) throw new Error('Invalid ciphertext');
        const iv = combined.slice(0, 16);
        const data = combined.slice(16);
        const key = await deriveWireChatKey(password);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv },
            key,
            data
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
    }

        function get_trackers() {
            const trackerText = document.getElementById('trackerList').value;
            return trackerText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && line.startsWith('wss://'));
        }

function create_client() {
    const trackers = get_trackers();
    DOM.toggle.style.display = 'block';
    console.log('Creating WebTorrent client with trackers:', trackers);
    return new WebTorrent({
        dht: false,    
        lsd: true,     
        announce: trackers
    });
}
        
function create_magnet(torrent) {  
            // Extract just the infohash and metadata from the torrent
    const infoHash = torrent.infoHash;
    const name = torrent.name || 'Unknown';
    const size = torrent.length || 0;
    const trackers = get_trackers();
    const trackerParams = trackers.map(tracker => `tr=${encodeURIComponent(tracker)}`).join('&');
    const magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}&xl=${size}&${trackerParams}`;
    return magnetLink;
}
        //move this top top of code???

function formatSpeed(bytes) {
            const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
            let speed = bytes;
            let unitIndex = 0;
            while (speed >= 1024 && unitIndex < units.length - 1) {
                speed /= 1024;
                unitIndex++;
            }
            return `${speed.toFixed(1)} ${units[unitIndex]}`;
        }
        ///lots of style stuff in update_info can be moved
function update_info() {
            if (!current) return;
            const roomStatus = document.getElementById('roomStatus');
            const downloadSpeed = document.getElementById('downloadSpeed');
            const uploadSpeed = document.getElementById('uploadSpeed');
            const info = document.getElementById('info');
            const magnetLink = document.getElementById('magnetLink')
            roomStatus.textContent = current.ready ? 'Connected' : 'Connecting...';
            downloadSpeed.textContent = `${formatSpeed(current.downloadSpeed)}`;
            uploadSpeed.textContent = `${formatSpeed(current.uploadSpeed)}`;
            magnetLink.textContent = create_magnet(current)
           
            // Create a container for the magnet link and copy button
            /// THIS SHOULD NOT BE REFRESHED EVERY TIME INFO UPDATES
            const magnetContainer = document.createElement('div');
            magnetContainer.style.cssText = `
                display: flex;
                gap: 10px;
                align-items: center;
                margin: 10px 0;
            `;
            const magnetInput = document.createElement('input');
            magnetInput.value = create_magnet(current);
            magnetInput.readOnly = true;
            
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy';
            copyButton.style.cssText = `
                padding: 8px 16px;
                background: #2196f3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            `;
            copyButton.onclick = () => {
                magnetInput.select();
                document.execCommand('copy');
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 2000);
            };
            
            magnetContainer.appendChild(magnetInput);
            magnetContainer.appendChild(copyButton);
            
            // Create the rest of the room info
            const infoObj = {
                infoHash: current.infoHash,
                peers: current.wires.map(wire => ({
                    peerId: wire.peerId,
                    type: wire.type,
                    remoteAddress: wire.remoteAddress
                }))
            };
            
            // Clear and update the room info section
            info.replaceChildren();
            info.appendChild(magnetContainer);
            
            // Create compact room info display
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = `
                margin-top: 8px;
                font-size: 11px;
                color: #cccccc;
                line-height: 1.3;
                word-break: break-all;
            `;
            
            // Format the room info as compact text with full strings
            const peerCount = infoObj.peers.length;
            
            let infoText = `🌐: ${infoObj.infoHash}\nPeers: ${peerCount}`;
            
            if (peerCount > 0) {
                const peerDetails = infoObj.peers.map((peer, index) => {
                    const peerInfo = `\nid: ${peer.peerId} (${peer.type || 'unknown'}) }`;
                    const addressInfo = peer.remoteAddress ? `\n👤 { ${peer.remoteAddress}` : '';
                    return addressInfo + peerInfo;
                }).join(', ');
                infoText += ` | ${peerDetails}`;
            }
            
            infoDiv.textContent = infoText;
            info.appendChild(infoDiv);
        }

function display_files(files) {
    ///const file = files[0];
    const fileDisplay = document.getElementById('display-files');
    files.forEach(file => {
        file.getBlobURL((err, url) => {
            if (err) {
                console.error('Error getting blob URL:', err);
                fileDisplay.textContent = 'Error creating download link';
                return;
            }

                        // Add file preview
            const previewDiv = document.createElement('div');
            previewDiv.className = 'file-preview';
            previewDiv.style.cssText = `
                margin-top: 10px;
                padding: 10px;
                background: #1a1a1a;
                color: #ffffff;
                border-radius: 4px;
                border: 1px solid #444;
            `;

        // Handle different file types
            const fileName = file.name
            const fileType = fileName.split('.').pop().toLowerCase();
                        
            if (fileType.match(/^(jpg|jpeg|png|gif|webp)$/)) {
            // Image preview
                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = `
                    max-width: 100%;
                    max-height: 300px;
                    border-radius: 4px;
                `;
                previewDiv.appendChild(img);
            } else if (fileType === 'pdf') {
                            // PDF preview
                const iframe = document.createElement('iframe');
                iframe.src = url;
                iframe.style.cssText = `
                    width: 100%;
                    height: 300px;
                    border: none;
                    border-radius: 4px;
                `;
                previewDiv.appendChild(iframe);
            } else if (fileType.match(/^(mp4|webm|ogg)$/)) {
                            // Video preview
                const video = document.createElement('video');
                video.src = url;
                video.controls = true;
                video.style.cssText = `
                    max-width: 100%;
                    max-height: 300px;
                    border-radius: 4px;
                `;
                previewDiv.appendChild(video);
            } else if (fileType.match(/^(mp3|wav|ogg)$/)) {
            // Audio preview
                const audio = document.createElement('audio');
                audio.src = url;
                audio.controls = true;
                audio.style.cssText = `
                    width: 100%;
                    margin-top: 10px;
                `;
                previewDiv.appendChild(audio);
            } else if (fileType.match(/^(txt|json|js|css|html|md)$/)) {   
    // Text file preview
                const textPreview = document.createElement('div');
                textPreview.style.cssText = `
                    max-height: 200px;
                    overflow-y: auto;
                    background: #2a2a2a;
                    color: #ffffff;
                    padding: 10px;
                    border-radius: 4px;
                    font-family: monospace;
                    white-space: pre-wrap;
                    word-break: break-all;
                `;

                file.getBlob((err, blob) => {
                    if (err) {
                        textPreview.textContent = 'Error reading file';
                        return;
                    }

                const reader = new FileReader();
                reader.onload = () => {
                    textPreview.textContent = reader.result;

                    if (fileType === 'json') {
                        const addButton = document.createElement('button');
                        addButton.textContent = 'Add to archive';
                        addButton.style.cssText = `
                            margin-top: 10px;
                            padding: 6px 12px;
                            background: #007bff;
                            color: #fff;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                        `;

                        addButton.onclick = () => {
                            try {
                                const parsedJSON = JSON.parse(reader.result);
                                load_json(parsedJSON);
                            } catch (e) {
                                console.error('Invalid JSON:', e);
                                alert('This JSON file is invalid.');
                            }
                        };

                        previewDiv.appendChild(addButton);
                    }
                };

                reader.readAsText(blob);
            });

            previewDiv.appendChild(textPreview);
            } else {
                appendGenericFilePreview(previewDiv, fileName, file.size);
            }

            fileDisplay.appendChild(previewDiv);
        });
    });
}

function load_json(importedData) {
    copsData = importedData;
    processCopsData(copsData);
    // force search refresh
   // performSearch(DOM.searchInput.value.toLowerCase());
    DOM.toggle.style.display = 'block';
}

function join_settings() {
    DOM.homecontainer.style.display = 'none';
    DOM.joinsettings.style.display = 'block';
    ///// MAYBE MODULARIZE THIS, password.style.display, magnet.style.display, trackers.style.display, or accept duplication of pw field
}
function host_settings(){
    DOM.homecontainer.style.display = 'none';
    DOM.hostsettings.style.display = 'block';
}

function host_room() {
    DOM.connectionInfo.style.display = 'block';
    const fileInput = document.getElementById('hostfiles');
    const selectedFiles = fileInput.files ? Array.from(fileInput.files) : [];

    const startHosting = (files = null) => {
        client = create_client();

        client.on('error', (err) => {
            console.error('WebTorrent client error:', err);
            displayError('Connection error: ' + err.message);
        });

        const roomId = Math.random().toString(16).substr(2, 9);

        const roomData = new Blob([JSON.stringify({
            roomId: roomId,
            created: Date.now()
        })], { type: 'application/json' });

        const dataToSeed = (files && files.length > 0) ? files : roomData;

        const seedOptions = {
            announce: get_trackers()
        };

        // If no files selected, name torrent after room
        if (!files || files.length === 0) {
            seedOptions.name = roomId;
        }

        client.seed(dataToSeed, seedOptions, (torrent) => {
            current = torrent;

            start_chat();
            setInterval(update_info, 1000);

            if (files && files.length > 0) {
                display_files(torrent.files);
            }
        });
    };

    // Decide automatically based on file input
    if (selectedFiles.length > 0) {
        startHosting(selectedFiles);
    } else {
        startHosting();
    }
}

function join_room() {
    DOM.connectionInfo.style.display = 'block';
    client = create_client();
    client.on('error', (err) => {
        console.error('WebTorrent client error:', err);
        displayError('Connection error: ' + err.message);
    });   
    const magnetLink = document.getElementById('magnetLink').value;
    console.log('Joining room with magnet link:', magnetLink);    

    const progress = document.getElementById('progress');

       // Show download status
    const statusDiv = document.createElement('div');
    statusDiv.className = 'download-status';
    const progressOuter = document.createElement('div');
    progressOuter.className = 'progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.width = '0%';
    progressOuter.appendChild(progressBar);
    statusDiv.appendChild(progressOuter);
            
    // Append status to the message element
    progress.appendChild(statusDiv);
    
    client.add(magnetLink, {
        announce: get_trackers()
    }, (torrent) => {
        console.log('Successfully joined room:', torrent.infoHash);
        current = torrent;
        start_chat();
        setInterval(update_info, 1000);
                
        torrent.on('error', (err) => {
            console.error('Torrent error:', err);
            displayError('Room connection error: ' + err.message);
        });
        torrent.on('warning', (err) => {
            console.warn('Torrent warning:', err);
        }); 

        torrent.on('download', () => {
            const progress = (torrent.progress * 100).toFixed(1);
            statusDiv.querySelector('.progress-bar').style.width = `${progress}%`;
          //  statusDiv.querySelector('.download-speed').textContent = formatSpeed(torrent.downloadSpeed);
           // statusDiv.querySelector('.peers').textContent = `${torrent.numPeers} peers`;
        });

        torrent.on('done', () => {
            files = torrent.files
            client.seed(torrent)
            display_files(files);   
        });
    });
}

function start_chat() { 
           // document.getElementById('controls').style.display = 'none';
            DOM.joinsettings.style.display = 'none';
            DOM.hostsettings.style.display = 'none';
            document.getElementById('chat').style.display = 'block';
            // Set up listeners for existing wires (if any)
            if (current.wires && current.wires.length > 0) {
                current.wires.forEach(wire => {
                    console.log('Setting up listener for existing wire:', wire.peerId);
                    setup_wire(wire);
                });
            }
            
            // Set up WebRTC wire listeners for chat
            current.on('wire', (wire) => {
                console.log('New wire connected:', wire.peerId);
                setup_wire(wire);
                // Update connection info when peers connect
                update_info();
            });

            // Also update when peers disconnect
            current.on('wire-disconnect', () => {
                console.log('Wire disconnected');
                update_info();
            });
}

function setup_wire(wire) {
            wire.on('handshake', (infoHash, peerId) => {
                console.log('Handshake completed with peer:', peerId);
                sendPingMessage(wire);
            });
            wire.on('error', (err) => {
                console.error('Wire error:', err);
            });
            wire.on('extended', (ext, msg) => {
                if (ext === 'ut_metadata') { 
                    try {
                        if (msg instanceof Uint8Array) {
                            const decoder = new TextDecoder();
                            const str = decoder.decode(msg);
                            
                            try {
                                const jsonStart = str.indexOf('{');
                                if (jsonStart !== -1) {
                                    const jsonEnd = str.lastIndexOf('}') + 1;
                                    if (jsonEnd > jsonStart) {
                                        const jsonStr = str.substring(jsonStart, jsonEnd);
                                        if (jsonStr.trim().length > 0) {
                                            const parsedMsg = JSON.parse(jsonStr);

                                            if (parsedMsg.type === 'chat_enc' && parsedMsg.ciphertext) {
                                                console.log('[wire chat] received encrypted (JSON envelope):', jsonStr);
                                                console.log('[wire chat] received encrypted (ciphertext base64):', parsedMsg.ciphertext);
                                                console.log('[wire chat] peer:', wire.peerId, 'timestamp:', parsedMsg.timestamp);
                                                void (async () => {
                                                    const pw = getRoomPassword();
                                                    if (!pw) {
                                                        displayError('Encrypted chat received; enter the room password (host or join field) to decrypt.');
                                                        return;
                                                    }
                                                    try {
                                                        const inner = await decryptWireChatObject(parsedMsg.ciphertext, pw);
                                                        if (inner.type === 'chat' && inner.message != null) {
                                                            displayMessage(inner.message, false, wire.peerId);
                                                        }
                                                    } catch (e) {
                                                        console.error(e);
                                                        displayError('Could not decrypt chat (wrong password or corrupt message).');
                                                    }
                                                })();
                                            } else if (parsedMsg.type === 'chat' && parsedMsg.message) {
                                                displayMessage(parsedMsg.message, false, wire.peerId);
                                            } else if (parsedMsg.type === 'file_share') { 
                                                displayDirectFileShareMessage(parsedMsg, false, wire.peerId);
                                            } else if (parsedMsg.type === 'file_chunk') {
                                                handleFileChunk(parsedMsg, wire);
                                            } else if (parsedMsg.type === 'rating') {
                                                const rating = parsedMsg.message;
                                                display_rating(rating, wire.peerId);
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                // Only log if it's not an empty string or obvious parsing error
                                if (e.message !== 'Unexpected end of JSON input' && e.message !== 'JSON.parse: unexpected end of data') {
                                    console.log('Not a JSON message, ignoring:', e);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error processing message:', err);
                    }
                }
            });
        }

async function sendMessage() {
            const message = document.getElementById('messageInput').value;
            if (!message) return;
            if (!current || !current.wires || current.wires.length === 0) return;

            const pw = getRoomPassword();
            const ts = Date.now();

            console.log('Sending message to peers:', current.wires.length);

            try {
                for (const wire of current.wires) {
                    if (pw) {
                        const inner = { type: 'chat', message, timestamp: ts };
                        const ciphertext = await encryptWireChatObject(inner, pw);
                        sendBencodeMessage(wire, {
                            type: 'chat_enc',
                            ciphertext,
                            timestamp: ts
                        });
                    } else {
                        sendBencodeMessage(wire, {
                            type: 'chat',
                            message,
                            timestamp: ts
                        });
                    }
                }
                displayMessage(message, true, client.peerId);
                document.getElementById('messageInput').value = '';
            } catch (err) {
                console.error(err);
                displayError('Could not send message: ' + err.message);
            }
        }

function sendBencodeMessage(wire, messageObj) {
            try {
                const jsonStr = JSON.stringify(messageObj);
                // Format as bencode: "d8:msg_typei0e5:piecei0ee" + JSON
                const bencodeStr = `d8:msg_typei0e5:piecei0ee${jsonStr}`;
                const encoder = new TextEncoder();
                const messageData = encoder.encode(bencodeStr);
                wire.extended('ut_metadata', messageData);
                console.log('Message sent to peer:', wire.peerId, messageObj);
            } catch (err) {
                console.error('Error sending message:', err);
            }
        }

function displayMessage(message, isMine = false, peerId = null) {
            if (typeof message === 'object' && message.type === 'file_share') {
                // Handle direct file sharing (no magnet URI)
                if (message.data) {
                    displayDirectFileShareMessage(message, isMine, peerId);
                } else {
                    // is this needed?
                    displayFileShareMessage(message.fileName, message.fileSize, message.magnetURI, isMine, peerId);
                }
            } else {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message original ${isMine ? 'mine' : ''}`;
                
                const messageContent = document.createElement('div');
                messageContent.className = 'message-content';
                
                const messageHeader = document.createElement('div');
                messageHeader.className = 'message-header';
                const peerDisplay = isMine ? 'me' : (peerId ? peerId : 'Peer');
                const idSpan = document.createElement('span');
                idSpan.className = 'message-id';
                idSpan.textContent = peerDisplay;
                messageHeader.appendChild(idSpan);
                
                const divider = document.createElement('div');
                divider.style.cssText = 'border: 1px solid rgb(134, 134, 134); max-width: 50%';
                
                const messageBody = document.createElement('div');
                messageBody.className = 'message-body';
                messageBody.textContent = message;
                
                messageContent.appendChild(messageHeader);
                messageContent.appendChild(divider);
                messageContent.appendChild(messageBody);
                messageDiv.appendChild(messageContent);
                
                document.getElementById('messages').appendChild(messageDiv);
                messageDiv.scrollIntoView();
            }
        }

///CAN WE ADD THE PASSWORD CHECK TO THE PING MESSAGE?
function sendPingMessage(wire) {
    const messageObj = { type: 'ping', timestamp: Date.now() };
    sendBencodeMessage(wire, messageObj);
}

function sendRatingMessage(rating) {
    //const message = JSON.stringify(rating);
    current.wires.forEach(wire => {
        const messageObj = {
            type: 'rating',
            message: rating,
            timestamp: Date.now()
        };
        sendBencodeMessage(wire, messageObj);
        console.log('Rating shared with peer:', wire.peerId);
    });
    display_rating(rating, client.peerId);
}
   // const encoder = new TextEncoder();
   // const messageData = encoder.encode(ratingMessage);
        /// is there a benefit to the TextEncoder? does that even work?
   // current.wires.forEach(wire => {
     //   wire.extended('rating', messageData);  // Send the message with the 'rating' type

function display_rating(rating, peerid){
    const container = document.createElement('div');
    container.className = 'room-rating';

    const copList = rating.cops
        .map(c => `${c.first} ${c.last} ${c.rank ? '- ' + c.rank : ''} ${c.dept ? '- ' + c.dept : ''}`)
        .join(', ');

    const pHead = document.createElement('p');
    const sHead = document.createElement('strong');
    sHead.textContent = 'Shared Rating from ' + peerid;
    pHead.appendChild(sHead);
    container.appendChild(pHead);

    const pCops = document.createElement('p');
    const sCops = document.createElement('strong');
    sCops.textContent = 'Cops:';
    pCops.appendChild(sCops);
    pCops.appendChild(document.createTextNode(' ' + copList));
    container.appendChild(pCops);

    const pTime = document.createElement('p');
    const sTime = document.createElement('strong');
    sTime.textContent = 'Time:';
    pTime.appendChild(sTime);
    pTime.appendChild(document.createTextNode(' ' + (rating.time != null ? String(rating.time) : '')));
    container.appendChild(pTime);

    const pLoc = document.createElement('p');
    const sLoc = document.createElement('strong');
    sLoc.textContent = 'Location:';
    pLoc.appendChild(sLoc);
    pLoc.appendChild(document.createTextNode(' ' + (rating.location != null ? String(rating.location) : '')));
    container.appendChild(pLoc);

    const pDesc = document.createElement('p');
    pDesc.textContent = rating.description != null ? String(rating.description) : '';
    container.appendChild(pDesc);

    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'merge-rating';
    mergeBtn.textContent = 'add rating to archive';
    mergeBtn.addEventListener('click', () => {
        mergeCopsData(rating);
        mergeBtn.remove();
        const done = document.createElement('p');
        done.textContent = '✔ added to archive';
        container.appendChild(done);
    });
    container.appendChild(mergeBtn);

    document.getElementById('messages').appendChild(container);
}

function setupRoomInputListeners() {
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    if (!messageInput || !fileInput) return;

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file size (e.g., 100MB limit)
        const maxSize = 10000 * 1024 * 1024; // 10GB
        if (file.size > maxSize) {
            alert('File too large. Maximum size is 100MB');
            return;
        }

        // Send file directly over existing wire connections
        current.wires.forEach(wire => {
            if (file.size < 1024 * 1024) { // Small files (< 1MB)
                sendFileDirectly(file, wire);
            } else { // Larger files
                sendFileChunked(file, wire);
            }
        });

        // Display file share message
        displayFileShareMessage(file.name, file.size, null, true, client.peerId);
    });
}

        function formatFileSize(bytes) {
            const units = ['B', 'KB', 'MB', 'GB'];
            let size = bytes;
            let unitIndex = 0;
            
            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }
            
            return `${size.toFixed(1)} ${units[unitIndex]}`;
        }

function displayFileShareMessage(fileName, fileSize, magnetURI, isMine, peerId = null) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                margin: 10px 0;
                padding: 10px;
                background: ${isMine ? '#1a3a5a' : '#2a2a2a'};
                color: #ffffff;
                border-radius: 4px;
                border: 1px solid #444;
            `;
            
            // Add data attribute for finding this message later
            messageDiv.setAttribute('data-magnet', magnetURI);
            
            const fileInfo = document.createElement('div');
            const peerDisplay = isMine ? 'You' : (peerId ? `Peer ${peerId.substring(0, 8)}` : 'Peer');
            fileInfo.textContent = `${peerDisplay} shared: ${fileName} (${formatFileSize(fileSize)})`;
            messageDiv.appendChild(fileInfo);
            
            document.getElementById('messages').appendChild(messageDiv);
            messageDiv.scrollIntoView();
        }

function handleTorrentErrors(torrent) {
            torrent.on('error', (err) => {
                console.error('Torrent error:', err);
                // Attempt to recover
                if (err.message.includes('connection')) {
                    torrent.reconnect();
                }
            });
        }

function handleWireErrors(wire) {
            wire.on('error', (err) => {
                console.error('Wire error:', err);
                // Attempt to reconnect
                if (wire.remoteAddress) {
                    client.add(wire.remoteAddress);
                }
            });
        }

function cleanupTorrent(torrent) {
            // Remove from active seeds
            activeSeeds.delete(torrent.magnetURI);
            
            // Destroy the torrent
            torrent.destroy((err) => {
                if (err) console.error('Error destroying torrent:', err);
            });
        }

window.addEventListener('beforeunload', () => {
            // Clean up all active torrents
            for (const [magnetURI, seedInfo] of activeSeeds) {
                cleanupTorrent(seedInfo.torrent);
            }
            activeSeeds.clear();
        });

function displayError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                margin: 10px 0;
                padding: 10px;
                background: #3a1a1a;
                color: #ffcccc;
                border-radius: 4px;
                border: 1px solid #5a2a2a;
            `;
            errorDiv.textContent = message;
            document.getElementById('messages').appendChild(errorDiv);
            errorDiv.scrollIntoView();
        }

function updateSeedingStatus(torrent) {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'seeding-status';
            statusDiv.style.cssText = `
                margin: 10px 0;
                padding: 10px;
                background: #1a3a1a;
                color: #ffffff;
                border-radius: 4px;
                border: 1px solid #2a5a2a;
            `;
            
            const updateStats = () => {
                statusDiv.replaceChildren();
                const d1 = document.createElement('div');
                d1.textContent = 'Seeding: ' + (torrent.name || '');
                const d2 = document.createElement('div');
                d2.textContent = 'Peers: ' + torrent.numPeers;
                const d3 = document.createElement('div');
                d3.textContent = 'Upload Speed: ' + formatSpeed(torrent.uploadSpeed);
                statusDiv.append(d1, d2, d3);
            };
            
            // Update stats every second
            const interval = setInterval(updateStats, 1000);
            updateStats();
            
            // Store the interval ID for cleanup
            torrent.on('close', () => clearInterval(interval));
            
            document.getElementById('messages').appendChild(statusDiv);
        }

//// file share over wire
function sendFileDirectly(file, wire) {
            const reader = new FileReader();
            reader.onload = () => {
                const fileData = {
                    type: 'file_share',
                    fileName: file.name,
                    fileSize: file.size,
                    data: reader.result, // Base64 encoded file data
                    timestamp: Date.now()
                };
                
                // Send via existing wire connection
                sendBencodeMessage(wire, fileData);
            };
            reader.readAsDataURL(file);
        }

function displayDirectFileShareMessage(fileMessage, isMine, peerId = null) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                margin: 10px 0;
                padding: 10px;
                background: ${isMine ? '#1a3a5a' : '#2a2a2a'};
                color: #ffffff;
                border-radius: 4px;
                border: 1px solid #444;
            `;
            
            // Add data attribute for finding this message later
            messageDiv.setAttribute('data-file-name', fileMessage.fileName);
            
            const fileInfo = document.createElement('div');
            const peerDisplay = isMine ? 'You' : (peerId ? `Peer ${peerId.substring(0, 8)}` : 'Peer');
            fileInfo.textContent = `${peerDisplay} shared: ${fileMessage.fileName} (${formatFileSize(fileMessage.fileSize)})`;
            messageDiv.appendChild(fileInfo);
            
            if (!isMine && fileMessage.data) {
                handleDirectFileDownload(fileMessage);
                //messageDiv.appendChild(downloadButton);
            }
            
            document.getElementById('messages').appendChild(messageDiv);
            messageDiv.scrollIntoView();
        }

function handleDirectFileDownload(fileMessage) {
            try {
                // Convert base64 data URL to blob
                const response = fetch(fileMessage.data);
                response.then(res => res.blob()).then(blob => {
                    // Create download link
                    const url = URL.createObjectURL(blob);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = url;
                    downloadLink.download = fileMessage.fileName;
                    
                    // Create file preview
                    const previewDiv = document.createElement('div');
                    previewDiv.className = 'file-preview';
                    previewDiv.style.cssText = `
                        margin-top: 10px;
                        padding: 10px;
                        background: #1a1a1a;
                        color: #ffffff;
                        border-radius: 4px;
                        border: 1px solid #444;
                    `;

                    // Handle different file types
                    const fileType = fileMessage.fileName.split('.').pop().toLowerCase();
                    
                    if (fileType.match(/^(jpg|jpeg|png|gif|webp)$/)) {
                        // Image preview
                        const img = document.createElement('img');
                        img.src = url;
                        img.style.cssText = `
                            max-width: 100%;
                            max-height: 300px;
                            border-radius: 4px;
                        `;
                        previewDiv.appendChild(img);
                    } else if (fileType === 'pdf') {
                        // PDF preview
                        const iframe = document.createElement('iframe');
                        iframe.src = url;
                        iframe.style.cssText = `
                            width: 100%;
                            height: 300px;
                            border: none;
                            border-radius: 4px;
                        `;
                        previewDiv.appendChild(iframe);
                    } else if (fileType.match(/^(mp4|webm|ogg)$/)) {
                        // Video preview
                        const video = document.createElement('video');
                        video.src = url;
                        video.controls = true;
                        video.style.cssText = `
                            max-width: 100%;
                            max-height: 300px;
                            border-radius: 4px;
                        `;
                        previewDiv.appendChild(video);
                    } else if (fileType.match(/^(mp3|wav|ogg)$/)) {
                        // Audio preview
                        const audio = document.createElement('audio');
                        audio.src = url;
                        audio.controls = true;
                        audio.style.cssText = `
                            width: 100%;
                            margin-top: 10px;
                        `;
                        previewDiv.appendChild(audio);
                    } else if (fileType.match(/^(txt|json|js|css|html|md)$/)) {
                        // Text file preview
                        const textPreview = document.createElement('div');
                        textPreview.style.cssText = `
                            max-height: 200px;
                            overflow-y: auto;
                            background: #2a2a2a;
                            color: #ffffff;
                            padding: 10px;
                            border-radius: 4px;
                            font-family: monospace;
                            white-space: pre-wrap;
                            word-break: break-all;
                        `;
                        
                        // Read and display text content
                        const reader = new FileReader();
                        reader.onload = () => {
                            textPreview.textContent = reader.result;
                            if (fileType === 'json') {
                                const addButton = document.createElement('button');
                                addButton.textContent = 'Add to archive';
                                addButton.style.cssText = `
                                    margin-top: 10px;
                                    padding: 6px 12px;
                                    background: #007bff;
                                    color: #fff;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                `;

                                addButton.onclick = () => {
                                    try {
                                        const parsedJSON = JSON.parse(reader.result);
                                        load_json(parsedJSON);
                                    } catch (e) {
                                        console.error('Invalid JSON:', e);
                                        alert('This JSON file is invalid.');
                                    }
                                };

                                previewDiv.appendChild(addButton);
                            }        
                        };
                        reader.readAsText(blob);
                        
                        previewDiv.appendChild(textPreview);
                    } else {
                        appendGenericFilePreview(previewDiv, fileMessage.fileName, fileMessage.fileSize);
                    }
                    let messageElement = null;
                    document.querySelectorAll('[data-file-name]').forEach(el => {
                        if (el.getAttribute('data-file-name') === fileMessage.fileName) messageElement = el;
                    });
                    if (messageElement) {
                        messageElement.appendChild(downloadLink);
                        messageElement.appendChild(previewDiv);
                    }
                }).catch(err => {
                    console.error('Error processing file download:', err);
                    displayError('Error downloading file: ' + err.message);
                });
            } catch (err) {
                console.error('Error handling direct file download:', err);
                displayError('Error processing file: ' + err.message);
            }
        }

function sendFileChunked(file, wire) {
            const chunkSize = 32 * 1024; // 64KB chunks
            const totalChunks = Math.ceil(file.size / chunkSize);
            
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                
                const reader = new FileReader();
                reader.onload = () => {
                    const chunkData = {
                        type: 'file_chunk',
                        fileName: file.name,
                        chunkIndex: i,
                        totalChunks: totalChunks,
                        data: reader.result,
                        timestamp: Date.now()
                    };
                    
                    sendBencodeMessage(wire, chunkData);
                };
                reader.readAsDataURL(chunk);
            }
        }

function setupFileStreaming(wire) {
            wire.on('extended', (ext, msg) => {
                if (ext === 'ut_metadata') {
                    const message = parseBencodeMessage(msg);
                    
                    if (message.type === 'file_stream_start') {
                        // Initialize file stream
                        const fileStream = {
                            fileName: message.fileName,
                            fileSize: message.fileSize,
                            chunks: [],
                            receivedChunks: 0
                        };
                        
                        // Send acknowledgment
                        sendBencodeMessage(wire, {
                            type: 'file_stream_ready',
                            fileName: message.fileName
                        });
                    }
                    
                    if (message.type === 'file_stream_chunk') {
                        // Handle incoming file chunk
                        handleFileChunk(message, wire);
                    }
                }
            });
        }

        function handleFileChunk(chunkMessage, wire) {
            const { fileName, chunkIndex, totalChunks, data, fileSize } = chunkMessage;
            
            // Initialize storage if first chunk
            if (!fileChunks.has(fileName)) {
                fileChunks.set(fileName, {
                    binaryChunks: new Map(), // Only store binary data
                    totalChunks: totalChunks,
                    fileSize: fileSize,
                    receivedChunks: 0,
                    wire: wire,
                    lastActivity: Date.now()
                });
            }
            
            const fileData = fileChunks.get(fileName);
            fileData.lastActivity = Date.now();
            
            // Convert base64 to binary and store only binary
            const base64 = data.split(',')[1];
            const binaryData = atob(base64);
            const byteArray = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                byteArray[i] = binaryData.charCodeAt(i);
            }
            
            // Store only binary data (base64 is automatically garbage collected)
            fileData.binaryChunks.set(chunkIndex, byteArray);
            fileData.receivedChunks++;
            
            console.log(`Received chunk ${chunkIndex + 1}/${totalChunks} for ${fileName}`);
            
            // Check if complete
            if (fileData.receivedChunks === totalChunks) {
                console.log(`All chunks received for ${fileName}, reassembling...`);
                reassembleFile(fileName);
            }
        }

        function reassembleFile(fileName) {
            const fileData = fileChunks.get(fileName);
            if (!fileData) return;
            
            try {
                // Combine binary chunks directly (no conversion needed)
                const allChunks = [];
                for (let i = 0; i < fileData.totalChunks; i++) {
                    const chunk = fileData.binaryChunks.get(i);
                    if (!chunk) {
                        console.error(`Missing chunk ${i} for ${fileName}`);
                        return;
                    }
                    allChunks.push(chunk);
                    
                    // Clean up chunk immediately after using it
                    fileData.binaryChunks.delete(i);
                }
                
                // Create blob from binary chunks
                const blob = new Blob(allChunks);
                
                // Display the reassembled file
                displayDirectFileShareMessage({
                    type: 'file_share',
                    fileName: fileName,
                    fileSize: blob.size,
                    data: URL.createObjectURL(blob)
                }, false, fileData.wire.peerId);
                
                // Clean up storage
                fileChunks.delete(fileName);
                
                console.log(`Successfully reassembled ${fileName}`);
                
            } catch (err) {
                console.error('Error reassembling file:', err);
                displayError('Error reassembling file: ' + err.message);
            }
        }
     
////// QR PEERS //////
const qrPeers = new Map(); // peerId -> { id, channel, connection, type: 'qr' }

let qrStream = null;
let qrInterval = null;
let currentConnection = null;
let currentPassword = getRoomPassword(); //ENSURE COMPATIBILITY // TREAT QR-PEERS like trusted peers but send over webrtc not wire
let pendingAction = null;

        function showStatus(message, type = 'info') {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = message;
            statusDiv.className = type;
        }
function show_qrcontainer() {
    DOM.QRcontainer.style.display = 'block';
    DOM.chat.style.display = 'none';
}

async function generateWebRTCOffer() {
    const currentPassword = getRoomPassword();
            try {
                console.log('generateWebRTCOffer started'); // Debug log
                console.log('Current password:', currentPassword ? 'set' : 'not set'); // Debug log
                
                if (!currentPassword) { ///MAKE THIS SHOW THE ROOM PASSWORD FIELD FOR ADDING ONE!! 
                    throw new Error('No password set for encryption');
                }
                showStatus('Creating WebRTC offer...', 'info');
                // Check if WebRTC is supported
                if (!window.RTCPeerConnection) {
                    throw new Error('WebRTC is not supported in this browser');
                }
                // Create RTCPeerConnection
                const connection = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' }
                    ]
                });
                console.log('RTCPeerConnection created'); // Debug log
                // Add connection state monitoring
                connection.onconnectionstatechange = () => {
                    console.log('Connection state:', connection.connectionState);
                    if (connection.connectionState === 'connected') {
                        showStatus('WebRTC connection established!', 'success');
                    } else if (connection.connectionState === 'failed') {
                        showStatus('WebRTC connection failed!', 'error');
                    }
                };
                // Add ICE connection state monitoring
                connection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state:', connection.iceConnectionState);
                    if (connection.iceConnectionState === 'connected') {
                        showStatus('ICE connection established!', 'success');
                    } else if (connection.iceConnectionState === 'failed') {
                        showStatus('ICE connection failed!', 'error');
                    }
                };
                // Create data channel
                const dataChannel = connection.createDataChannel('test');
                dataChannel.onopen = () => {
                    showStatus('WebRTC data channel opened!', 'success');
                    dataChannel.send('Hello from offerer!');   /////////make this do ping message? 
                };
                dataChannel.onmessage = (event) => {
                    showStatus(`Received message: ${event.data}`, 'success');
                };
                console.log('Creating offer...'); // Debug log
                // Create offer
                const offer = await connection.createOffer();
                await connection.setLocalDescription(offer);
                console.log('Waiting for ICE gathering...'); // Debug log
                await new Promise((resolve) => {
                    if (connection.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        connection.onicecandidate = (event) => {
                            if (event.candidate === null) {
                                // ICE gathering is complete
                                resolve();
                            }
                        };
                    }
                });
                console.log('ICE gathering complete'); // Debug log
                // Store connection for later
                currentConnection = connection;
                // Create QR data with serializable SDP data
                const qrData = {
                    type: 'webrtc_offer',
                    offer: {
                        type: connection.localDescription.type,
                        sdp: connection.localDescription.sdp
                    }
                };
                console.log('QR data created:', qrData); // Debug log
                console.log('SDP length:', qrData.offer.sdp.length); // Debug log
                // Test JSON serialization first
                try {
                    const testJson = JSON.stringify(qrData);
                    console.log('JSON serialization test successful, length:', testJson.length);
                } catch (jsonError) {
                    console.error('JSON serialization failed:', jsonError);
                    throw new Error('Failed to serialize WebRTC data');
                }
                // Encrypt the data
                console.log('Starting encryption with password length:', currentPassword.length); // Debug log
                const encryptedData = await encryptWireChatObject(qrData, currentPassword); //encryptData
                console.log('Data encrypted successfully'); // Debug log
                console.log('Encrypted data length:', encryptedData.length); // Debug log
                // Create QR code with encrypted text display
                createQRWithText(encryptedData, 'Encrypted WebRTC Offer', 'qrcode');
                showStatus('Encrypted QR code generated successfully! Share this with another device using the same password.', 'success');
            } catch (error) {
                console.error('Error generating WebRTC offer:', error);
                showStatus('Error generating WebRTC offer: ' + error.message, 'error');
            }
        }

async function handleWebRTCOffer(qrData) {
            try {
                showStatus('Processing WebRTC offer...', 'info');               
                // Create RTCPeerConnection
                const connection = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' }
                    ]
                });
                
                // Add connection state monitoring
                connection.onconnectionstatechange = () => {
                    console.log('Connection state:', connection.connectionState);
                    if (connection.connectionState === 'connected') {
                        showStatus('WebRTC connection established!', 'success');
                    } else if (connection.connectionState === 'failed') {
                        showStatus('WebRTC connection failed!', 'error');
                    }
                };
                
                // Add ICE connection state monitoring
                connection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state:', connection.iceConnectionState);
                    if (connection.iceConnectionState === 'connected') {
                        showStatus('ICE connection established!', 'success');
                    } else if (connection.iceConnectionState === 'failed') {
                        showStatus('ICE connection failed!', 'error');
                    }
                };
                
                // Set up data channel handler
                connection.ondatachannel = (event) => {
                    const dataChannel = event.channel;
                    dataChannel.onopen = () => {
                        showStatus('WebRTC data channel opened!', 'success');
                        dataChannel.send('Hello from answerer!');
                    };
                    dataChannel.onmessage = (event) => {
                        showStatus(`Received message: ${event.data}`, 'success');
                    };
                };
                
                // Set the remote description (offer) - reconstruct RTCSessionDescription
                const offerDesc = new RTCSessionDescription({
                    type: qrData.offer.type,
                    sdp: qrData.offer.sdp
                });
                await connection.setRemoteDescription(offerDesc);
                
                // Create answer
                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                
                // Wait for ICE gathering to complete
                await new Promise((resolve) => {
                    if (connection.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        connection.onicecandidate = (event) => {
                            if (event.candidate === null) {
                                // ICE gathering is complete
                                resolve();
                            }
                        };
                    }
                });
                // Store the connection
                currentConnection = connection;
                
                // Generate encrypted QR code with the complete answer
                await generateAnswerQR(connection.localDescription);
                
            } catch (error) {
                console.error('Error processing WebRTC offer:', error);
                showStatus('Error processing WebRTC offer: ' + error.message, 'error');
            }
        }
async function generateAnswerQR(answer) {
    const currentPassword = getRoomPassword();
            const qrData = {
                type: 'webrtc_answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            };
            
            // Encrypt the answer data
            const encryptedData = await encryptWireChatObject(qrData, currentPassword);
            console.log('Encrypted answer QR data:', encryptedData);
            
            // Create QR code with encrypted text display
            createQRWithText(encryptedData, 'Encrypted WebRTC Answer', 'answerQrcode');
            
            showStatus('Encrypted answer QR code generated! Share this with the offerer using the same password.', 'success');
        }

async function handleWebRTCAnswer(qrData) {
            try {
                showStatus('Processing WebRTC answer...', 'info');
        
                if (currentConnection) {
                    // Set the remote description (answer) - reconstruct RTCSessionDescription
                    const answerDesc = new RTCSessionDescription({
                        type: qrData.answer.type,
                        sdp: qrData.answer.sdp
                    });
                    await currentConnection.setRemoteDescription(answerDesc);
                    showStatus('WebRTC connection established!', 'success');
                } else {
                    showStatus('No active connection to apply answer to.', 'error');
                }
                
            } catch (error) {
                console.error('Error processing WebRTC answer:', error);
                showStatus('Error processing WebRTC answer: ' + error.message, 'error');
            }
        }

function createQRWithText(qrString, title, containerId) {
            // Clear previous content
            const qrDisplay = document.getElementById('qrDisplay');
            qrDisplay.innerHTML = `<h3>${title}:</h3>`;
            // Create div for QR code
            const qrDiv = document.createElement('div');
            qrDiv.id = containerId;
            qrDiv.style.cssText = 'margin: 10px auto; display: inline-block;';
            qrDisplay.appendChild(qrDiv);
            // Generate QR code
            new QRCode(qrDiv, {
                text: qrString,
                width: 512,
                height: 512,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.L
            });
            // Create text display below QR code
            const textDiv = document.createElement('div');
            textDiv.className = 'qr-data-text';
            textDiv.innerHTML = `
                <div><strong>Encrypted QR Data: </strong></div>
                <div style="margin-top: 5px; cursor: pointer;">
                    ${qrString}
                </div>
            `;
            qrDisplay.appendChild(textDiv);
        }

        function startPasteInterface() { //// BETTER VIEW HANDLING ideally with Offer/Answer titles
            // Hide QR display and show paste interface
            document.getElementById('qrDisplay').innerHTML = '';
            document.getElementById('pasteInterface').style.display = 'block';
            document.getElementById('pasteTextarea').focus();
        }

        function closePasteInterface() {
            document.getElementById('pasteInterface').style.display = 'none';
            document.getElementById('pasteTextarea').value = '';
            showStatus('Paste interface closed.', 'info');
        }
async function processPastedData() {
    const currentPassword = getRoomPassword();
            const textarea = document.getElementById('pasteTextarea');
            const pastedData = textarea.value.trim();
            if (!pastedData) {
                showStatus('Please paste some data first.', 'error');
                return;
            }
            if (!currentPassword) {
                showStatus('No password set');
                return;
            }
            try {
                // Decrypt the data
                const decryptedData = await decryptWireChatObject(pastedData, currentPassword);
                console.log('Decrypted QR data:', decryptedData);
                if (decryptedData.type === 'webrtc_offer') {
                    await handleWebRTCOffer(decryptedData);
                } else if (decryptedData.type === 'webrtc_answer') {
                    await handleWebRTCAnswer(decryptedData);
                } else {
                    showStatus('Invalid QR data type. Expected "webrtc_offer" or "webrtc_answer".', 'error');
                }
                closePasteInterface();
            } catch (error) {
                console.error('Error processing pasted data:', error);
                showStatus('Error: ' + error.message, 'error');
            }
        }
    
function getAllChatPeers() {
    const wires = (current?.wires || []).map(w => ({
        id: w.peerId, transport: 'wire', wire: w
    }));
    const qrs = [...qrPeers.values()].map(p => ({
        id: p.id, transport: 'webrtc', channel: p.channel
    }));
    return [...wires, ...qrs];
}

