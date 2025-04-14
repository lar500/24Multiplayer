export type User = {
  id: string;
  username: string;
  email: string;
  password: string; // Hashed password
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithoutPassword = Omit<User, 'password'>; 