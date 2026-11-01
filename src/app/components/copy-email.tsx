"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { CheckIcon, CopyIcon } from "./icons";

interface CopyEmailProps {
  email: string;
  labels: { copy: string; copied: string; failed: string };
}

type Status = "idle" | "copied" | "failed";

/**
 * The address is a real mailto link (and plain selectable text), with a copy
 * button for people who read mail somewhere other than a desktop client.
 */
export default function CopyEmail({ email, labels }: CopyEmailProps): JSX.Element {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 4000);
  };

  const message = status === "copied" ? labels.copied : status === "failed" ? labels.failed : "";

  return (
    <div>
      <div className="address-row">
        <a className="address-link" href={`mailto:${email}`}>
          {email}
        </a>
        <button type="button" className="btn-flat" onClick={copy}>
          {status === "copied" ? <CheckIcon /> : <CopyIcon />}
          {labels.copy}
        </button>
      </div>
      <p className="copy-status" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
