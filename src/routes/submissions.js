const express = require('express');
const submissionRepository = require('../repositories/submissionRepository');
const adminRepository = require('../repositories/adminRepository');
const { authenticateUser, requireAdmin, requireMember } = require('../middleware/memberAuth');

const router = express.Router();

// Get all submissions (admin only)
router.get('/', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const submissions = await submissionRepository.getAllSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user's submissions
router.get('/my-submissions', authenticateUser, requireMember, async (req, res) => {
  try {
    let submissions;
    
    if (req.userType === 'family_member') {
      submissions = await submissionRepository.getSubmissionsByFamilyMember(req.user.id);
    } else {
      submissions = await submissionRepository.getSubmissionsByUser(req.user.id);
    }
    
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching user submissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new submission (both admin and family members)
router.post('/', authenticateUser, requireMember, async (req, res) => {
  try {
    const { type, title, content } = req.body;

    // Validate input
    if (!type || !title || !content) {
      return res.status(400).json({ error: 'Type, title, and content are required' });
    }

    if (!['news', 'blog', 'archive'].includes(type)) {
      return res.status(400).json({ error: 'Invalid submission type' });
    }

    let submission;
    
    if (req.userType === 'family_member') {
      submission = await submissionRepository.createFamilyMemberSubmission(
        { type, title, content },
        req.user.id
      );
    } else {
      submission = await submissionRepository.createUserSubmission(
        { type, title, content },
        req.user.id
      );
    }

    // Log the submission creation
    await adminRepository.logAdminAction(
      req.userType === 'admin' ? req.user.id : null,
      'CREATE_SUBMISSION',
      'content_submission',
      submission.id,
      { type, title, submitterType: req.userType },
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({
      message: 'Submission created successfully',
      submission
    });
  } catch (error) {
    console.error('Error creating submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get submission by ID (admin only)
router.get('/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await submissionRepository.getSubmissionById(id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Review submission (admin only)
router.patch('/:id/review', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const submission = await submissionRepository.updateSubmissionStatus(
      id, 
      status, 
      req.user.id, 
      reviewNotes
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // If approved, create the actual content
    if (status === 'approved') {
      const content = submission.content;

      try {
        if (submission.type === 'news') {
          await submissionRepository.createNewsFromSubmission(content, submission.submitted_by || submission.submitted_by_family_member, id);
        } else if (submission.type === 'blog') {
          await submissionRepository.createBlogFromSubmission(content, submission.submitted_by || submission.submitted_by_family_member, id);
        } else if (submission.type === 'archive') {
          await submissionRepository.createArchiveFromSubmission(content, submission.submitted_by || submission.submitted_by_family_member, req.user.id, id);
        }
      } catch (contentError) {
        console.error('Error creating approved content:', contentError);
        await submissionRepository.revertSubmissionStatus(id);
        return res.status(500).json({ error: 'Failed to create approved content' });
      }
    } else if (status === 'rejected') {
      // Check if this submission was previously approved and has published content
      const hasPublished = await submissionRepository.hasPublishedContent(id);

      if (hasPublished) {
        try {
          await submissionRepository.deletePublishedContent(id);
          console.log(`Deleted published content for rejected submission: ${id}`);
        } catch (deleteError) {
          console.error('Error deleting published content:', deleteError);
          // Don't fail the rejection, but log the error
        }
      }
    }

    // Log the review action
    await adminRepository.logAdminAction(
      req.user.id,
      'REVIEW_SUBMISSION',
      'content_submission',
      id,
      { status, reviewNotes, type: submission.type },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      message: `Submission ${status} successfully`,
      submission
    });
  } catch (error) {
    console.error('Error reviewing submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete submission (admin only or submission owner)
router.delete('/:id', authenticateUser, requireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await submissionRepository.getSubmissionById(id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Check ownership or admin rights
    const canDelete = req.userType === 'admin' || 
                     (req.userType === 'family_member' && submission.submitted_by_family_member === req.user.id) ||
                     (req.userType === 'user' && submission.submitted_by === req.user.id);

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this submission' });
    }

    // Only allow deletion if submission is pending
    if (submission.status !== 'pending') {
      return res.status(400).json({ error: 'Can only delete pending submissions' });
    }

    await submissionRepository.deleteSubmission(id);

    // Log the deletion
    await adminRepository.logAdminAction(
      req.userType === 'admin' ? req.user.id : null,
      'DELETE_SUBMISSION',
      'content_submission',
      id,
      { type: submission.type, title: submission.title },
      req.ip,
      req.get('User-Agent')
    );

    res.json({ message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get submission statistics (admin only)
router.get('/stats/overview', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const stats = await submissionRepository.getSubmissionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching submission stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;