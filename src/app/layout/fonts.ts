import { IBM_Plex_Sans } from "next/font/google";

/**
 * IBM Plex Sans: an engineered, sober grotesque. Squared apertures and a tall
 * x-height give it a technical precision that suits infrastructure and
 * security, with none of the playfulness of a geometric or rounded face.
 * One family carries the whole hierarchy; only the two weights in use are
 * loaded. next/font self-hosts it at build time and generates a size-adjusted
 * fallback, so text never jumps.
 *
 * To try another face, change this one export.
 */
export const fontSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-sans",
  display: "swap",
});
