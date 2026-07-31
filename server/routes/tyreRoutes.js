const express = require('express');
const router = express.Router();
const tyreService = require('../services/tyreService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth, tenancyMiddleware);

// Create a new tyre
router.post('/', async (req, res) => {
  try {
    const tyre = await tyreService.createTyre(req.orgId, req.body);
    res.status(201).json(tyre);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all tyres for organization
router.get('/', async (req, res) => {
  try {
    const tyres = await tyreService.getAllTyres(req.orgId);
    res.json(tyres);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific tyre
router.get('/:id', async (req, res) => {
  try {
    const tyre = await tyreService.getTyreById(req.orgId, req.params.id);
    res.json(tyre);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Fit tyre to a vehicle
router.post('/:id/fit', async (req, res) => {
  try {
    const tyre = await tyreService.fitTyre(req.orgId, req.params.id, req.body);
    res.json(tyre);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Remove tyre from a vehicle
router.post('/:id/remove', async (req, res) => {
  try {
    const tyre = await tyreService.removeTyre(req.orgId, req.params.id, req.body);
    res.json(tyre);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Retread tyre
router.post('/:id/retread', async (req, res) => {
  try {
    const tyre = await tyreService.retreadTyre(req.orgId, req.params.id, req.body);
    res.json(tyre);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Scrap tyre
router.post('/:id/scrap', async (req, res) => {
  try {
    const tyre = await tyreService.scrapTyre(req.orgId, req.params.id, req.body);
    res.json(tyre);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete tyre
router.delete('/:id', async (req, res) => {
  try {
    await tyreService.deleteTyre(req.orgId, req.params.id);
    res.json({ success: true, message: 'Tyre deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
