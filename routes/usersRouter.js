import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {generateToken, login, signup} from '../auth.js';
const router = express.Router();

// POST route for user signup
router.post('/signup', async (req, res) => {
 signup(req,res);
});

// POST route for user login
router.post('/login', async (req, res) => {
  login(req,res);
});

export default router;