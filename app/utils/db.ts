import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User, UserWithoutPassword } from '../models/User';

// Path to the JSON file that will store user data
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// In-memory storage for users (replace with a database in production)
const users: User[] = [];

// Ensure the data directory exists
const ensureDataDir = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Initialize the users file if it doesn't exist
const initializeUsers = () => {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
};

// Load users from file
const loadUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading users from file:', error);
    return [];
  }
};

// Save users to file
const saveUsers = (users: UserWithoutPassword[]) => {
  try {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users to file:', error);
  }
};

// Initialize and load users
initializeUsers();
loadUsers();

// User functions
export const createUser = async (username: string, email: string, password: string): Promise<UserWithoutPassword | null> => {
  // Check if username or email already exists
  if (users.some(user => user.username === username || user.email === email)) {
    return null;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const newUser: User = {
    id: Date.now().toString(),
    username,
    email,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Add user to array
  users.push(newUser);

  // Save to file
  saveUsers(users.map(user => ({ ...user, password: '' }) as UserWithoutPassword));

  // Return user without password
  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
};

export const getUserByEmail = (email: string): User | null => {
  return users.find(user => user.email === email) || null;
};

export const getUserById = (id: string): User | null => {
  return users.find(user => user.id === id) || null;
};

export const verifyPassword = async (email: string, password: string): Promise<UserWithoutPassword | null> => {
  const user = getUserByEmail(email);
  if (!user) return null;

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return null;

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}; 