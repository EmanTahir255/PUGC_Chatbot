// js/chatbot.js

// 1. Logic for API calling (The part that shifts to Node.js/React later)
const ChatService = {
    async sendMessageToAI(userMessage) {
        try {
            // Get last 6 messages from history for context
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            let recentHistory = [];

            if (currentUser?.email) {
                const history = JSON.parse(
                    localStorage.getItem(`chatHistory_${currentUser.email}`) || '[]'
                );
                recentHistory = history.slice(-6);
            }
            const token = window.AuthService?.getToken?.() || localStorage.getItem('authToken') || '';

            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    history: recentHistory
                })
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    return {
                        reply: 'Your session has expired. Please sign in again to continue.',
                        suggestedQuestions: []
                    };
                }

                return {
                    reply: 'Sorry, I am having trouble connecting. Please try again.',
                    suggestedQuestions: []
                };
            }

            const data = await response.json();
            return {
                reply: data.reply,
                suggestedQuestions: Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : []
            };

        } catch (error) {
            console.error('Chat error:', error);
            return {
                reply: 'Sorry, I could not connect to the server. Make sure the backend is running.',
                suggestedQuestions: []
            };
        }
    }
};

function getChatbotCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('currentUser') || 'null') || {};
    } catch (error) {
        return {};
    }
}

function isChatbotAdminUser() {
    const currentUser = getChatbotCurrentUser();
    const role = currentUser.role || localStorage.getItem('userRole') || '';

    return role === 'admin';
}


// const ChatService = {
//     async sendMessageToAI(userMessage) {
//         return new Promise((resolve) => {
//             setTimeout(() => {
//                 const lowerMsg = userMessage.toLowerCase();

//                 if (["hello", "hi", "hey"].includes(lowerMsg)) {
//                     resolve("Hello! 👋 How can I help you today?");
//                 } else if (lowerMsg.includes("admission")) {
//                     resolve("The PUGC admissions for Spring 2026 are currently open. You can apply through the university portal.");
//                 } else if (lowerMsg.includes("event")) {
//                     resolve("You can check events using the Events feature if unlocked.");
//                 } else {
//                     resolve(
//                         "I understand you're asking about '" +
//                         userMessage +
//                         "'. As an AI, I am processing your request based on PUGC data..."
//                     );
//                 }
//             }, 1000);
//         });
//     }
// };

// ==============================
// FEATURE ACCESS (CORE LOGIC)
// ==============================
function hasFeatureAccess(featureName) {
    const premiumOnly = new Set([
        "Event Reminders",
        "Full Chat History",
        "Fee Challan Generator",
        "Smart Transcript Request Form Generator",
        "Higher Chat Limit"
    ]);

    if (!premiumOnly.has(featureName)) return true;
    if (isChatbotAdminUser()) return true;
    if (window.SubscriptionService) return SubscriptionService.isPremium();

    const currentUser = getChatbotCurrentUser();
    if (!currentUser || !currentUser.email) return false;
    return Array.isArray(currentUser.features) && currentUser.features.includes(featureName);
}

// ==============================
// 🔒 LOCK ICON HANDLING (NEW)
// ==============================
function updateFeatureLocks() {
    const featureMap = {
        "events-btn": "Event Reminders",
    };

    Object.keys(featureMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const lockIcon = btn.querySelector('.lock-icon');
        const featureName = featureMap[btnId];
        if (!lockIcon) return;

        if (hasFeatureAccess(featureName)) {
            lockIcon.style.display = 'none'; // ✅ unlocked
        } else {
            lockIcon.style.display = 'inline-block'; // 🔒 locked
        }
    });
}

// ==============================
// Formatting Functions
// ==============================

