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
import { Stream } from "$lib/server/database";
import { Op } from "sequelize";
import { EventEmitter } from "node:events";
import type { ClientsideStreamChat } from "$lib/types";

export class StreamingService extends EventEmitter {
    private pollIntervalMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(pollIntervalMs: number = 5 * 60 * 1000) {
        super();
        this.pollIntervalMs = pollIntervalMs;
    }

    notifyChatSent(streamId: string, chat: ClientsideStreamChat) {
        this.emit(STREAM_CHAT_SENT, {
            streamId,
            chat,
        } as StreamChatSentEvent);
    }

    notifyChatDeleted(streamId: string, chatId: string) {
        this.emit(STREAM_CHAT_DELETED, {
            streamId,
            chatId,
        } as StreamChatDeletedEvent);
    }

    endStream(stream: Stream) {
        const oldState = stream.state;
        if (oldState === "finished") return;
    }

    async poll() {
        try {
            const cutoff = new Date(Date.now() - this.pollIntervalMs);
            await Stream.destroy({
                where: {
                    state: "pending",
                    createdAt: { [Op.lt]: cutoff },
                },
            });
        } catch {
            // Swallow errors. This runs in the background and should not crash the process
        }
    }

    start() {
        console.log("Starting streaming service...");
        this.poll();
        this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
        console.log(
            `Streaming service started with a poll interval of ${this.pollIntervalMs} ms`,
        );
    }

    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    stopGracefulShutdown() {
        this.stop();
    }
}

export const streamingService = new StreamingService();

export const STREAM_STATE_CHANGED = "stream:state_changed";
export const STREAM_CHAT_SENT = "stream:chat_sent";
export const STREAM_CHAT_DELETED = "stream:chat_deleted";

export interface StreamEvent {
    streamId: string;
}

export interface StreamStateChangedEvent extends StreamEvent {
    oldState: string;
    newState: string;
}

export interface StreamChatSentEvent extends StreamEvent {
    chat: ClientsideStreamChat;
}

export interface StreamChatDeletedEvent extends StreamEvent {
    chatId: string;
}
