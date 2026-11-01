import type { Metadata } from "next";
import { sora } from "./layout/fonts";
import "./globals.css";
import "./styles/components.css";
import "./styles/sections.css";

export const metadata: Metadata = {
  title: "404 | SFB S.R.L.",
};

/**
 * With one root layout per language there is no single layout to build the 404
 * from, so it brings its own <html>. It is bilingual for the same reason.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={sora.variable}>
      <body>
        <main className="hero">
          <div className="container hero-inner">
            <h1 className="h1">
              <span className="claim-lead">Page not found.</span>
              <span className="claim-emphasis">Pagina non trovata.</span>
            </h1>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/">
                Home
              </a>
              <a className="btn" href="/it/">
                Home (italiano)
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
