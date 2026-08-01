import { useState } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/chrome/AppShell.js";
import { randomQuip } from "../lib/quips.js";
import { useDocumentTitle } from "../lib/useDocumentTitle.js";

/**
 * Where every dead control ends up, and where a genuine miss ends up too.
 *
 * The Worker serves this route under the status code it deserves — 503 for the
 * decorative kind, 404 for a real miss — which is why the dead chrome navigates
 * for real rather than routing in the client.
 */
export function OopsPage() {
  // Chosen once per mount rather than per render, so a poll or a resize does
  // not swap the joke out from under whoever is reading it. A refresh still
  // gets you a different one, and the asset stays cacheable either way.
  const [quip] = useState(randomQuip);
  useDocumentTitle("Unicorn · gitdown/gitdown");

  return (
    <AppShell issuesCount="–">
      <main className="oops">
        <Unicorn />
        <p className="quip">{quip}</p>
        <p className="oops-sub">
          Nothing here is real except the outage data. <Link to="/">Back to the issues</Link>.
        </p>
      </main>
    </AppShell>
  );
}

/**
 * An homage to GitHub's unicorn error page, drawn from scratch: original
 * artwork rather than their asset, for the same trademark reason the rest of
 * the site avoids shipping GitHub's marks.
 */
function Unicorn() {
  return (
    <svg
      className="unicorn"
      viewBox="0 0 320 320"
      role="img"
      aria-label="A pink unicorn with a rainbow mane, drawn slightly wrong on purpose"
    >
      <defs>
        <linearGradient id="hornGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#e0a020" />
          <stop offset="100%" stopColor="#ffe27a" />
        </linearGradient>
      </defs>

      <g stroke="#9e1050" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round">
        {/* Mane. Deliberately a bit spiky and uneven, and the horn a bit thin:
            a pixel-perfect unicorn would be off-message on a site whose entire
            premise is that things are broken. Do not tidy this up. */}
        <path d="M168 92 C206 62 250 70 272 96 C244 86 212 92 190 112 Z" fill="#3fbf5f" />
        <path d="M178 104 C218 84 258 100 276 132 C250 112 218 112 196 128 Z" fill="#ffd23d" />
        <path d="M188 124 C228 116 264 138 274 172 C252 146 220 140 200 150 Z" fill="#ff9838" />
        <path d="M196 150 C234 154 262 182 260 214 C246 186 218 172 202 174 Z" fill="#ff6ba9" />
        <path d="M202 178 C232 190 250 218 242 246 C234 220 214 204 200 200 Z" fill="#4fc3f7" />

        {/* ear */}
        <path d="M182 96 C196 74 214 70 222 78 C226 90 214 108 198 114 Z" fill="#f7a8c4" />

        {/* head */}
        <path
          d="M160 88
             C129 107 104 158 84 204
             C73 221 58 228 60 241
             C62 254 75 257 87 263
             C104 281 122 291 142 289
             C168 286 191 272 201 248
             C213 220 215 179 207 147
             C199 115 182 94 160 88 Z"
          fill="#f7a8c4"
        />

        {/* forelock, falling over the brow */}
        <path d="M158 92 C142 112 138 136 146 154 C130 142 126 116 138 96 Z" fill="#3fbf5f" />

        {/* eye: narrowed, thoroughly unimpressed */}
        <path d="M112 178 C126 166 146 168 154 180 C140 178 124 180 112 178 Z" fill="#9e1050" />
        <path d="M116 192 C128 186 142 186 152 192" fill="none" strokeWidth="6" />

        {/* nostril */}
        <path
          d="M80 236 C88 232 95 236 95 243 C95 250 87 253 81 249 C76 245 76 239 80 236 Z"
          fill="#9e1050"
        />

        {/* mouth, with the beginnings of a smirk */}
        <path d="M92 268 C108 278 126 280 140 274" fill="none" strokeWidth="6" />

        {/* horn */}
        <path d="M156 90 L104 12 L176 74 Z" fill="url(#hornGrad)" />
        <path d="M128 46 L150 62 M116 30 L142 48" stroke="#9e1050" strokeWidth="5" />
      </g>
    </svg>
  );
}
