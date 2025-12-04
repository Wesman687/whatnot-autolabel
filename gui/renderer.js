const logWindow = document.getElementById('logWindow');
const results = document.getElementById('results');

window.electronAPI.onAlwaysTopUpdated((state) => {
    console.log("Always-on-top updated to:", state);
    const checkbox = document.getElementById('alwaysOnTopCheckbox');
    checkbox.checked = state;
    log("Always On Top is now: " + (state ? "ON" : "OFF"));
});

function log(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    logWindow.prepend(div);
}

let lastServerStatus = null;
let lastExtensionStatus = null;
let lastPrintingStatus = null;
let isAlwaysOnTop = false;

function updateStatusIndicator(elementId, status, isOnline) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = status;
        element.style.background = isOnline ? '#2E7D32' : '#C62828'; // Green for online, red for offline
        element.style.color = 'white';
    }
}

function checkServerStatus() {
    // Check server connectivity
    fetch('http://localhost:7777/ping')
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(data => {
        const status = 'Server: ONLINE';
        if (status !== lastServerStatus) {
            log('Server: ONLINE');
            lastServerStatus = status;
        }
        updateStatusIndicator('serverStatus', status, true);
        
        // Now get detailed status
        return fetch('http://localhost:7777/status');
    })
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(statusData => {
        // Check printing status and sync button
        const printingStatus = `Printing: ${statusData.printing ? 'ENABLED' : 'PAUSED'}`;
        if (printingStatus !== lastPrintingStatus) {
            log(printingStatus);
            lastPrintingStatus = printingStatus;
        }
        updateStatusIndicator('printingStatus', printingStatus, statusData.printing);
        
        // Sync the pause button with server state
        updatePauseButton(!statusData.printing);
        
        // Sync always-on-top preference
        if (statusData.always_on_top !== undefined && isAlwaysOnTop !== statusData.always_on_top) {
            isAlwaysOnTop = statusData.always_on_top;
            
            // Update checkbox to match server state
            const checkbox = document.getElementById('alwaysOnTopCheckbox');
            if (checkbox) {
                checkbox.checked = isAlwaysOnTop;
            }
            
            // Update electron window state
            if (window.electronAPI && window.electronAPI.setAlwaysOnTop) {
                window.electronAPI.setAlwaysOnTop(isAlwaysOnTop);
            }
        }
        
        // Sync chat announcement checkbox
        const chatAnnounceCheckbox = document.getElementById('announceToChatCheckbox');
        if (chatAnnounceCheckbox && statusData.announce_to_chat !== undefined) {
            chatAnnounceCheckbox.checked = statusData.announce_to_chat;
        }
        
        // Sync wheel spin announcement checkbox
        const wheelSpinsCheckbox = document.getElementById('announceWheelSpinsCheckbox');
        if (wheelSpinsCheckbox && statusData.announce_wheel_spins !== undefined) {
            wheelSpinsCheckbox.checked = statusData.announce_wheel_spins;
        }
    })
    .catch(error => {
        console.log('Server status check failed:', error);
        const status = 'Server: OFFLINE';
        if (lastServerStatus !== status) {
            log('Server: OFFLINE');
            lastServerStatus = status;
        }
        updateStatusIndicator('serverStatus', status, false);
        updateStatusIndicator('printingStatus', 'Printing: UNKNOWN', false);
    });
}

