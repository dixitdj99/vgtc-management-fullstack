const svc = require('../utils/stockService');
const { getCol } = require('../utils/collectionUtils');

/**
 * The Set Bags endpoints, mounted onto each plant's stock router.
 *
 * Every plant keeps its own stock collections (`stock_additions`,
 * `jkl_stock_additions`, `kosli_stock_additions`, …) but the handlers around
 * them are identical, so the set-bag stack is written once here and each
 * router supplies its own collection names. `materials` is either a collection
 * name or a fixed array — the same two shapes `svc.addStock` already accepts.
 *
 * @param {import('express').Router} router
 * @param {{ setCol: string, materials: string | string[] }} cols
 */
function mountSetStockRoutes(router, { setCol, materials }) {
    const matsFor = (req) => (Array.isArray(materials) ? materials : getCol(materials, req));

    router.get('/set-stock', async (req, res) => {
        try { res.json(await svc.getSetStock(req.orgId, getCol(setCol, req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    router.post('/set-stock', async (req, res) => {
        try {
            const doc = await svc.addSetStock(req.orgId, req.body, getCol(setCol, req), matsFor(req));
            res.status(201).json(doc);
        } catch (e) { res.status(400).json({ error: e.message }); }
    });

    router.delete('/set-stock/:id', async (req, res) => {
        try {
            await svc.deleteSetStock(req.params.id, getCol(setCol, req));
            res.json({ ok: true });
        } catch (e) { res.status(404).json({ error: e.message }); }
    });
}

module.exports = { mountSetStockRoutes };
