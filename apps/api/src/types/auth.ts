import { User, Session } from "better-auth/types";

export interface AuthContext {
  user: User | null;
  session: Session | null;
  userId: string | null;
}

export type HonoAuthVariables = {
  user: User | null;
  session: Session | null;
  userId: string | null;
};

export type HonoAuthContext = {
  Variables: HonoAuthVariables;
};
