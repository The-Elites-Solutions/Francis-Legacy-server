const familyRepository = require('../repositories/familyRepository');
const adminRepository = require('../repositories/adminRepository');

class FamilyController {
  async getAllMembers(req, res) {
    try {
      const members = await familyRepository.getAll();
      res.json(members);
    } catch (error) {
      console.error('Error fetching family members:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // New endpoint for unified family member management with authentication status
  async getAllMembersWithAuth(req, res) {
    try {
      const members = await familyRepository.getAll();
      
      // Transform the data to include authentication status and user-friendly fields
      const membersWithAuth = members.map(member => ({
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        username: member.username || 'Not Set',
        email: member.email || `${member.username}@francislegacy.com`, // Generate email from username if not set
        role: 'member', // Family members are always 'member' role
        is_active: member.is_active ?? true,
        password_changed: member.password_changed ?? false,
        created_at: member.created_at,
        last_login: member.last_login,
        birth_date: member.birth_date,
        phone: member.phone,
        profile_photo_url: member.profile_photo_url,
        // Tree relationship info
        father_id: member.father_id,
        mother_id: member.mother_id,
        spouse_id: member.spouse_id,
        // Status info
        has_password: !!member.password_hash,
        auth_status: member.password_hash ? (member.password_changed ? 'Active' : 'Needs Password Change') : 'No Account'
      }));

      res.json(membersWithAuth);
    } catch (error) {
      console.error('Error fetching family members with auth:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getMemberById(req, res) {
    try {
      const { id } = req.params;
      const member = await familyRepository.findById(id);

      if (!member) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      res.json(member);
    } catch (error) {
      console.error('Error fetching family member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createMember(req, res) {
    try {
      const {
        firstName, lastName, maidenName, gender, birthDate, deathDate,
        birthPlace, occupation, biography, profilePhotoUrl,
        fatherId, motherId, spouseId
      } = req.body;

      // Helper function to convert empty strings to null for date fields
      const normalizeDate = (date) => {
        if (typeof date === 'string' && date.trim() === '') return null;
        if (date === null || date === undefined) return null;
        return date;
      };

      // Helper function to convert empty strings to null for UUID fields
      const normalizeUuid = (uuid) => {
        if (typeof uuid === 'string' && uuid.trim() === '') return null;
        if (uuid === null || uuid === undefined) return null;
        return uuid;
      };

      // Normalize input data
      const normalizedBirthDate = normalizeDate(birthDate);
      const normalizedDeathDate = normalizeDate(deathDate);
      const normalizedFatherId = normalizeUuid(fatherId);
      const normalizedMotherId = normalizeUuid(motherId);
      const normalizedSpouseId = normalizeUuid(spouseId);

      // Input validation
      const errors = [];
      
      if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
        errors.push('First name is required');
      }
      
      if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
        errors.push('Last name is required');
      }
      
      if (normalizedBirthDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
        errors.push('Birth date must be in YYYY-MM-DD format');
      }
      
      if (normalizedDeathDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDeathDate)) {
        errors.push('Death date must be in YYYY-MM-DD format');
      }
      
      if (normalizedBirthDate && normalizedDeathDate && new Date(normalizedBirthDate) >= new Date(normalizedDeathDate)) {
        errors.push('Birth date must be before death date');
      }
      
      if (firstName && firstName.trim().length > 50) {
        errors.push('First name must be 50 characters or less');
      }
      
      if (lastName && lastName.trim().length > 50) {
        errors.push('Last name must be 50 characters or less');
      }
      
      if (gender && !['M', 'F'].includes(gender.toUpperCase())) {
        errors.push('Gender must be M (Male) or F (Female)');
      }

      if (errors.length > 0) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors 
        });
      }

      const member = await familyRepository.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        maidenName: maidenName && maidenName.trim() !== '' ? maidenName.trim() : null,
        gender: gender ? gender.toUpperCase() : null,
        birthDate: normalizedBirthDate,
        deathDate: normalizedDeathDate,
        birthPlace: birthPlace && birthPlace.trim() !== '' ? birthPlace.trim() : null,
        occupation: occupation && occupation.trim() !== '' ? occupation.trim() : null,
        biography: biography && biography.trim() !== '' ? biography.trim() : null,
        profilePhotoUrl: profilePhotoUrl && profilePhotoUrl.trim() !== '' ? profilePhotoUrl.trim() : null,
        fatherId: normalizedFatherId,
        motherId: normalizedMotherId,
        spouseId: normalizedSpouseId
      });

      // Log admin action if user is admin
      if (req.user && req.user.role === 'admin') {
        await adminRepository.logAdminAction(
          req.user.id,
          'CREATE_FAMILY_MEMBER',
          'family_member',
          member.id,
          { firstName: firstName.trim(), lastName: lastName.trim() },
          req.ip,
          req.get('User-Agent')
        );
      }

      res.status(201).json(member);
    } catch (error) {
      console.error('Error creating family member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateMember(req, res) {
    try {
      const { id } = req.params;
      const {
        firstName, lastName, maidenName, gender, birthDate, deathDate,
        birthPlace, occupation, biography, profilePhotoUrl,
        fatherId, motherId, spouseId
      } = req.body;

      // Helper function to convert empty strings to null for date fields
      const normalizeDate = (date) => {
        if (typeof date === 'string' && date.trim() === '') return null;
        if (date === null || date === undefined) return null;
        return date;
      };

      // Helper function to convert empty strings to null for UUID fields
      const normalizeUuid = (uuid) => {
        if (typeof uuid === 'string' && uuid.trim() === '') return null;
        if (uuid === null || uuid === undefined) return null;
        return uuid;
      };

      // Normalize input data
      const normalizedBirthDate = normalizeDate(birthDate);
      const normalizedDeathDate = normalizeDate(deathDate);
      const normalizedFatherId = normalizeUuid(fatherId);
      const normalizedMotherId = normalizeUuid(motherId);
      const normalizedSpouseId = normalizeUuid(spouseId);

      const member = await familyRepository.update(id, {
        firstName: firstName && firstName.trim() !== '' ? firstName.trim() : null,
        lastName: lastName && lastName.trim() !== '' ? lastName.trim() : null,
        maidenName: maidenName && maidenName.trim() !== '' ? maidenName.trim() : null,
        gender: gender ? gender.toUpperCase() : null,
        birthDate: normalizedBirthDate,
        deathDate: normalizedDeathDate,
        birthPlace: birthPlace && birthPlace.trim() !== '' ? birthPlace.trim() : null,
        occupation: occupation && occupation.trim() !== '' ? occupation.trim() : null,
        biography: biography && biography.trim() !== '' ? biography.trim() : null,
        profilePhotoUrl: profilePhotoUrl && profilePhotoUrl.trim() !== '' ? profilePhotoUrl.trim() : null,
        fatherId: normalizedFatherId,
        motherId: normalizedMotherId,
        spouseId: normalizedSpouseId
      });

      if (!member) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      // Log admin action if user is admin
      if (req.user && req.user.role === 'admin') {
        await adminRepository.logAdminAction(
          req.user.id,
          'UPDATE_FAMILY_MEMBER',
          'family_member',
          id,
          { firstName: firstName && firstName.trim(), lastName: lastName && lastName.trim() },
          req.ip,
          req.get('User-Agent')
        );
      }

      res.json(member);
    } catch (error) {
      console.error('Error updating family member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteMember(req, res) {
    try {
      const { id } = req.params;
      const member = await familyRepository.delete(id);

      if (!member) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      // Log admin action if user is admin
      if (req.user && req.user.role === 'admin') {
        await adminRepository.logAdminAction(
          req.user.id,
          'DELETE_FAMILY_MEMBER',
          'family_member',
          id,
          { firstName: member.first_name, lastName: member.last_name },
          req.ip,
          req.get('User-Agent')
        );
      }

      res.json({ message: 'Family member deleted successfully' });
    } catch (error) {
      console.error('Error deleting family member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Reset password for a family member
  async resetMemberPassword(req, res) {
    try {
      const { id } = req.params;
      
      const member = await familyRepository.resetPassword(id);
      if (!member) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      // Log admin action
      if (req.user && req.user.role === 'admin') {
        await adminRepository.logAdminAction(
          req.user.id,
          'RESET_MEMBER_PASSWORD',
          'family_member',
          id,
          { firstName: member.first_name, lastName: member.last_name },
          req.ip,
          req.get('User-Agent')
        );
      }

      // Return the temporary password (in real app, this would be emailed)
      res.json({
        message: 'Password reset successfully',
        tempPassword: member.temp_password,
        username: member.username,
        emailSent: false // Would be true if email was sent
      });
    } catch (error) {
      console.error('Error resetting member password:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update own profile - family member self-editing
  async updateOwnProfile(req, res) {
    try {
      // Ensure user is authenticated and is a family member
      if (!req.user || req.user.userType !== 'family_member') {
        return res.status(403).json({ error: 'Access denied. Family members only.' });
      }

      const {
        firstName, lastName, maidenName, gender, birthDate,
        birthPlace, phone, occupation, biography, profilePhotoUrl
      } = req.body;

      // Input validation
      const errors = [];
      
      if (firstName && (typeof firstName !== 'string' || firstName.trim().length === 0)) {
        errors.push('First name cannot be empty');
      }
      
      if (lastName && (typeof lastName !== 'string' || lastName.trim().length === 0)) {
        errors.push('Last name cannot be empty');
      }
      
      if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        errors.push('Birth date must be in YYYY-MM-DD format');
      }
      
      if (firstName && firstName.trim().length > 50) {
        errors.push('First name must be 50 characters or less');
      }
      
      if (lastName && lastName.trim().length > 50) {
        errors.push('Last name must be 50 characters or less');
      }
      
      if (gender && !['M', 'F'].includes(gender.toUpperCase())) {
        errors.push('Gender must be M (Male) or F (Female)');
      }


      if (errors.length > 0) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors 
        });
      }

      // Update profile using the user's ID
      const updatedMember = await familyRepository.updateOwnProfile(req.user.id, {
        firstName,
        lastName,
        maidenName,
        gender,
        birthDate,
        birthPlace,
        phone,
        occupation,
        biography,
        profilePhotoUrl
      });

      if (!updatedMember) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.json({
        message: 'Profile updated successfully',
        member: updatedMember
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

}

module.exports = new FamilyController();