function pollServer() {
    checkServerStatus();
    
    // Fetch and display recent wins with reprint buttons
    fetch('http://localhost:7777/recent-wins')
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(wins => {
        const winsDiv = document.getElementById('recentWins');
        const headerDiv = document.getElementById('recentWinsHeader');
        
        // Update header with count
        headerDiv.textContent = wins.length === 0 ? 'All Wins' : `All Wins (${wins.length})`;
        
        if (wins.length === 0) {
            winsDiv.innerHTML = '<em>No wins detected yet...</em>';
        } else {
            const winsHtml = wins.map((win, index) => {
                const timeAgo = win.timeAgo < 60 ? `${win.timeAgo}s ago` : `${Math.floor(win.timeAgo/60)}m ago`;
                const priceText = win.price ? ` - ${win.price}` : '';
                return `<div style="padding: 8px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${win.name}${priceText}</strong> - ${win.item}<br>
                        <small>${timeAgo} (${win.type})</small>
                    </div>
                    <button onclick="reprintLabel('${win.name}', '${win.item}', '${win.price || ''}')" style="padding: 4px 8px; background: #D4AF37; color: #000; border: none; border-radius: 3px; cursor: pointer;">Reprint</button>
                </div>`;
            }).join('');
            
            // Add scroll indicator if there are many wins
            const scrollHint = wins.length > 5 ? 
                '<div style="text-align: center; padding: 5px; font-size: 12px; color: #888; border-top: 1px solid #333;">↕ Scroll to see all wins ↕</div>' : '';
            
            winsDiv.innerHTML = winsHtml + scrollHint;
        }
    })
    .catch(() => {
        document.getElementById('recentWins').innerHTML = '<em>Error loading wins</em>';
    });
}

setInterval(pollServer, 5000);

let paused = false;
const pauseBtn = document.getElementById("pauseBtn");

function updatePauseButton(isPaused) {
    paused = isPaused;
    pauseBtn.innerText = isPaused ? "Resume" : "Pause";
}

pauseBtn.onclick = () => {
    const endpoint = paused ? 'resume' : 'pause';
    fetch(`http://localhost:7777/${endpoint}`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
        updatePauseButton(!data.printing);
        log(data.printing ? 'Printing resumed' : 'Printing paused');
        checkServerStatus(); // Update status indicators
    })
    .catch(e => {
        log('Failed to toggle pause/resume');
    });
};
document.getElementById('testBtn').onclick = () => {
    fetch('http://localhost:7777/test-print')
    log("Sent test print");
};
document.getElementById('printLastBtn').onclick = () => {
    fetch('http://localhost:7777/print-last')
    log("Requested last label print");
};

// Save always-on-top preference to server
async function saveAlwaysOnTopPreference(alwaysOnTop) {
    try {
        await fetch('http://localhost:7777/save-always-on-top', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ always_on_top: alwaysOnTop })
        });
        console.log("✅ Always-on-top preference saved:", alwaysOnTop);
    } catch (error) {
        console.error('❌ Failed to save always-on-top preference:', error);
    }
}

document.getElementById('alwaysOnTopCheckbox').onchange = (e) => {
    console.log("🔧 Checkbox changed to:", e.target.checked);
    log("Checkbox clicked - sending toggle command");
    
    isAlwaysOnTop = e.target.checked;
    saveAlwaysOnTopPreference(isAlwaysOnTop);
    
    try {
        window.electronAPI.toggleTop();
        console.log("✅ toggleTop() called successfully");
    } catch (error) {
        console.error("❌ Error calling toggleTop():", error);
        log("Error: " + error.message);
    }
};

document.getElementById('resetBtn').onclick = () => {
    if (confirm('Reset all data? This will clear all win history and cannot be undone.')) {
        fetch('http://localhost:7777/reset', { method: 'POST' })
        .then(() => {
            log('All data reset');
            document.getElementById('recentWins').innerHTML = '<em>No wins detected yet...</em>';
            results.innerHTML = '';
        })
        .catch(err => log('Reset failed: ' + err));
    }
};

// Global reprint function
function reprintLabel(name, item, price = null) {
    const data = { name, item };
    if (price && price !== 'null' && price !== '') {
        data.price = price;
    }
    
    fetch('http://localhost:7777/reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(() => {
        const priceText = price && price !== 'null' && price !== '' ? ` (${price})` : '';
        log(`Reprinting: ${name}${priceText} - ${item}`);
    })
    .catch(err => log('Reprint failed: ' + err));
}

