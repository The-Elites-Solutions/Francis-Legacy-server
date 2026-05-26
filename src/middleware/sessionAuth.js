const pool = require('../config/database');

const sessionAuth = async (req, res, next) => {
  try {
    const sessionToken = req.cookies.session_token;

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' });
    }

    // Debug logging - check what token we're working with
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 SessionAuth Debug - Token: ${sessionToken.substring(0, 12)}...`);
    }

    // Determine session type from token prefix to avoid collision checks
    let session = null;
    let sessionType = null;

    if (sessionToken.startsWith('admin_')) {
      // Admin session - only check admin table
      const adminSessionResult = await pool.query(`
        SELECT s.*, s.user_id, s.expires_at, s.is_active, 'admin' as session_type
        FROM user_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      if (adminSessionResult.rows.length > 0) {
        session = adminSessionResult.rows[0];
        sessionType = 'admin';
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔍 SessionAuth Debug - Found admin session for user: ${session.user_id}`);
        }
      }
    } else if (sessionToken.startsWith('member_')) {
      // Family member session - only check family member table
      const familySessionResult = await pool.query(`
        SELECT s.*, s.family_member_id as user_id, s.expires_at, s.is_active, 'family_member' as session_type
        FROM family_member_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      if (familySessionResult.rows.length > 0) {
        session = familySessionResult.rows[0];
        sessionType = 'family_member';
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔍 SessionAuth Debug - Found family member session for user: ${session.user_id}`);
        }
      }
    } else {
      // Legacy token without prefix - check both tables for backwards compatibility
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔍 SessionAuth Debug - Legacy token detected, checking both tables`);
      }
      
      const adminSessionResult = await pool.query(`
        SELECT s.*, s.user_id, s.expires_at, s.is_active, 'admin' as session_type
        FROM user_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      const familySessionResult = await pool.query(`
        SELECT s.*, s.family_member_id as user_id, s.expires_at, s.is_active, 'family_member' as session_type
        FROM family_member_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      // Check for collision in legacy tokens
      if (adminSessionResult.rows.length > 0 && familySessionResult.rows.length > 0) {
        console.error(`🚨 CRITICAL: Legacy session token collision detected! Token ${sessionToken.substring(0, 8)}...`);
        return res.status(500).json({ error: 'Session authentication error - please login again' });
      }

      if (adminSessionResult.rows.length > 0) {
        session = adminSessionResult.rows[0];
        sessionType = 'admin';
      } else if (familySessionResult.rows.length > 0) {
        session = familySessionResult.rows[0];
        sessionType = 'family_member';
      }
    }

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Check if session is expired
    if (new Date() > new Date(session.expires_at)) {
      // Deactivate expired session in the appropriate table
      if (sessionType === 'admin') {
        await pool.query(`
          UPDATE user_sessions 
          SET is_active = false 
          WHERE token_hash = $1
        `, [sessionToken]);
      } else {
        await pool.query(`
          UPDATE family_member_sessions 
          SET is_active = false 
          WHERE token_hash = $1
        `, [sessionToken]);
      }
      
      return res.status(401).json({ error: 'Session expired' });
    }

    // Find user based on session type
    let user = null;
    let userType = sessionType;

    if (sessionType === 'family_member') {
      const familyMemberResult = await pool.query(`
        SELECT *, 'family_member' as user_type
        FROM family_members 
        WHERE id = $1 AND is_active = true
      `, [session.user_id]);

      if (familyMemberResult.rows.length > 0) {
        user = familyMemberResult.rows[0];
      }
    } else {
      const userResult = await pool.query(`
        SELECT *, 'admin' as user_type
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [session.user_id]);

      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Add user info to request
    req.user = {
      ...user,
      userType,
      role: userType === 'admin' ? user.role : 'member'
    };

    // Debug logging - show final user context
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 SessionAuth Debug - Final user context: ${req.user.userType} user ${req.user.id} (${req.user.first_name} ${req.user.last_name})`);
    }

    next();
  } catch (error) {
    console.error('Session authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const optionalSessionAuth = async (req, res, next) => {
  try {
    const sessionToken = req.cookies.session_token;

    if (!sessionToken) {
      req.user = null;
      return next();
    }

    // Determine session type from token prefix for optional auth
    let session = null;
    let sessionType = null;

    if (sessionToken.startsWith('admin_')) {
      // Admin session - only check admin table
      const adminSessionResult = await pool.query(`
        SELECT s.*, s.user_id, s.expires_at, s.is_active, 'admin' as session_type
        FROM user_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      if (adminSessionResult.rows.length > 0) {
        session = adminSessionResult.rows[0];
        sessionType = 'admin';
      }
    } else if (sessionToken.startsWith('member_')) {
      // Family member session - only check family member table
      const familySessionResult = await pool.query(`
        SELECT s.*, s.family_member_id as user_id, s.expires_at, s.is_active, 'family_member' as session_type
        FROM family_member_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      if (familySessionResult.rows.length > 0) {
        session = familySessionResult.rows[0];
        sessionType = 'family_member';
      }
    } else {
      // Legacy token - check both tables
      const adminSessionResult = await pool.query(`
        SELECT s.*, s.user_id, s.expires_at, s.is_active, 'admin' as session_type
        FROM user_sessions s
        WHERE s.token_hash = $1 AND s.is_active = true
      `, [sessionToken]);

      if (adminSessionResult.rows.length > 0) {
        session = adminSessionResult.rows[0];
        sessionType = 'admin';
      } else {
        const familySessionResult = await pool.query(`
          SELECT s.*, s.family_member_id as user_id, s.expires_at, s.is_active, 'family_member' as session_type
          FROM family_member_sessions s
          WHERE s.token_hash = $1 AND s.is_active = true
        `, [sessionToken]);

        if (familySessionResult.rows.length > 0) {
          session = familySessionResult.rows[0];
          sessionType = 'family_member';
        }
      }
    }

    if (!session) {
      req.user = null;
      return next();
    }

    // Check if session is expired
    if (new Date() > new Date(session.expires_at)) {
      req.user = null;
      return next();
    }

    // Find user based on session type
    let user = null;
    let userType = sessionType;

    if (sessionType === 'family_member') {
      const familyMemberResult = await pool.query(`
        SELECT *, 'family_member' as user_type
        FROM family_members 
        WHERE id = $1 AND is_active = true
      `, [session.user_id]);

      if (familyMemberResult.rows.length > 0) {
        user = familyMemberResult.rows[0];
      }
    } else {
      const userResult = await pool.query(`
        SELECT *, 'admin' as user_type
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [session.user_id]);

      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
      }
    }

    if (user) {
      req.user = {
        ...user,
        userType,
        role: userType === 'admin' ? user.role : 'member'
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional session authentication error:', error);
    req.user = null;
    next();
  }
};

const requireMember = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.userType === 'admin' || req.user.userType === 'family_member') {
    return next();
  }
  return res.status(403).json({ error: 'Member access required' });
};

module.exports = { sessionAuth, optionalSessionAuth, requireMember };