function legacyFormatResponse(text) {
    // If already contains HTML tags leave it as is
    if (text.includes('<b>') || text.includes('<ul>') || text.includes('<br>')) {
        return text;
    }

    let lines = text.split(/(?<=\.)\s+(?=[A-Z])/);

    // Detect if text has a title (ends with colon)
    let html = '';
    let firstLine = lines[0];

    // Extract title if present (text before first colon)
    if (firstLine.includes(':')) {
        let colonIndex = firstLine.indexOf(':');
        let title = firstLine.substring(0, colonIndex);
        let rest = firstLine.substring(colonIndex + 1).trim();
        html += `<b>${title}</b><br><br>`;
        if (rest) lines[0] = rest;
        else lines.shift();
    }

    // Check if content has list-like items separated by dots
    let fullText = lines.join(' ');

    // Pattern: "Name (description). Name (description)."
    let listPattern = /([A-Z][^.()]+)\s*\(([^)]+)\)/g;
    let listMatches = fullText.match(listPattern);

    if (listMatches && listMatches.length >= 3) {
        // Build as list
        html += '<ul>';
        let remaining = fullText;
        remaining.replace(listPattern, (match, name, desc) => {
            html += `<li><b>${name.trim()}</b> — ${desc}</li>`;
        });
        html += '</ul>';

        // Add any remaining text after list items
        let afterList = fullText.replace(listPattern, '').replace(/\.\s*/g, '').trim();
        if (afterList && afterList.length > 10) {
            html += `<br>${afterList}`;
        }
    } else {
        // Build as paragraphs with line breaks
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Bold phone numbers
            line = line.replace(/(0\d{2}-\d{7,8})/g, '<b>$1</b>');
            // Bold Rs amounts
            line = line.replace(/(Rs\.?\s*[\d,]+)/g, '<b>$1</b>');
            // Bold percentages
            line = line.replace(/(\d+(\.\d+)?%)/g, '<b>$1</b>');
            // Bold step patterns
            line = line.replace(/(Step\s*\d+:)/gi, '<b>$1</b>');
            // Bold section headers (word followed by colon)
            line = line.replace(/^([A-Z][a-zA-Z\s]+):/g, '<b>$1:</b>');

            html += line + '<br>';
        });
    }

    return html;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightImportantValues(text) {
    return text
        .replace(/(0\d{2}-\d{7,8})/g, '<b>$1</b>')
        .replace(/(Rs\.?\s*[\d,]+)/g, '<b>$1</b>')
        .replace(/(\d+(\.\d+)?%)/g, '<b>$1</b>')
        .replace(/\b(\d+\s*(days?|semesters?|years?|books?|hours?))\b/gi, '<b>$1</b>');
}