// Search functionality
document.getElementById('searchBtn').onclick = () => {
    const query = document.getElementById('searchBox').value;
    fetch('http://localhost:7777/search?q=' + encodeURIComponent(query))
    .then(r => r.json())
    .then(data => {
        results.innerHTML = '';
        if (data.length === 0) {
            results.innerHTML = '<div class="result-row">No results found</div>';
        } else {
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'result-row';
                div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px;';
                const priceText = item.price ? ` - ${item.price}` : '';
                div.innerHTML = `
                    <div>
                        <strong>${item.name}${priceText}</strong> - ${item.item}<br>
                        <small>${new Date(item.timestamp).toLocaleString()} (${item.type})</small>
                    </div>
                    <button onclick="reprintLabel('${item.name}', '${item.item}', '${item.price || ''}')" style="padding: 4px 8px; background: #D4AF37; color: #000; border: none; border-radius: 3px; cursor: pointer;">Reprint</button>
                `;
                results.appendChild(div);
            });
        }
    });
};

// Load exclusions on startup
function loadExclusions() {
    fetch('http://localhost:7777/exclusions')
    .then(r => r.json())
    .then(data => {
        displayExclusions(data.exclusions);
    })
    .catch(() => {
        console.log('Failed to load exclusions');
    });
}

// Load chat announcement settings on startup
function loadChatAnnounceSettings() {
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(data => {
        displayChatAnnouncePatterns(data.chat_announce_patterns);
        const chatCheckbox = document.getElementById('announceToChatCheckbox');
        if (chatCheckbox) {
            chatCheckbox.checked = data.announce_to_chat || false;
        }
        const wheelCheckbox = document.getElementById('announceWheelSpinsCheckbox');
        if (wheelCheckbox) {
            wheelCheckbox.checked = data.announce_wheel_spins !== undefined ? data.announce_wheel_spins : true;
        }
    })
    .catch(() => {
        console.log('Failed to load chat announcement settings');
    });
}

function displayChatAnnouncePatterns(patterns) {
    const patternsDiv = document.getElementById('currentChatAnnounce');
    if (!patternsDiv) return;
    
    if (patterns.length === 0) {
        patternsDiv.innerHTML = '<em>No patterns set</em>';
    } else {
        patternsDiv.innerHTML = patterns.map(pattern => 
            `<span class="exclusion-tag" onclick="removeChatAnnouncePattern('${pattern}')" title="Click to remove">${pattern} &times;</span>`
        ).join('');
    }
}

function removeChatAnnouncePattern(patternToRemove) {
    // Get current settings
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(data => {
        // Remove the selected pattern
        const updatedPatterns = data.chat_announce_patterns.filter(pattern => pattern !== patternToRemove);
        
        // Save updated patterns
        return fetch('http://localhost:7777/chat-announce-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                announce_to_chat: data.announce_to_chat,
                chat_announce_patterns: updatedPatterns
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'chat settings saved') {
            log(`Removed chat pattern: "${patternToRemove}"`);
            displayChatAnnouncePatterns(data.chat_announce_patterns);
        }
    })
    .catch(e => {
        log('Failed to remove chat pattern');
    });
}

function displayExclusions(exclusions) {
    const exclusionsDiv = document.getElementById('currentExclusions');
    if (exclusions.length === 0) {
        exclusionsDiv.innerHTML = '<em>No exclusions set</em>';
    } else {
        exclusionsDiv.innerHTML = exclusions.map(exclusion => 
            `<span class="exclusion-tag" onclick="removeExclusion('${exclusion}')" title="Click to remove">${exclusion} &times;</span>`
        ).join('');
    }
}

function removeExclusion(exclusionToRemove) {
    // Get current exclusions
    fetch('http://localhost:7777/exclusions')
    .then(r => r.json())
    .then(data => {
        // Remove the selected exclusion
        const updatedExclusions = data.exclusions.filter(exclusion => exclusion !== exclusionToRemove);
        
        // Save updated exclusions
        return fetch('http://localhost:7777/exclusions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exclusions: updatedExclusions })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'exclusions saved') {
            log(`Removed exclusion: "${exclusionToRemove}"`);
            displayExclusions(data.exclusions);
        }
    })
    .catch(e => {
        log('Failed to remove exclusion');
    });
}

