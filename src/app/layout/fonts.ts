import { Sora } from "next/font/google";

/**
 * Sora: wide, geometric, smooth-curved. It echoes the extended, speed-cut
 * lettering of the SFB mark and the liquid scene, and reads well at body size.
 * One variable family carries the whole hierarchy. next/font self-hosts it at
 * build time and generates a size-adjusted fallback, so text never jumps.
 */
export const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});
