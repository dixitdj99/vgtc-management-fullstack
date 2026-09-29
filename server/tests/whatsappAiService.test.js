const test = require('node:test');
const assert = require('node:assert/strict');

const originalKey = process.env.GEMINI_API_KEY;
const originalEnabled = process.env.WHATSAPP_AI_ENABLED;
process.env.GEMINI_API_KEY = 'unit-test-key';
delete process.env.WHATSAPP_AI_ENABLED;

const requests = [];
let geminiResponse = {
    data: { candidates: [{ content: { parts: [{ text: 'Test answer' }] } }] }
};
const axiosId = require.resolve('axios');
const previousAxios = require.cache[axiosId];
require.cache[axiosId] = {
    id: axiosId,
    filename: axiosId,
    loaded: true,
    exports: {
        post: async (...args) => {
            requests.push(args);
            return geminiResponse;
        }
    }
};
const service = require('../services/whatsappAiService');

test.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalEnabled === undefined) delete process.env.WHATSAPP_AI_ENABLED;
    else process.env.WHATSAPP_AI_ENABLED = originalEnabled;
    if (previousAxios) require.cache[axiosId] = previousAxios;
    else delete require.cache[axiosId];
});

test.beforeEach(() => {
    requests.length = 0;
    geminiResponse = {
        data: { candidates: [{ content: { parts: [{ text: 'Test answer' }] } }] }
    };
});

test('sends bounded user text with company guardrails and API key', async () => {
    const reply = await service.generateAiReply({ phone: '919111111111', message: 'x'.repeat(1300) });
    assert.equal(reply, 'Test answer');
    assert.equal(requests.length, 1);
    const [url, payload, options] = requests[0];
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);
    assert.equal(options.headers['x-goog-api-key'], 'unit-test-key');
    assert.equal(payload.contents.at(-1).parts[0].text.length, 1200);
    assert.match(payload.systemInstruction.parts[0].text, /Never invent a vehicle balance/);
});

test('keeps conversation history separate by sender', async () => {
    await service.generateAiReply({ phone: '919222222222', message: 'First question' });
    await service.generateAiReply({ phone: '919222222222', message: 'Follow up' });
    await service.generateAiReply({ phone: '919333333333', message: 'Other sender' });

    assert.equal(requests[0][1].contents.length, 1);
    assert.equal(requests[1][1].contents.length, 3);
    assert.equal(requests[2][1].contents.length, 1);
});

test('disabled or unconfigured AI makes no API request', async () => {
    process.env.WHATSAPP_AI_ENABLED = 'false';
    assert.equal(await service.generateAiReply({ phone: '919444444444', message: 'Hello' }), null);
    delete process.env.WHATSAPP_AI_ENABLED;
    delete process.env.GEMINI_API_KEY;
    assert.equal(await service.generateAiReply({ phone: '919444444444', message: 'Hello' }), null);
    assert.equal(requests.length, 0);
    process.env.GEMINI_API_KEY = 'unit-test-key';
});

test('empty Gemini candidate fails instead of sending an empty reply', async () => {
    geminiResponse = { data: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } };
    await assert.rejects(
        service.generateAiReply({ phone: '919555555555', message: 'Question' }),
        /Gemini returned no text/
    );
});

test('limits one sender to five Gemini requests per minute without blocking another sender', async () => {
    const phone = '919666666666';
    for (let index = 0; index < 5; index++) {
        assert.equal(await service.generateAiReply({ phone, message: `Question ${index}` }), 'Test answer');
    }
    assert.equal(requests.length, 5);

    // Implementations may return null or reject with a rate-limit error; either
    // is safe as long as the sixth prompt never consumes a Gemini request.
    try {
        await service.generateAiReply({ phone, message: 'Sixth question' });
    } catch (error) {
        assert.match(error.message, /rate|limit|too many/i);
    }
    assert.equal(requests.length, 5);

    await service.generateAiReply({ phone: '919777777777', message: 'Different sender' });
    assert.equal(requests.length, 6);
});
