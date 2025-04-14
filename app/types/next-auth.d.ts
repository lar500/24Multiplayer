import 'next-auth';
import { UserWithoutPassword } from '../models/User';
import NextAuth from "next-auth";

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }

  interface User extends UserWithoutPassword {}
} 