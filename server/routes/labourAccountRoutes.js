const express = require('express');
const router = express.Router();
const svc = require('../utils/labourAccountService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth, tenancyMiddleware);

/**
 * The labour account reads ten collections across five plants, each gated on
 * its own lr_* or stock_* permission. Doing that from the browser would hand a
 * clerk who has Pay a fistful of 403s, so the reading happens here, once,
 * behind the single `pay` gate this router is mounted under.
 */

const range = (req) => ({ from: req.query.from || '', to: req.query.to || '' });
const who = (req) => req.user?.name || req.user?.username || '';

// The shape the client needs to render the rate grid without hardcoding it —
// including each crew's materials, which come from the stock modules they work
// rather than from whatever has already been loaded.
router.get('/meta', async (req, res) => {
  try {
    res.json({
      activities: svc.ACTIVITIES,
      activityLabels: svc.ACTIVITY_LABEL,
      groups: svc.GROUPS,
      plants: svc.PLANTS.map(({ key, label, group }) => ({ key, label, group })),
      loadingTypes: svc.LOADING_ACTIVITY,
      unloadingTypes: svc.UNLOADING_ACTIVITY,
      materials: await svc.materialsByGroup(req.orgId, req),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/rates', async (req, res) => {
  try { res.json(await svc.getRates(req.orgId, req)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT, so `gate` reads it as an edit rather than a view.
router.put('/rates', async (req, res) => {
  try { res.json(await svc.saveRates(req.orgId, req, req.body, who(req))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/entries', async (req, res) => {
  try {
    const lines = await svc.earnings(req.orgId, req, range(req));
    res.json(req.query.group ? lines.filter(l => l.group === req.query.group) : lines);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const rates = await svc.getRates(req.orgId, req);
    const [lines, payments] = await Promise.all([
      svc.earnings(req.orgId, req, range(req), rates),
      svc.listPayments(req.orgId, req, range(req)),
    ]);
    res.json({ ...svc.summarise(lines, payments), rates, payments, lineCount: lines.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/payments', async (req, res) => {
  try { res.json(await svc.listPayments(req.orgId, req, range(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payments', async (req, res) => {
  try { res.status(201).json(await svc.addPayment(req.orgId, req, req.body, who(req))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/payments/:id', async (req, res) => {
  try { await svc.removePayment(req.orgId, req, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
