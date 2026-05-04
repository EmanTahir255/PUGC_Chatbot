const axios = require('axios');

async function testChat() {
    try {
        console.log("Testing: programs offered by chemistry department at pugc");
        const res = await axios.post('http://localhost:3000/chat', {
            message: "programs offered by chemistry department at pugc",
            history: []
        });
        console.log("Reply:", res.data.reply);
        console.log("Source:", res.data.source);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
testChat();
