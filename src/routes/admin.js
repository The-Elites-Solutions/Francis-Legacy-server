const express = require('express');
const { sessionAuth } = require('../middleware/sessionAuth');
const adminController = require('../controllers/adminController');
const archiveController = require('../controllers/archiveController');
const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.get('/dashboard/stats', sessionAuth, requireAdmin, adminController.getDashboardStats);

router.get('/users', sessionAuth, requireAdmin, adminController.getAllUsers);

router.post('/users', sessionAuth, requireAdmin, adminController.createUser);

router.put('/users/:id', sessionAuth, requireAdmin, adminController.updateUser);

router.delete('/users/:id', sessionAuth, requireAdmin, adminController.deleteUser);

router.get('/submissions', sessionAuth, requireAdmin, adminController.getSubmissions);

router.put('/submissions/:id', sessionAuth, requireAdmin, adminController.reviewSubmission);

router.get('/audit-log', sessionAuth, requireAdmin, adminController.getAuditLog);

router.post('/users/:id/reset-password', sessionAuth, requireAdmin, adminController.resetUserPassword);


router.get('/storage-stats', sessionAuth, requireAdmin, adminController.getStorageStats);
router.get('/imagekit-stats', sessionAuth, requireAdmin, adminController.getImageKitStats);
router.get('/enhanced-storage-stats', sessionAuth, requireAdmin, adminController.getEnhancedStorageStats);

// Admin archive management routes
router.get('/archives', sessionAuth, requireAdmin, archiveController.getArchives);
router.get('/archives/:id', sessionAuth, requireAdmin, archiveController.getArchiveById);
router.post('/archives', sessionAuth, requireAdmin, archiveController.createArchive);
router.put('/archives/:id', sessionAuth, requireAdmin, archiveController.updateArchive);
router.delete('/archives/:id', sessionAuth, requireAdmin, archiveController.deleteArchive);

module.exports = router;