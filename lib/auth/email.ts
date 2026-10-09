import { z } from "zod";

// One canonical representation for registration, verification and login.
export const emailSchema = z.string().trim().max(254).email("Enter a valid email address.").transform(value => value.toLowerCase());
export const emailCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit email code.");
