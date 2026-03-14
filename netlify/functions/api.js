const serverless = require('serverless-http');
const app = require('../../server/index');

const handler = serverless(app);

module.exports.handler = async (event, context) => {
    console.log('[Netlify] Incoming:', event.httpMethod, event.path);
    return handler(event, context);
};
