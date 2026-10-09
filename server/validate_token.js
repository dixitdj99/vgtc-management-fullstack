/**
 * Token Validator — run: node validate_token.js
 * Paste your token when prompted, press Enter
 */
const https = require('https');
const readline = require('readline');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
  console.error('Set META_APP_ID and META_APP_SECRET before validating a token.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n=== META TOKEN VALIDATOR ===');
console.log('Paste your token below and press Enter:\n');

rl.question('Token: ', async (raw) => {
  rl.close();
  const token = raw.trim();
  console.log('\nToken length:', token.length);

  const cleanToken = token;
  console.log('Testing against Meta API...');

  // Test via debug_token
  const opts = {
    hostname: 'graph.facebook.com',
    path: '/debug_token?input_token=' + encodeURIComponent(cleanToken) + '&access_token=' + encodeURIComponent(process.env.META_APP_ID + '|' + process.env.META_APP_SECRET),
    method: 'GET'
  };

  https.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(d);
        if (j.data?.is_valid) {
          console.log('\n✅ TOKEN IS VALID!');
          console.log('App ID:', j.data.app_id);
          console.log('Type:', j.data.type);
          console.log('Expires:', j.data.expires_at ? new Date(j.data.expires_at * 1000).toISOString() : 'Never');
          console.log('Scopes:', (j.data.scopes || []).join(', '));
          console.log('Token validated. Save it through WhatsApp Control.');
        } else {
          console.log('\n❌ TOKEN INVALID:', j.data?.error?.message);
        }
      } catch (e) { console.log(d); }
    });
  }).on('error', e => console.error(e.message)).end();
});
