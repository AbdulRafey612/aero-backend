import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

// Function to generate a JWT token
export const generateToken = (user)=> {
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return token;
}


// Function to handle user login
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user with given email exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if password is correct
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate a JWT token
    const token = generateToken(user);

    return res.status(200).json({ token, user: user._id, userName: user.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};  

// Function to handle signup
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user with given email already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create a new user object
    user = new User({
      name,
      email,
      password
    });

    // Save the user to the database
    await user.save();

    // Generate a JWT token
    const token = generateToken(user);

    res.json({ token, user:user._id });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
}

// Middleware to protect routes that require authentication
export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decodedToken.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    req.user = { userId: user._id.toString(), email: user.email };
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: 'Invalid authentication token' });
  }
};
