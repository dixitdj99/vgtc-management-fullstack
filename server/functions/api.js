const serverless = require('serverless-http');
const app = require('../index');

const handler = serverless(app);

module.exports.handler = async (event, context) => {
    // Log the incoming request for debugging
    console.log('[Netlify] Incoming:', event.httpMethod, event.path);
    const result = await handler(event, context);
    return result;
};
