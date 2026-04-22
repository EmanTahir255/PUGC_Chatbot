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

            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    history: recentHistory
                })
            });

            if (!response.ok) {
                return 'Sorry, I am having trouble connecting. Please try again.';
            }

            const data = await response.json();
            return data.reply;

        } catch (error) {
            console.error('Chat error:', error);
            return 'Sorry, I could not connect to the server. Make sure the backend is running.';
        }
    }
};


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
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.email) return false;
    return Array.isArray(currentUser.features) && currentUser.features.includes(featureName);
}

// ==============================
// 🔒 LOCK ICON HANDLING (NEW)
// ==============================
function updateFeatureLocks() {
    const featureMap = {
        "faq-btn": "FAQ Auto Suggestions",
        "events-btn": "Event Reminders",
        "history-btn": "Chat History",
        "feedback-btn": "Feedback & Ratings"
    };

    Object.keys(featureMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const lockIcon = btn.querySelector('.lock-icon');
        const featureName = featureMap[btnId];

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

function formatResponse(text) {
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

// ==============================
// Utility Functions
// ==============================
function appendMessage(sender, text, className = '') {
    const chatWindow = document.getElementById('chat-window');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender} ${className}`;

       // Format response if it is a bot message
    if (sender === 'bot') {
        msgDiv.innerHTML = formatResponse(text);
    } else {
        msgDiv.innerHTML = text;
    }
   
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser?.email) {
        const historyKey = `chatHistory_${currentUser.email}`;
        const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
        history.push({ sender, text });
        localStorage.setItem(historyKey, JSON.stringify(history));
    }
}

// ==============================
// Load Chat History (Premium)
// ==============================
function loadHistory() {
    if (!hasFeatureAccess("Chat History")) {
        appendMessage('bot', "🔒 Chat History is locked. Subscribe to unlock this feature.");
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const history = JSON.parse(
        localStorage.getItem(`chatHistory_${currentUser.email}`) || '[]'
    );

    if (history.length === 0) {
        appendMessage('bot', "🕑 No chat history yet. Start chatting!");
    } else {
        appendMessage('bot', "🕑 Your Chat History:");
        history.forEach(msg => appendMessage(msg.sender, msg.text));
    }
}

// ==============================
// FAQ Feature (Premium)
// ==============================
function showFAQ() {
    if (!hasFeatureAccess("FAQ Auto Suggestions")) {
        appendMessage('bot', "🔒 FAQ is locked. Please subscribe to unlock it.");
        return;
    }

    const faqList = JSON.parse(localStorage.getItem('adminFAQs') || '[]');

    if(faqList.length === 0){
        appendMessage('bot', "📌 No FAQs available yet.");
        return;
    }

    let faqText = "📌 Frequently Asked Questions:\n\n";
    faqList.forEach(f => faqText += `Q: ${f.q}\nA: ${f.a}\n\n`);
    appendMessage('bot', faqText.trim());
}


// ==============================
// Event Reminders (Premium)
// ==============================
function showEvents() {
    if (!hasFeatureAccess("Event Reminders")) {
        appendMessage('bot', "🔒 Event Reminders are locked. Subscribe to unlock.");
        return;
    }

    const events = JSON.parse(localStorage.getItem('adminEvents') || '[]');
    if (events.length === 0) {
        appendMessage('bot', "📅 No upcoming events available.");
        return;
    }

    let eventsText = "📅 Upcoming Events:\n\n";
    events.forEach(e => eventsText += `${e.date} - ${e.title}\n`);
    appendMessage('bot', eventsText);
}

// ==============================
// Feedback & Rating (Premium)
// ==============================
function submitFeedback(rating, message) {
    if (!hasFeatureAccess("Feedback & Ratings")) {
        appendMessage('bot', "🔒 Feedback & Ratings are locked. Subscribe to unlock.");
        return;
    }

    const feedback = JSON.parse(localStorage.getItem('feedback') || '[]');
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

    feedback.push({
        userEmail: currentUser.email,
        rating,
        message
    });

    localStorage.setItem('feedback', JSON.stringify(feedback));
    appendMessage('bot', "🙏 Thank you for your feedback!");
}

// ==============================
// Main Chat Handling
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');

    updateFeatureLocks(); // 🔒 APPLY LOCKS ON LOAD

    if (!sendBtn) return;

    sendBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;

        appendMessage('user', text);
        input.value = '';

        if (text.toLowerCase() === '/faq') return showFAQ();
        if (text.toLowerCase() === '/events') return showEvents();
        if (text.toLowerCase() === '/history') return loadHistory();

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
        appendMessage('bot', response);
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
    const feedbackBtn = document.getElementById('feedback-btn');

    const feedbackModal = document.getElementById('feedback-modal');
    const closeFeedback = document.getElementById('close-feedback');
    const submitFeedbackBtn = document.getElementById('submit-feedback');

    faqBtn?.addEventListener('click', showFAQ);
    eventsBtn?.addEventListener('click', showEvents);
    historyBtn?.addEventListener('click', loadHistory);

    feedbackBtn?.addEventListener('click', () => {
        if (!hasFeatureAccess("Feedback & Ratings")) {
            appendMessage('bot', "🔒 Feedback & Ratings are locked. Subscribe to unlock.");
            return;
        }
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
