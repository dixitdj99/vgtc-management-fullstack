const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { db, isAvailable } = require('../firebase');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const CONFIG_COLL = 'system_config';
const TOKEN_DOC = 'google_drive_token';

function getClientTemplate() {
    // 1. Check environment variable first (for Production)
    if (process.env.GOOGLE_CREDENTIALS) {
        try {
            // Sanitize in case of weird whitespace/newlines in env var
            const sanitized = process.env.GOOGLE_CREDENTIALS.trim();
            const keys = JSON.parse(sanitized);
            return keys.web || keys.installed || keys;
        } catch (e) {
            console.error('[Drive] Critical: Failed to parse GOOGLE_CREDENTIALS environment variable. Ensure it is a valid JSON string.');
        }
    }

    // 2. Check local file (for Development)
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    try {
        const content = fs.readFileSync(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        return keys.web || keys.installed;
    } catch (e) {
        return null;
    }
}

function createOAuthClient() {
    const keys = getClientTemplate();
    if (!keys) return null;
    
    // Redirect URI must match what user configured in Google Cloud Console
    // We use http://localhost:5000 as the standard for this app
    const redirectUri = (keys.redirect_uris && keys.redirect_uris.length > 0) 
        ? keys.redirect_uris[0] 
        : 'http://localhost:5000';
    
    return new google.auth.OAuth2(
        keys.client_id,
        keys.client_secret,
        redirectUri
    );
}

function isConfigured() {
    return getClientTemplate() !== null;
}

async function isAuthorized() {
    if (fs.existsSync(TOKEN_PATH)) return true;
    if (isAvailable()) {
        const doc = await db.collection(CONFIG_COLL).doc(TOKEN_DOC).get();
        return doc.exists;
    }
    return false;
}

function getAuthUrl() {
    const client = createOAuthClient();
    if (!client) return null;
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
}

async function saveToken(code) {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    
    // Save to local file
    try {
        if (!fs.existsSync(path.dirname(TOKEN_PATH))) fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    } catch (e) {
        console.warn('[Drive] Could not save token to local filesystem (likely production)');
    }

    // Save to Firestore for persistence
    if (isAvailable()) {
        await db.collection(CONFIG_COLL).doc(TOKEN_DOC).set({
            ...tokens,
            updatedAt: new Date().toISOString()
        });
        console.log('[Drive] Token saved to Firestore');
    }

    return tokens;
}

async function getDriveClient() {
    const client = createOAuthClient();
    if (!client) throw new Error('Google Credentials (JSON or ENV) missing.');
    
    let tokens = null;

    // Load from local file
    if (fs.existsSync(TOKEN_PATH)) {
        tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    } 
    // Load from Firestore
    else if (isAvailable()) {
        const doc = await db.collection(CONFIG_COLL).doc(TOKEN_DOC).get();
        if (doc.exists) tokens = doc.data();
    }

    if (!tokens) {
        throw new Error('Not authorized. Please connect Google Drive first.');
    }

    client.setCredentials(tokens);
    
    // Refresh token logic
    client.on('tokens', async (newTokens) => {
        const updatedTokens = { ...tokens, ...newTokens };
        if (isAvailable()) {
            await db.collection(CONFIG_COLL).doc(TOKEN_DOC).set({
                ...updatedTokens,
                updatedAt: new Date().toISOString()
            });
        }
        try {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(updatedTokens));
        } catch (e) {}
    });

    return google.drive({ version: 'v3', auth: client });
}

async function getOrCreateFolder(name, parentId = null) {
    const drive = await getDriveClient();
    let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;

    const res = await drive.files.list({ q: query, fields: 'files(id, name)', spaces: 'drive' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

    const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) fileMetadata.parents = [parentId];
    const folder = await drive.files.create({ resource: fileMetadata, fields: 'id' });
    return folder.data.id;
}

async function uploadFile(filePath, fileName, folderId) {
    const drive = await getDriveClient();
    const media = { mimeType: 'application/pdf', body: fs.createReadStream(filePath) };
    const res = await drive.files.create({
        resource: { name: fileName, parents: [folderId] },
        media,
        fields: 'id'
    });
    return res.data.id;
}

module.exports = { isAuthorized, isConfigured, getAuthUrl, saveToken, getOrCreateFolder, uploadFile };