// Show management functions
function loadCurrentShow() {
    fetch('http://localhost:7777/status')
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(data => {
        const showNameSpan = document.getElementById('currentShowName');
        const giveawayCheckbox = document.getElementById('printGiveawaysCheckbox');
        
        // Display current show name
        const currentShow = data.shows[data.current_show];
        showNameSpan.textContent = currentShow?.name || 'No Active Show';
        
        // Set giveaway checkbox
        giveawayCheckbox.checked = data.print_giveaways !== false;
        
        // Sync pause button state
        updatePauseButton(!data.printing);
        
        log(`Current show: ${currentShow?.name || 'Unknown'}`);
        log(`Printing: ${data.printing ? 'ENABLED' : 'PAUSED'}`);
        log(`Giveaways: ${data.print_giveaways ? 'ENABLED' : 'DISABLED'}`);
    })
    .catch((error) => {
        console.log('Failed to load current show:', error);
        log('Could not connect to server to load show info');
    });
}

document.getElementById('saveExclusionsBtn').onclick = () => {
    const exclusionBox = document.getElementById('exclusionBox');
    const exclusionsText = exclusionBox.value.trim();
    const exclusions = exclusionsText ? exclusionsText.split(',').map(e => e.trim()).filter(e => e) : [];
    
    fetch('http://localhost:7777/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclusions })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'exclusions saved') {
            log(`Exclusions saved: ${data.exclusions.length} patterns`);
            displayExclusions(data.exclusions);
            exclusionBox.value = ''; // Clear the input after saving
        }
    })
    .catch(e => {
        log('Failed to save exclusions');
    });
};

document.getElementById('clearExclusionsBtn').onclick = () => {
    const exclusionBox = document.getElementById('exclusionBox');
    exclusionBox.value = '';
    
    fetch('http://localhost:7777/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclusions: [] })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'exclusions saved') {
            log('All exclusions cleared');
            displayExclusions([]);
        }
    })
    .catch(e => {
        log('Failed to clear exclusions');
    });
};

// Giveaway checkbox handler
document.getElementById('printGiveawaysCheckbox').onchange = (e) => {
    const printGiveaways = e.target.checked;
    fetch('http://localhost:7777/toggle-giveaways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_giveaways: printGiveaways })
    })
    .then(r => r.json())
    .then(data => {
        log(`Giveaway printing ${printGiveaways ? 'enabled' : 'disabled'}`);
    })
    .catch(e => {
        log('Failed to toggle giveaway printing');
        e.target.checked = !printGiveaways; // Revert checkbox
    });
};

// Chat announcement checkbox handler
document.getElementById('announceToChatCheckbox').onchange = (e) => {
    const announceToChat = e.target.checked;
    
    // Get current settings first
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(currentSettings => {
        return fetch('http://localhost:7777/chat-announce-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                announce_to_chat: announceToChat,
                chat_announce_patterns: currentSettings.chat_announce_patterns || [],
                announce_wheel_spins: currentSettings.announce_wheel_spins !== undefined ? currentSettings.announce_wheel_spins : true
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        log(`Chat announcements ${announceToChat ? 'enabled' : 'disabled'}`);
    })
    .catch(e => {
        log('Failed to toggle chat announcements');
        e.target.checked = !announceToChat; // Revert checkbox
    });
};

// Wheel spin announcement checkbox handler
document.getElementById('announceWheelSpinsCheckbox').onchange = (e) => {
    const announceWheelSpins = e.target.checked;
    
    // Get current settings first
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(currentSettings => {
        return fetch('http://localhost:7777/chat-announce-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                announce_to_chat: currentSettings.announce_to_chat || false,
                chat_announce_patterns: currentSettings.chat_announce_patterns || [],
                announce_wheel_spins: announceWheelSpins
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        log(`Wheel spin announcements ${announceWheelSpins ? 'enabled' : 'disabled'}`);
    })
    .catch(e => {
        log('Failed to toggle wheel spin announcements');
        e.target.checked = !announceWheelSpins; // Revert checkbox
    });
};

document.getElementById('saveChatAnnounceBtn').onclick = () => {
    const chatAnnounceBox = document.getElementById('chatAnnounceBox');
    const patternsText = chatAnnounceBox.value.trim();
    const patterns = patternsText ? patternsText.split(',').map(p => p.trim()).filter(p => p) : [];
    
    // Get current enabled state
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(currentSettings => {
        return fetch('http://localhost:7777/chat-announce-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                announce_to_chat: currentSettings.announce_to_chat || false,
                chat_announce_patterns: patterns,
                announce_wheel_spins: currentSettings.announce_wheel_spins !== undefined ? currentSettings.announce_wheel_spins : true
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'chat settings saved') {
            log(`Chat patterns saved: ${data.chat_announce_patterns.length} patterns`);
            displayChatAnnouncePatterns(data.chat_announce_patterns);
            chatAnnounceBox.value = ''; // Clear the input after saving
        }
    })
    .catch(e => {
        log('Failed to save chat patterns');
    });
};

document.getElementById('clearChatAnnounceBtn').onclick = () => {
    const chatAnnounceBox = document.getElementById('chatAnnounceBox');
    chatAnnounceBox.value = '';
    
    // Get current enabled state
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(currentSettings => {
        return fetch('http://localhost:7777/chat-announce-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                announce_to_chat: currentSettings.announce_to_chat || false,
                chat_announce_patterns: [],
                announce_wheel_spins: currentSettings.announce_wheel_spins !== undefined ? currentSettings.announce_wheel_spins : true
            })
        });
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'chat settings saved') {
            log('All chat patterns cleared');
            displayChatAnnouncePatterns([]);
        }
    })
    .catch(e => {
        log('Failed to clear chat patterns');
    });
};

