// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { type NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt: ({ token }) => {
      return token;
    },
    session: ({ session, token }) => {
      return {
        ...session,
        user: {
          id: token.sub || "guest",
          name: "Guest User",
          email: "guest@example.com",
        },
      };
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };