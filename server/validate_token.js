/**
 * Token Validator — run: node validate_token.js
 * Paste your token when prompted, press Enter
 */
const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n=== META TOKEN VALIDATOR ===');
console.log('Paste your token below and press Enter:\n');

rl.question('Token: ', async (raw) => {
  rl.close();
  const token = raw.trim();
  console.log('\nToken length:', token.length);
  console.log('Starts with:', token.substring(0, 10));

  // Check for known corruption
  const CORRUPT_SEG = 'TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn';
  const occurrences = (token.match(new RegExp(CORRUPT_SEG, 'g')) || []).length;
  console.log('Corrupt segment occurrences:', occurrences);

  let cleanToken = token;
  if (occurrences > 1) {
    // Remove all but keep the first (it's part of the real token start)
    const idx = token.indexOf(CORRUPT_SEG, CORRUPT_SEG.length + 5);
    if (idx !== -1) {
      cleanToken = token.slice(0, idx) + token.slice(idx + CORRUPT_SEG.length);
      console.log('Cleaned token (2nd occurrence removed):', cleanToken);
    }
  } else if (occurrences === 1 && !token.startsWith('EAAUU' + CORRUPT_SEG.substring(1))) {
    cleanToken = token.replace(CORRUPT_SEG, '');
    console.log('Cleaned token (segment removed):', cleanToken);
  }

  console.log('\nTesting against Meta API...');

  // Test via debug_token
  const opts = {
    hostname: 'graph.facebook.com',
    path: '/debug_token?input_token=' + encodeURIComponent(cleanToken) + '&access_token=1429699755807939|c7329693f8bcbc1bcafd936e9f5678eb',
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
          console.log('\n>>> CLEAN TOKEN TO SAVE:\n' + cleanToken);
        } else {
          console.log('\n❌ TOKEN INVALID:', j.data?.error?.message);
          console.log('\nRaw token for manual inspection:', token);
        }
      } catch (e) { console.log(d); }
    });
  }).on('error', e => console.error(e.message)).end();
});