// Show management handlers - removed dropdown switch handler since we don't have dropdown anymore

document.getElementById('newShowBtn').onclick = () => {
    showNewShowModal();
};

function showNewShowModal(isAutoPrompt = false) {
    // Show the modal
    const modal = document.getElementById('newShowModal');
    const nameInput = document.getElementById('newShowName');
    const titleElement = modal.querySelector('h3');
    
    // Update title based on whether this is auto-prompted
    titleElement.textContent = isAutoPrompt ? 'Create New Show (Required)' : 'Create New Show';
    
    modal.style.display = 'flex';
    nameInput.value = '';
    
    // Ensure input is enabled and focusable
    nameInput.disabled = false;
    nameInput.readOnly = false;
    nameInput.style.pointerEvents = 'auto';
    
    // Focus with a slight delay to ensure modal is fully rendered
    setTimeout(() => {
        try {
            console.log('🔍 Attempting to focus input...');
            console.log('   Input element:', nameInput);
            console.log('   Input disabled:', nameInput.disabled);
            console.log('   Input readOnly:', nameInput.readOnly);
            console.log('   Input style.display:', nameInput.style.display);
            console.log('   Input offsetParent:', nameInput.offsetParent);
            
            nameInput.focus();
            nameInput.select(); // Also select any existing text
            
            console.log('   After focus - activeElement:', document.activeElement);
            console.log('   Input has focus:', document.activeElement === nameInput);
            
            // Try clicking on it as well
            nameInput.click();
            
        } catch (error) {
            console.error('❌ Error focusing input:', error);
        }
    }, 100);
}

// Ensure input field is interactive
document.getElementById('newShowName').addEventListener('click', function() {
    console.log('🔍 Input clicked - ensuring focus');
    this.focus();
});

document.getElementById('newShowName').addEventListener('keydown', function(e) {
    console.log('🔍 Key pressed in input:', e.key);
});

// Modal event handlers
document.getElementById('createShowBtn').onclick = () => {
    const nameInput = document.getElementById('newShowName');
    const name = nameInput.value.trim();
    
    if (name) {
        fetch('http://localhost:7777/create-show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'show created') {
                log(`Created new show: ${name}`);
                
                // Clear all exclusions for the new show
                return fetch('http://localhost:7777/exclusions', {
                    method: 'DELETE'
                })
                .then(() => {
                    log('Cleared exclusions for new show');
                    loadExclusions(); // Refresh exclusions display
                    // Auto-switch to the new show
                    return fetch('http://localhost:7777/switch-show', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ showId: data.showId })
                    });
                });
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        })
        .then(r => r.json())
        .then(switchData => {
            log(`Switched to new show: ${name} - ready for printing!`);
            loadCurrentShow(); // Refresh current show display
            pollServer(); // Refresh recent wins for new show
            
            // Close modal
            document.getElementById('newShowModal').style.display = 'none';
        })
        .catch(e => {
            log('Failed to create show');
        });
    } else {
        nameInput.focus();
    }
};

