const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications
} = require('../utils/notificationService');

// GET /api/notifications
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const list = await getNotifications(limit, req);
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', async (req, res) => {
    try {
        await markAllNotificationsRead(req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
    try {
        await markNotificationRead(req.params.id, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res) => {
    try {
        await deleteNotification(req.params.id, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/notifications
router.delete('/', async (req, res) => {
    try {
        await clearAllNotifications(req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