function normalizePlainBotText(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/^\s*#{1,6}\s*/gm, '')
        .replace(/^\s*[*-]\s+/gm, '@@BULLET@@ ')
        .replace(/^\s*\d+\.\s+/gm, '@@BULLET@@ ')
        .replace(/^\s*BULLET\s+/gm, '@@BULLET@@ ')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\b__([^_\n]+)__\b/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeBotPlaceholdersInHtml(html) {
    return String(html || '')
        .replace(/@@BULLET@@\s*/g, '<br>&bull; ')
        .replace(/\bBULLET\s+/g, '<br>&bull; ');
}

function normalizePhoneNumber(value) {
    return String(value || '').replace(/[^\d+]/g, '');
}

const PUGC_OFFICIAL_WEBSITE = 'https://www.campus.gujranwala.pu.edu.pk/';
const PUGC_MAIN_WEBSITE = 'https://www.pu.edu.pk/';
const PUGC_MAP_QUERY = 'Punjab University Gujranwala Campus Alipur Chowk Rawalpindi Bypass Gujranwala';

function linkifyResponseHtml(html) {
    let linked = String(html || '');

    // Make URLs clickable and open them in a new tab.
    linked = linked.replace(
        /(?<!["'>])(https?:\/\/[^\s<]+)/gi,
        '<a class="bot-link" href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Make emails clickable via the default mail app.
    linked = linked.replace(
        /(?<!["'>])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
        '<a class="bot-link" href="mailto:$1">$1</a>'
    );

    // Make plain phone numbers clickable via the default dialer app.
    linked = linked.replace(
        /(?<!["'>])(\b0\d{2}-\d{7,8}\b)/g,
        (match) => `<a class="bot-link" href="tel:${normalizePhoneNumber(match)}">${match}</a>`
    );

    // Make phone numbers clickable even after they have been wrapped in <b> tags.
    linked = linked.replace(
        /<b>(0\d{2}-\d{7,8})<\/b>/g,
        (_, phone) => `<a class="bot-link" href="tel:${normalizePhoneNumber(phone)}"><b>${phone}</b></a>`
    );

    // Make named references to the campus website and student portal clickable even if no raw URL was included.
    linked = linked.replace(
        /(?<!["'>])(student portal|portal website|online portal|university website|campus website|official website)(?![^<]*<\/a>)/gi,
        (match) => {
            const lower = match.toLowerCase();
            const href = lower.includes('student portal') || lower.includes('portal')
                ? PUGC_OFFICIAL_WEBSITE
                : (lower.includes('official') || lower.includes('university website')
                    ? PUGC_MAIN_WEBSITE
                    : PUGC_OFFICIAL_WEBSITE);
            return `<a class="bot-link" href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        }
    );

    // Make Address/Location values open in Google Maps.
    linked = linked.replace(
        /(<b>(?:Address|Location):<\/b>\s*)([^<\n][^<]*?)(?=(<br>|<\/li>|$))/gi,
        (_, prefix, value, suffix = '') => {
            const place = value.trim();
            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
            return `${prefix}<a class="bot-link" href="${url}" target="_blank" rel="noopener noreferrer">${place}</a>${suffix}`;
        }
    );

    // If the reply talks about PUGC location in plain text, make that phrase clickable.
    linked = linked.replace(
        /(?<!["'>])(where is pugc|pugc location|university location|campus location|pugc is located near alipur chowk[^<]*|located near alipur chowk[^<]*)(?![^<]*<\/a>)/gi,
        (match) => {
            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PUGC_MAP_QUERY)}`;
            return `<a class="bot-link" href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        }
    );

    // For any response that discusses location/address/directions but still has no map link,
    // append a direct campus map link so location answers always help the user navigate.
    if (
        /\b(address|location|located|directions|near alipur chowk|rawalpindi bypass|campus map)\b/i.test(linked) &&
        !/google\.com\/maps|maps\/search\/\?api=1/i.test(linked)
    ) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PUGC_MAP_QUERY)}`;
        linked += `<br><br><a class="bot-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Open PUGC on Google Maps</a>`;
    }

    return linked;
}

function formatResponse(text) {
    const rawText = normalizePlainBotText(text);
    if (!rawText) return '';

    // Groq/DB may already return safe HTML formatting; preserve it.
    if (/<(b|ul|ol|li|br)\b/i.test(rawText)) {
        return linkifyResponseHtml(normalizeBotPlaceholdersInHtml(rawText));
    }

    const normalized = rawText
        .replace(/\r/g, '')
        .replace(/\s+-\s+/g, '\n- ')
        .replace(/\s+([A-Z][A-Za-z /&]{2,35}):\s+/g, '\n$1: ');

    const lines = normalized
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return '';

    let heading = lines.shift();
    if (heading.includes(':')) {
        const [possibleHeading, ...rest] = heading.split(':');
        heading = possibleHeading.trim();
        const remaining = rest.join(':').trim();
        if (remaining) lines.unshift(remaining);
    }

    const sentenceLines = lines.length
        ? lines
        : normalized
            .replace(heading, '')
            .split(/(?<=\.)\s+(?=[A-Z])/)
            .map(line => line.trim())
            .filter(Boolean);

    const normalizedSentenceLines = sentenceLines.map(line =>
        line
            .replace(/^@@BULLET@@\s*/i, '')
            .replace(/^\*\s+/, '')
            .replace(/^-\s+/, '')
            .trim()
    ).filter(Boolean);

    let html = `<b>${escapeHtml(heading)}</b><br><br>`;
    const labelLines = normalizedSentenceLines.filter(line => /^[A-Za-z][A-Za-z /&()]{2,45}:\s+/.test(line));
    const bulletLikeLines = sentenceLines.filter(line => /^@@BULLET@@\s+/i.test(line) || /^BULLET\s+/i.test(line));

    if (bulletLikeLines.length > 0 || labelLines.length >= 2 || normalizedSentenceLines.length >= 3) {
        html += '<ul>';
        normalizedSentenceLines.forEach(line => {
            const escaped = highlightImportantValues(escapeHtml(line));
            const labelMatch = escaped.match(/^([^:]{2,45}):\s*(.+)$/);
            if (labelMatch) {
                html += `<li><b>${labelMatch[1]}:</b> ${labelMatch[2]}</li>`;
            } else {
                html += `<li>${escaped}</li>`;
            }
        });
        html += '</ul>';
    } else {
        html += normalizedSentenceLines
            .map(line => highlightImportantValues(escapeHtml(line)))
            .join('<br><br>');
    }

    return linkifyResponseHtml(html);
}

// ==============================
// Utility Functions
// ==============================
function createSuggestionChips(suggestions = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'suggestion-chips';

    suggestions.forEach(question => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.textContent = question;
        chip.addEventListener('click', () => {
            const input = document.getElementById('user-input');
            if (!input) return;
            input.value = question;
            document.getElementById('send-btn')?.click();
        });
        wrapper.appendChild(chip);
    });

    return wrapper;
}

function enhanceBotLinks(container) {
    if (!container) return;

    container.querySelectorAll('a.bot-link[href^="mailto:"]').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.location.href = link.getAttribute('href');
        });
    });

    container.querySelectorAll('a.bot-link[href^="tel:"]').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.location.href = link.getAttribute('href');
        });
    });
}

function appendMessage(sender, text, className = '', suggestions = []) {
    const chatWindow = document.getElementById('chat-window');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender} ${className}`;

    // Format response if it is a bot message
    if (sender === 'bot') {
        msgDiv.innerHTML = formatResponse(text);
    } else {
        msgDiv.innerHTML = text;
    }

    if (sender === 'bot') {
        enhanceBotLinks(msgDiv);
    }

    chatWindow.appendChild(msgDiv);

    // Show guided next-step questions under bot replies so the conversation keeps moving naturally.
    if (sender === 'bot' && suggestions.length > 0 && !className.includes('loading-text')) {
        const suggestionLimit = window.SubscriptionService && !SubscriptionService.isPremium() && !isChatbotAdminUser() ? 2 : 4;
        chatWindow.appendChild(createSuggestionChips(suggestions.slice(0, suggestionLimit)));
    }

    chatWindow.scrollTop = chatWindow.scrollHeight;

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    // Loading placeholders are visual only; saving them pollutes follow-up context.
    if (currentUser?.email && !className.includes('loading-text') && !className.includes('history-replay')) {
        const historyKey = `chatHistory_${currentUser.email}`;
        const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
        history.push({ sender, text });
        localStorage.setItem(historyKey, JSON.stringify(history));
    }
}

function getChatEmptyStateHtml() {
    return `
        <div class="chat-empty-state">
            <i class="fas fa-robot"></i>
            <strong>PUGC SmartBot is ready</strong>
            <span>Admissions, programs, fees, events, departments, and campus services.</span>
        </div>
    `;
}

function startNewChat() {
    const chatWindow = document.getElementById('chat-window');
    const input = document.getElementById('user-input');
    if (!chatWindow) return;

    chatWindow.innerHTML = getChatEmptyStateHtml();
    input?.focus();
}

function getCurrentUserHistory() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser?.email) return [];

    return JSON.parse(localStorage.getItem(`chatHistory_${currentUser.email}`) || '[]');
}

function getPlainHistoryText(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/@@BULLET@@/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderHistoryItem(message, index) {
    const sender = message.sender === 'user' ? 'user' : 'bot';
    const senderLabel = sender === 'user' ? 'You' : 'PUGC SmartBot';
    const icon = sender === 'user' ? 'fa-user' : 'fa-robot';
    const text = getPlainHistoryText(message.text) || 'No message text';

    return `
        <article class="history-item ${sender}">
            <div class="history-item-header">
                <span class="history-sender"><i class="fas ${icon}"></i> ${senderLabel}</span>
                <span class="history-time">#${index + 1}</span>
            </div>
            <p class="history-text">${escapeHtml(text)}</p>
        </article>
    `;
}

function openHistoryDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (!drawer) return;

    drawer.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false');
}

function closeHistoryDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (!drawer) return;

    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');

    if (window.location.hash === '#history') {
        window.history.replaceState(null, '', window.location.pathname);
    }
}

// ==============================
// Load Chat History
// ==============================
function loadHistory() {
    const historyList = document.getElementById('history-list');
    const historyNote = document.getElementById('history-drawer-note');
    const history = getCurrentUserHistory();
    const premium = window.SubscriptionService ? SubscriptionService.isPremium() : hasFeatureAccess("Full Chat History");
    const adminPreview = isChatbotAdminUser();
    const fullHistory = premium || adminPreview;
    const visibleHistory = fullHistory ? history : history.slice(-5);

    if (!historyList) return;

    if (historyNote) {
        historyNote.textContent = adminPreview
            ? 'Admin preview mode shows your saved test messages for this account.'
            : premium
                ? 'Premium access is active, so your full saved chat history is shown here.'
                : 'Free users can review the last 5 saved messages. Upgrade to premium for full chat history.';
    }

    if (visibleHistory.length === 0) {
        historyList.innerHTML = `
            <div class="history-empty">
                <div>
                    <strong>No chat history yet</strong>
                    <span>Start a conversation and your saved messages will appear here.</span>
                </div>
            </div>
        `;
    } else {
        historyList.innerHTML = visibleHistory
            .map((message, index) => renderHistoryItem(message, index))
            .join('');
    }

    openHistoryDrawer();
}



// CustomModal is now provided by js/modal.js


async function clearAllHistory() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser?.email) return;

    const confirmed = await CustomModal.confirm(
        "Clear History",
        "Are you sure you want to clear all your chat history? This action cannot be undone.",
        { type: 'danger', confirmText: 'Clear All' }
    );

    if (confirmed) {
        const historyKey = `chatHistory_${currentUser.email}`;
        localStorage.removeItem(historyKey);

        // Update UI
        const historyList = document.getElementById('history-list');
        if (historyList) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <div>
                        <strong>No chat history yet</strong>
                        <span>Start a conversation and your saved messages will appear here.</span>
                    </div>
                </div>
            `;
        }

        // Also clear the active chat window for a fresh start
        startNewChat();
    }
}

