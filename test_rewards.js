
const fetch = require('node-fetch');

async function test() {
    try {
        const res = await fetch('http://localhost:3000/rewards');
        const data = await res.json();
        console.log('REWARDS FROM SERVER:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('FETCH ERROR:', e.message);
    }
}
test();
