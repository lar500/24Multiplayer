import 'next-auth';
import { UserWithoutPassword } from '../models/User';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }

  interface User extends UserWithoutPassword {
    id: string;
    name: string;
    email: string;
  }
} 