// ==============================
// FAQ Feature
// ==============================
async function showFAQ() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('http://localhost:3000/api/public/faqs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const faqs = await response.json();

        if (!faqs || faqs.length === 0) {
            appendMessage('bot', "No FAQs available yet.");
            return;
        }

        let faqText = "<b>Top 5 Frequently Asked Questions:</b><br><br>";
        faqs.forEach(f => {
            faqText += `<b>Q: ${f.intent_name}</b><br>A: ${f.answer_text}<br><br>`;
        });

        appendMessage('bot', faqText.trim());
    } catch (error) {
        console.error('FAQ fetch error:', error);
        appendMessage('bot', "Sorry, I couldn't load the FAQs right now.");
    }
}


// ==============================
// Event Reminders (Premium)
// ==============================
async function showEvents() {
    if (!hasFeatureAccess("Event Reminders")) {
        appendMessage('bot', "🔒 Event Reminders are locked. Subscribe to unlock.");
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('http://localhost:3000/api/public/events', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const events = await response.json();

        if (!events || events.length === 0) {
            appendMessage('bot', "📅 No upcoming events available.");
            return;
        }

        let eventsText = "<b>📅 Upcoming Events:</b><br><br>";
        events.forEach(e => {
            const dateStr = new Date(e.event_date).toLocaleDateString();
            eventsText += `<b>${e.event_name}</b><br>`;
            eventsText += `Date: ${dateStr}${e.event_end_date ? ' to ' + new Date(e.event_end_date).toLocaleDateString() : ''}<br>`;
            if (e.venue) eventsText += `Venue: ${e.venue}<br>`;
            if (e.description) eventsText += `${e.description}<br>`;
            eventsText += `<br>`;
        });
        appendMessage('bot', eventsText);
    } catch (error) {
        console.error('Events fetch error:', error);
        appendMessage('bot', "Sorry, I couldn't load the events right now.");
    }
}

// ==============================
// Feedback & Rating
// ==============================
async function submitFeedback(rating, message) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('http://localhost:3000/api/chat/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating: parseInt(rating), message })
        });

        if (!response.ok) throw new Error('Failed to submit feedback.');

        appendMessage('bot', "Thank you! Your feedback has been submitted successfully. ✨");
    } catch (error) {
        console.error('Feedback error:', error);
        appendMessage('bot', "Sorry, I couldn't save your feedback. Please try again later.");
    }
}

