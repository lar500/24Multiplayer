import 'next-auth';
import { UserWithoutPassword } from '../models/User';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      email: string;
    };
  }

  interface User extends UserWithoutPassword {}
} 