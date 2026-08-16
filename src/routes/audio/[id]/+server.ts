/*
 * This file is part of the audiopub project.
 *
 * Copyright (C) 2024 the-byte-bender
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import fs from "fs/promises";
import { dev } from "$app/environment";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";

// WARNING! WARNING! WARNING!
// This endpoint should never ever ever ever ever be modified to let it be used in production.
// Not in a million years. Not if you're the last developer on Earth. Not even if aliens threaten to destroy the planet unless you do.
// Instead, PLEASE just configure your reverse proxy to host your audio directory under /audio.
// This endpoint exists SOLELY for local dev runs where a reverse proxy is not practical.
// If you modify this to make it run in production instead of a reverse proxy, you're practically begging for a disaster.
// The ghost of Alan Turing will haunt your dreams, whispering "Why? Why did you do this?" for all eternity.
// So please, I'm begging you, with tears in my eyes and trembling fingers on the keyboard: DO NOT USE THIS IN PRODUCTION.
export const GET: RequestHandler = async (event) => {
  let id = event.params.id;
  // serve ./audio/{id} or ./audio/{id}.aac if exists.
  // NOTE: upstream ships this route dev-only and warns against prod use,
  // expecting a reverse proxy to host /audio. This hardened fork has no
  // reverse proxy (Cloudflare Tunnel -> node directly), so we serve here in
  // prod too. The id is validated to prevent path traversal.
  if (id.startsWith(".") || id.includes("/")) {
    return error(400, "Invalid id");
  }
  // Try the source file first, then the .aac transcoded version.
  const candidates = [`./audio/${id}`, `./audio/${id}.aac`];
  for (const path of candidates) {
    try {
      const file = await fs.readFile(path);
      const isAac = path.endsWith(".aac");
      return new Response(file, {
        headers: {
          "Content-Type": isAac ? "audio/aac" : "audio/wav",
          "Content-Length": file.byteLength.toString(),
          "Accept-Ranges": "bytes",
        },
      });
    } catch (e) {
      // try next candidate
    }
  }
  return error(404, "Not found");
};
