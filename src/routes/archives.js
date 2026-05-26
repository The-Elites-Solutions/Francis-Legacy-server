/**
 * Archives routes.
 *
 * AUTH POSTURE (intentional asymmetry — see audit H-S2):
 *   The read endpoints below (GET /, /stats, /:id, /:id/download) are
 *   deliberately PUBLIC at the API layer (no sessionAuth). Access control
 *   for end users is enforced at the frontend (the /archives and
 *   /archives/:id routes are wrapped in <ProtectedRoute>), so anonymous
 *   browsers never see the archive grid in the SPA.
 *
 *   Keeping the API itself public is intentional:
 *     - allows future SEO/crawler exposure of public-facing items without
 *       a backend refactor;
 *     - lets us serve direct file_url and signed download URLs without
 *       cookie context for embeddable previews;
 *     - matches the public posture of /blog and /news read endpoints.
 *
 *   Write endpoints (POST/PUT/DELETE) remain behind sessionAuth below.
 *   If you need to gate reads later, swap to an `optionalSessionAuth`
 *   middleware so the asymmetry stays explicit.
 */
const express = require('express');
const archiveController = require('../controllers/archiveController');
const { sessionAuth } = require('../middleware/sessionAuth');
const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Public routes (no authentication required for viewing)
router.get('/', archiveController.getArchives);
router.get('/stats', archiveController.getArchiveStats);
router.get('/:id', archiveController.getArchiveById);
router.get('/:id/download', archiveController.getDownloadUrl);

// Protected routes (authentication required)
router.use(sessionAuth); // All routes below require authentication

router.post('/', archiveController.createArchive);
router.put('/:id', archiveController.updateArchive);
router.delete('/:id', archiveController.deleteArchive);
router.get('/user/my-archives', archiveController.getUserArchives);

module.exports = router;