// ==============================
// Main Chat Handling
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');

    updateFeatureLocks(); // 🔒 APPLY LOCKS ON LOAD
    document.addEventListener('subscription:changed', updateFeatureLocks);

    if (!sendBtn) return;

    sendBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;

        if (text.toLowerCase() === '/history') {
            input.value = '';
            loadHistory();
            return;
        }

        if (window.SubscriptionService && !isChatbotAdminUser()) {
            const usage = SubscriptionService.canSendChatMessage();

            if (!usage.allowed) {
                appendMessage('bot', "Daily free chat limit reached. Upgrade to premium to continue chatting today.");
                SubscriptionService.addNotification(
                    'warning',
                    'Chat limit reached',
                    'You used all 20 free messages for today. Premium unlocks a higher chat limit.',
                    'premium.html'
                );
                return;
            }
        }

        appendMessage('user', text);
        input.value = '';
        if (!isChatbotAdminUser()) {
            window.SubscriptionService?.recordChatMessage();
        }

        if (text.toLowerCase() === '/faq') return showFAQ();
        if (text.toLowerCase() === '/events') return showEvents();

        if (text.toLowerCase().startsWith('/feedback')) {
            const parts = text.split('|');
            if (parts.length < 3) {
                appendMessage('bot', "⚠️ Use: /feedback|rating(1-5)|message");
                return;
            }
            submitFeedback(parts[1], parts[2]);
            return;
        }

        appendMessage('bot', 'AI is thinking...', 'loading-text');
        const response = await ChatService.sendMessageToAI(text);
        document.querySelector('.loading-text')?.remove();
        appendMessage('bot', response.reply, '', response.suggestedQuestions || []);
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
        }
    });
});

