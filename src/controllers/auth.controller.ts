import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user.repository';

const userRepository = new UserRepository();
const JWT_SECRET = process.env.JWT_SECRET || 'lifeline-pharmacy-super-secret-key-12345';

export class AuthController {
  
  public register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password || !firstName || !lastName) {
        res.status(400).json({ success: false, message: 'All fields are required.' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
        return;
      }

      // Check if user already exists
      const existingUser = await userRepository.findByEmail(email.toLowerCase().trim());
      if (existingUser) {
        res.status(400).json({ success: false, message: 'User with this email already exists.' });
        return;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const userId = crypto.randomUUID();

      // Create user
      const user = await userRepository.createLocalUser(
        userId,
        email.toLowerCase().trim(),
        passwordHash,
        firstName.trim(),
        lastName.trim()
      );

      // Generate JWT
      const token = jwt.sign(
        { userId: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove sensitive data before returning
      const { password_hash, ...userResponse } = user;

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        token,
        user: userResponse
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error during registration.' });
    }
  };

  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ success: false, message: 'Email and password are required.' });
        return;
      }

      // Find user
      const user = await userRepository.findByEmail(email.toLowerCase().trim());
      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid email or password.' });
        return;
      }

      if (!user.password_hash) {
        res.status(401).json({
          success: false,
          message: 'This account uses Google authentication. Please sign in with Google.'
        });
        return;
      }

      // Compare passwords
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        res.status(401).json({ success: false, message: 'Invalid email or password.' });
        return;
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { password_hash, ...userResponse } = user;

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: userResponse
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error during login.' });
    }
  };

  public googleLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const { credential } = req.body;

      if (!credential) {
        res.status(400).json({ success: false, message: 'Google credential token is required.' });
        return;
      }

      // Verify Google ID token by calling tokeninfo API
      const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`;
      const response = await fetch(googleVerifyUrl);
      
      if (!response.ok) {
        res.status(400).json({ success: false, message: 'Failed to verify Google token.' });
        return;
      }

      const googlePayload = (await response.json()) as any;
      
      // Ensure the email is verified
      if (googlePayload.email_verified !== 'true' && googlePayload.email_verified !== true) {
        res.status(400).json({ success: false, message: 'Google account email is not verified.' });
        return;
      }

      const googleId = googlePayload.sub;
      const email = googlePayload.email.toLowerCase().trim();
      const firstName = googlePayload.given_name || 'Google';
      const lastName = googlePayload.family_name || 'User';
      const avatarUrl = googlePayload.picture || '';

      let user = await userRepository.findByGoogleId(googleId);

      if (!user) {
        // Check if user exists with the same email
        const existingEmailUser = await userRepository.findByEmail(email);
        if (existingEmailUser) {
          // Link google account to existing user
          user = await userRepository.linkGoogleAccount(existingEmailUser.user_id, googleId, avatarUrl);
        } else {
          // Create new google user
          const userId = crypto.randomUUID();
          user = await userRepository.createGoogleUser(userId, email, googleId, firstName, lastName, avatarUrl);
        }
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { password_hash, ...userResponse } = user;

      res.status(200).json({
        success: true,
        message: 'Google login successful',
        token,
        user: userResponse
      });
    } catch (error: any) {
      console.error('Google login error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error during Google login.' });
    }
  };

  public getMe = async (req: any, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const { password_hash, ...userResponse } = user;

      res.status(200).json({
        success: true,
        user: userResponse
      });
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({ success: false, message: 'Server error retrieving profile.' });
    }
  };
}
