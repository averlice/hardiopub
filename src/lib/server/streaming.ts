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
import { Stream, Audio } from "$lib/server/database";
import { Op } from "sequelize";
import { EventEmitter } from "node:events";
import type { ClientsideStreamChat } from "$lib/types";
import { StreamState } from "$lib/types";

export class StreamingService extends EventEmitter {
    private pollIntervalMs: number;
    private icecastHost: string = "";
    private icecastAdminUser: string = "";
    private icecastAdminPassword: string = "";
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

    notifyStateChanged(
        streamId: string,
        oldState: StreamState,
        newState: StreamState,
    ) {
        this.emit(STREAM_STATE_CHANGED, {
            streamId,
            oldState,
            newState,
        } as StreamStateChangedEvent);
    }

    notifyListenersChanged(
        streamId: string,
        activeListeners: number,
        peekListeners: number,
    ) {
        this.emit(STREAM_LISTENERS_CHANGED, {
            streamId,
            activeListeners,
            peekListeners,
        } as StreamListenersChangedEvent);
    }

    notifyDestroyed(
        streamId: string,
        reason: "pending_expired" | "owner_ended",
    ) {
        this.emit(STREAM_DESTROYED, {
            streamId,
            reason,
        } as StreamDestroyedEvent);
    }

    async endStream(streamId: string) {
        const pendingDeleted = await Stream.destroy({
            where: { id: streamId, state: StreamState.pending },
        });
        if (pendingDeleted > 0) {
            this.notifyDestroyed(streamId, "owner_ended");
            return;
        }

        await Stream.update(
            { state: StreamState.finished },
            {
                where: {
                    id: streamId,
                    state: { [Op.ne]: StreamState.finished },
                },
            },
        );

        const updatedStream = await Stream.findByPk(streamId);
        if (!updatedStream) return; // Already finished

        this.notifyStateChanged(
            updatedStream.id,
            updatedStream.state,
            StreamState.finished,
        );

        if (updatedStream.shouldArchive && updatedStream.format) {
            const audio = await Audio.create({
                id: updatedStream.id,
                title: updatedStream.title,
                description: updatedStream.description,
                extension: updatedStream.format,
                hasFile: false,
                isFromAi: false,
                userId: updatedStream.userId,
                plays: updatedStream.peekListeners,
                archivedStreamId: updatedStream.id,
            });

            this.emit(STREAM_ARCHIVED, {
                streamId: updatedStream.id,
                audioId: audio.id,
            } as StreamArchivedEvent);
        } else {
            await updatedStream.destroy();
        }
    }

    async poll() {
        try {
            const cutoff = new Date(Date.now() - this.pollIntervalMs);

            const expiredPending = await Stream.findAll({
                where: {
                    state: StreamState.pending,
                    createdAt: { [Op.lt]: cutoff },
                },
            });
            for (const stream of expiredPending) {
                await stream.destroy();
                this.notifyDestroyed(stream.id, "pending_expired");
            }

            const expiredDisconnected = await Stream.findAll({
                where: {
                    state: StreamState.disconnected,
                    disconnectedAt: { [Op.ne]: null, [Op.lt]: cutoff },
                },
            });
            for (const stream of expiredDisconnected) {
                await this.endStream(stream.id);
            }
        } catch {
            // Swallow errors. This runs in the background and should not crash the process
        }
    }

    async sourceConnected(streamId: string) {
        const stream = await Stream.findByPk(streamId);
        if (!stream) return;

        const oldState = stream.state;
        const isPendingOrDisconnected =
            oldState === StreamState.pending ||
            oldState === StreamState.disconnected;
        if (!isPendingOrDisconnected) return;

        const [updated] = await Stream.update(
            { state: StreamState.active },
            {
                where: { id: streamId, state: oldState },
            },
        );

        if (updated) {
            this.notifyStateChanged(streamId, oldState, StreamState.active);
        }
    }

    async sourceDisconnected(streamId: string) {
        const stream = await Stream.findByPk(streamId);
        if (!stream) return;

        const oldState = stream.state;
        if (oldState !== StreamState.active) return;

        const [updated] = await Stream.update(
            { state: StreamState.disconnected, disconnectedAt: new Date() },
            {
                where: { id: streamId, state: StreamState.active },
            },
        );

        if (updated) {
            this.notifyStateChanged(
                streamId,
                oldState,
                StreamState.disconnected,
            );
        }
    }