document.getElementById('cancelShowBtn').onclick = () => {
    document.getElementById('newShowModal').style.display = 'none';
};

// Allow Enter key to submit in modal
document.getElementById('newShowName').onkeypress = (e) => {
    if (e.key === 'Enter') {
        document.getElementById('createShowBtn').click();
    }
};

// Close modal when clicking outside
document.getElementById('newShowModal').onclick = (e) => {
    if (e.target === document.getElementById('newShowModal')) {
        document.getElementById('newShowModal').style.display = 'none';
    }
};

document.getElementById('endShowBtn').onclick = () => {
    const showNameSpan = document.getElementById('currentShowName');
    const currentShowName = showNameSpan.textContent;
    
    if (currentShowName === 'Default Show' || currentShowName === 'No Active Show') {
        log('No active show to end - create a new show first');
        return;
    }
    
    if (confirm(`End show "${currentShowName}"? This will end the current show and you'll need to create a new one.`)) {
        // End the current show
        fetch('http://localhost:7777/end-show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(r => r.json())
        .then(data => {
            log(`Ended show: ${currentShowName}`);
            loadCurrentShow(); // Refresh current show display
            pollServer(); // Refresh recent wins
            
            // Check if we need to prompt for new show
            checkForActiveShow();
        })
        .catch(e => {
            log('Failed to end show');
        });
    }
};

// Extension status detection (uses server heartbeat tracking + recent wins)
function checkExtensionStatus() {
    fetch('http://localhost:7777/status')
    .then(r => r.json())
    .then(data => {
        // First check heartbeat
        let extensionActive = data.extension_active || false;
        let activitySource = 'heartbeat';
        
        // Also check for recent wins (last 2 minutes) as backup indicator
        return fetch('http://localhost:7777/recent-wins')
            .then(r => r.json())
            .then(wins => {
                const now = Date.now();
                const recentWin = wins.find(win => (now - win.timestamp) < 120000); // 2 minutes
                
                if (recentWin && !extensionActive) {
                    extensionActive = true;
                    activitySource = 'recent wins';
                }
                
                const status = extensionActive ? 'Extension: ACTIVE' : 'Extension: NO ACTIVITY';
                updateStatusIndicator('extensionStatus', status, extensionActive);
                
                if (status !== lastExtensionStatus) {
                    lastExtensionStatus = status;
                    const heartbeatTime = data.last_extension_heartbeat ? 
                        new Date(data.last_extension_heartbeat).toLocaleTimeString() : 'never';
                    console.log(`Extension status: ${status} (${activitySource}, last heartbeat: ${heartbeatTime})`);
                }
            });
    })
    .catch(err => {
        console.error('Error checking extension status:', err);
        updateStatusIndicator('extensionStatus', 'Extension: SERVER DOWN', false);
    });
}

// Check if there's an active show and prompt to create one if not
function checkForActiveShow() {
    fetch('http://localhost:7777/status')
    .then(r => r.json())
    .then(data => {
        const currentShow = data.shows[data.current_show];
        if (!data.current_show || !currentShow) {
            // No active show - automatically open the new show modal
            log('No active show found - please create a new show to begin printing');
            setTimeout(() => {
                showNewShowModal(true); // true indicates auto-prompt
            }, 1000); // Small delay to let UI settle
        }
    })
    .catch(() => {
        console.log('Failed to check for active show');
    });
}

// Initialization function
function initialize() {
    log('AutoPrint GUI started');
    
    // Load exclusions, chat settings, and current show
    loadExclusions();
    loadChatAnnounceSettings();
    loadCurrentShow();
    
    // Initial status check (this will sync the pause button automatically)
    checkServerStatus();
    
    // Check extension status
    checkExtensionStatus();
    
    // Check if we need to create a new show
    checkForActiveShow();
    
    // Initial polling
    pollServer();
}

// Start everything when page loads
initialize();

// Add extension status to polling
const originalPollServer = pollServer;
pollServer = function() {
    originalPollServer();
    checkExtensionStatus();
};
