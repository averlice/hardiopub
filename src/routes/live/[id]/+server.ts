/*
 * This file is part of the audiopub project.
 *
 * Copyright (C) 2026 the-byte-bender
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
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Stream, StreamChat, User } from "$lib/server/database";
import { streamingService } from "$lib/server/streaming";

export const DELETE: RequestHandler = async (event) => {
    if (!event.locals.user) {
        throw error(401, "You must be logged in");
    }

    const stream = await Stream.findByPk(event.params.id);
    if (!stream) {
        throw error(404, "Stream not found");
    }

    if (stream.userId !== event.locals.user.id && !event.locals.user.isAdmin) {
        throw error(403, "Not authorized");
    }

    if (stream.state === "finished") {
        throw error(400, "Stream already ended");
    }

    await streamingService.endStream(stream.id);
    return json({ success: true });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) {
        throw error(401, "You must be logged in to send messages");
    }

    if (event.locals.user.isBanned) {
        throw error(403, "You are banned");
    }

    if (!event.locals.user.isVerified) {
        throw error(403, "Please verify your email before sending messages");
    }

    const stream = await Stream.findByPk(event.params.id);
    if (!stream) {
        throw error(404, "Stream not found");
    }

    if (stream.state === "finished") {
        throw error(400, "Stream has ended");
    }

    const body = await event.request.json();
    if (!body.content || typeof body.content !== "string") {
        throw error(400, "Message content required");
    }

    const content = body.content.trim();
    if (!content || content.length > 2000) {
        throw error(400, "Invalid message content");
    }

    const chat = await StreamChat.create({
        streamId: stream.id,
        userId: event.locals.user.id,
        content,
    });

    const chatWithUser = await StreamChat.findByPk(chat.id, {
        include: User,
    });

    const clientsideChat = chatWithUser!.toClientside();
    streamingService.notifyChatSent(stream.id, clientsideChat);

    return json(clientsideChat);
};
