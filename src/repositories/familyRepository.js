const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const userRateLimiter = require('../middleware/userRateLimiter');

class FamilyRepository {
  async getAll() {
    const result = await pool.query(`
      SELECT 
        id, first_name, last_name, maiden_name, gender, birth_date, death_date,
        birth_place, occupation, biography, profile_photo_url,
        father_id, mother_id, spouse_id, username, password_hash, password_changed, is_active, last_login, created_at, updated_at
      FROM family_members 
      ORDER BY first_name, last_name
    `);
    return result.rows;
  }

  async findById(id) {
    const result = await pool.query(`
      SELECT 
        fm.*,
        father.first_name as father_first_name,
        father.last_name as father_last_name,
        mother.first_name as mother_first_name,
        mother.last_name as mother_last_name,
        spouse.first_name as spouse_first_name,
        spouse.last_name as spouse_last_name
      FROM family_members fm
      LEFT JOIN family_members father ON fm.father_id = father.id
      LEFT JOIN family_members mother ON fm.mother_id = mother.id
      LEFT JOIN family_members spouse ON fm.spouse_id = spouse.id
      WHERE fm.id = $1
    `, [id]);
    return result.rows[0];
  }

  async create(memberData) {
    const {
      firstName, lastName, maidenName, gender, birthDate, deathDate,
      birthPlace, occupation, biography, profilePhotoUrl,
      fatherId, motherId, spouseId
    } = memberData;

    // Generate username and temporary password
    const usernameResult = await pool.query(
      'SELECT generate_username($1, $2) as username',
      [firstName, lastName]
    );
    const username = usernameResult.rows[0].username;

    const tempPasswordResult = await pool.query(
      'SELECT generate_temp_password() as temp_password'
    );
    const tempPassword = tempPasswordResult.rows[0].temp_password;

    // Hash the temporary password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    const result = await pool.query(`
      INSERT INTO family_members 
      (first_name, last_name, maiden_name, gender, birth_date, death_date, birth_place, 
       occupation, biography, profile_photo_url, father_id, mother_id, spouse_id, 
       username, password_hash, password_changed, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING *, $18 as temp_password
    `, [firstName, lastName, maidenName, gender, birthDate, deathDate, birthPlace, 
        occupation, biography, profilePhotoUrl, fatherId, motherId, spouseId,
        username, passwordHash, false, true, tempPassword]);
    
    return result.rows[0];
  }

  async update(id, memberData) {
    const {
      firstName, lastName, maidenName, gender, birthDate, deathDate,
      birthPlace, occupation, biography, profilePhotoUrl,
      fatherId, motherId, spouseId
    } = memberData;

    const result = await pool.query(`
      UPDATE family_members 
      SET first_name = $1, last_name = $2, maiden_name = $3, gender = $4, birth_date = $5, 
          death_date = $6, birth_place = $7, occupation = $8, biography = $9, 
          profile_photo_url = $10, father_id = $11, mother_id = $12, spouse_id = $13, 
          updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [firstName, lastName, maidenName, gender, birthDate, deathDate, birthPlace, 
        occupation, biography, profilePhotoUrl, fatherId, motherId, spouseId, id]);
    return result.rows[0];
  }

  async findByUsername(username) {
    const result = await pool.query(`
      SELECT * FROM family_members WHERE username = $1
    `, [username]);
    return result.rows[0];
  }

  async updatePassword(id, newPasswordHash) {
    const result = await pool.query(`
      UPDATE family_members 
      SET password_hash = $1, password_changed = true, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newPasswordHash, id]);
    return result.rows[0];
  }

  async resetPassword(id) {
    // Get member details to use username as password
    const member = await this.findById(id);
    if (!member) {
      throw new Error('Member not found');
    }

    // Use username as the new password
    const newPassword = member.username;

    // Hash the username password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    const result = await pool.query(`
      UPDATE family_members 
      SET password_hash = $1, password_changed = false, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [passwordHash, id]);
    
    // Invalidate all sessions for this family member when password is reset
    await pool.query(`
      UPDATE family_member_sessions 
      SET is_active = false 
      WHERE family_member_id = $1
    `, [id]);
    
    // Clear rate limit for password reset
    await userRateLimiter.clearRateLimitByUserId(id, 'family_member');
    
    // Add the username as the new password to the result
    if (result.rows[0]) {
      result.rows[0].new_password = newPassword;
    }
    
    return result.rows[0];
  }

  async updateLastLogin(id) {
    const result = await pool.query(`
      UPDATE family_members 
      SET last_login = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    return result.rows[0];
  }

  async delete(id) {
    const result = await pool.query('DELETE FROM family_members WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  async getCount() {
    const result = await pool.query('SELECT COUNT(*) as total FROM family_members');
    return parseInt(result.rows[0].total);
  }

  async updateOwnProfile(id, profileData) {
    const {
      firstName, lastName, maidenName, gender, birthDate,
      birthPlace, phone, occupation, biography, profilePhotoUrl
    } = profileData;

    // Helper function to convert empty strings to null for date fields
    const normalizeDate = (date) => {
      if (typeof date === 'string' && date.trim() === '') return null;
      if (date === null || date === undefined) return null;
      return date;
    };

    const normalizedBirthDate = normalizeDate(birthDate);

    const result = await pool.query(`
      UPDATE family_members 
      SET 
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        maiden_name = $3,
        gender = $4,
        birth_date = $5,
        birth_place = $6,
        occupation = $7,
        biography = $8,
        phone = $9,
        profile_photo_url = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING
        id, first_name, last_name, maiden_name, gender, birth_date,
        birth_place, phone, occupation, biography, profile_photo_url,
        username, created_at, updated_at
    `, [
      firstName && firstName.trim() !== '' ? firstName.trim() : null,
      lastName && lastName.trim() !== '' ? lastName.trim() : null,
      maidenName && maidenName.trim() !== '' ? maidenName.trim() : null,
      gender ? gender.toUpperCase() : null,
      normalizedBirthDate,
      birthPlace && birthPlace.trim() !== '' ? birthPlace.trim() : null,
      occupation && occupation.trim() !== '' ? occupation.trim() : null,
      biography && biography.trim() !== '' ? biography.trim() : null,
      phone && phone.trim() !== '' ? phone.trim() : null,
      profilePhotoUrl && profilePhotoUrl.trim() !== '' ? profilePhotoUrl.trim() : null,
      id
    ]);
    
    return result.rows[0];
  }
}

module.exports = new FamilyRepository();