    async listenerConnected(streamId: string) {
        await Stream.update(
            {
                activeListeners: Stream.sequelize!.literal(
                    "activeListeners + 1",
                ),
                peekListeners: Stream.sequelize!.literal(
                    "GREATEST(peekListeners, activeListeners + 1)",
                ),
            },
            { where: { id: streamId } },
        );

        const updated = await Stream.findByPk(streamId, {
            attributes: ["activeListeners", "peekListeners"],
        });
        if (!updated) return;

        this.notifyListenersChanged(
            streamId,
            updated.activeListeners,
            updated.peekListeners,
        );
    }

    async listenerDisconnected(streamId: string) {
        const [updated] = await Stream.update(
            {
                activeListeners: Stream.sequelize!.literal(
                    "activeListeners - 1",
                ),
            },
            {
                where: { id: streamId, activeListeners: { [Op.gt]: 0 } },
            },
        );

        if (updated) {
            const updatedStream = await Stream.findByPk(streamId, {
                attributes: ["activeListeners", "peekListeners"],
            });
            if (updatedStream) {
                this.notifyListenersChanged(
                    streamId,
                    updatedStream.activeListeners,
                    updatedStream.peekListeners,
                );
            }
        }
    }

    async disconnectSource(userId: string) {
        const url = `http://${this.icecastHost}/admin/killsource?mount=/${userId}`;
        const auth = Buffer.from(
            `${this.icecastAdminUser}:${this.icecastAdminPassword}`,
        ).toString("base64");

        await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });
    }

    private async fetchMounts(): Promise<string[]> {
        if (!this.icecastHost) return [];

        const url = `http://${this.icecastHost}/admin/listmounts`;
        const auth = Buffer.from(
            `${this.icecastAdminUser}:${this.icecastAdminPassword}`,
        ).toString("base64");

        try {
            const res = await fetch(url, {
                headers: { Authorization: `Basic ${auth}` },
            });
            const text = await res.text();

            const mounts: string[] = [];
            const matches = text.matchAll(/<source mount="([^"]+)"/g);
            for (const match of matches) {
                // Strip leading slash to get userId
                mounts.push(
                    match[1].startsWith("/") ? match[1].slice(1) : match[1],
                );
            }
            return mounts;
        } catch {
            return [];
        }
    }

    async syncStreams() {
        const mounts = await this.fetchMounts();
        const mountSet = new Set(mounts);

        // Find active streams whose user has no mount → mark disconnected
        const activeStreams = await Stream.findAll({
            where: { state: StreamState.active },
        });
        for (const stream of activeStreams) {
            if (!mountSet.has(stream.userId)) {
                await this.sourceDisconnected(stream.id);
            }
        }

        // Find pending/disconnected streams whose user has a mount → mark active
        const inactiveStreams = await Stream.findAll({
            where: {
                state: {
                    [Op.in]: [StreamState.pending, StreamState.disconnected],
                },
            },
        });
        for (const stream of inactiveStreams) {
            if (mountSet.has(stream.userId)) {
                await this.sourceConnected(stream.id);
            }
        }
    }

    start(icecast: { host: string; adminUser: string; adminPassword: string }) {
        icecast.host = this.icecastHost;
        icecast.adminUser = this.icecastAdminUser;
        icecast.adminPassword = this.icecastAdminPassword;
        console.log("Starting streaming service...");
        this.syncStreams();
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
export const STREAM_ARCHIVED = "stream:archived";
export const STREAM_DESTROYED = "stream:destroyed";
export const STREAM_LISTENERS_CHANGED = "stream:listeners_changed";

export interface StreamEvent {
    streamId: string;
}

export interface StreamStateChangedEvent extends StreamEvent {
    oldState: StreamState;
    newState: StreamState;
}

export interface StreamChatSentEvent extends StreamEvent {
    chat: ClientsideStreamChat;
}

export interface StreamChatDeletedEvent extends StreamEvent {
    chatId: string;
}

export interface StreamListenersChangedEvent extends StreamEvent {
    activeListeners: number;
    peekListeners: number;
}

export interface StreamArchivedEvent extends StreamEvent {
    audioId: string;
}

export interface StreamDestroyedEvent extends StreamEvent {
    reason: "pending_expired" | "owner_ended";
}