// ==============================
// Button Event Handlers
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    const faqBtn = document.getElementById('faq-btn');
    const eventsBtn = document.getElementById('events-btn');
    const historyBtn = document.getElementById('history-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const feedbackBtn = document.getElementById('feedback-btn');

    const feedbackModal = document.getElementById('feedback-modal');
    const closeFeedback = document.getElementById('close-feedback');
    const submitFeedbackBtn = document.getElementById('submit-feedback');

    faqBtn?.addEventListener('click', showFAQ);
    eventsBtn?.addEventListener('click', showEvents);
    historyBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.location.hash !== '#history') {
            window.history.replaceState(null, '', '#history');
        }
        loadHistory();
    });

    newChatBtn?.addEventListener('click', startNewChat);
    clearHistoryBtn?.addEventListener('click', clearAllHistory);

    document.querySelectorAll('[data-history-close]').forEach(button => {
        button.addEventListener('click', closeHistoryDrawer);
    });

    if (window.location.hash === '#history') {
        loadHistory();
    }

    feedbackBtn?.addEventListener('click', () => {
        feedbackModal.style.display = 'flex';
    });

    closeFeedback?.addEventListener('click', () => {
        feedbackModal.style.display = 'none';
    });

    submitFeedbackBtn?.addEventListener('click', () => {
        const rating = document.getElementById('feedback-rating').value;
        const message = document.getElementById('feedback-message').value.trim();

        if (!rating || !message) {
            alert("Please provide both rating and message.");
            return;
        }

        submitFeedback(rating, message);
        feedbackModal.style.display = 'none';
        document.getElementById('feedback-rating').value = '';
        document.getElementById('feedback-message').value = '';
    });

    window.addEventListener('click', (e) => {
        if (e.target === feedbackModal) feedbackModal.style.display = 'none';
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeHistoryDrawer();
        }
    });
});

// ⭐ Star Rating Logic
document.addEventListener('DOMContentLoaded', () => {
    const stars = document.querySelectorAll('#star-rating span');
    const ratingInput = document.getElementById('feedback-rating');

    stars.forEach(star => {
        star.addEventListener('click', () => {
            const value = star.getAttribute('data-value');
            ratingInput.value = value;

            stars.forEach(s => {
                s.classList.toggle('active', s.getAttribute('data-value') <= value);
            });
        });
    });
});
