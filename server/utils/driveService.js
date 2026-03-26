const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let oauth2Client = null;

function getClientTemplate() {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    const content = fs.readFileSync(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    return keys.web || keys.installed;
}

function createOAuthClient() {
    const keys = getClientTemplate();
    if (!keys) return null;
    
    // For local dev, we often don't have a fixed redirect URI in JSON
    // The user might need to add http://localhost:5000/api/backup/callback if we used a formal web flow
    // But for "Manual Copy/Paste" flow, we can use 'urn:ietf:wg:oauth:2.0:oob' (though deprecated)
    // Instead, we will use a redirect URI that the user can manually handle or just "post-message"
    const redirectUri = keys.redirect_uris ? keys.redirect_uris[0] : 'http://localhost:5000';
    
    return new google.auth.OAuth2(
        keys.client_id,
        keys.client_secret,
        redirectUri
    );
}

function isAuthorized() {
    return fs.existsSync(TOKEN_PATH);
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
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    return tokens;
}

async function getDriveClient() {
    const client = createOAuthClient();
    if (!client) throw new Error('credentials.json missing');
    
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error('Not authorized. Please connect Google Drive first.');
    }

    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    client.setCredentials(token);
    
    // Refresh token if needed
    client.on('tokens', (newTokens) => {
        if (newTokens.refresh_token) {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...newTokens }));
        }
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

module.exports = { isAuthorized, getAuthUrl, saveToken, getOrCreateFolder, uploadFile };
