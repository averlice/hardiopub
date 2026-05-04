<!--
  This file is part of the audiopub project.

  Copyright (C) 2026 the-byte-bender

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.
-->
<script lang="ts">
    export let data;

    import { onMount, tick } from "svelte";
    import StreamChatList from "$lib/components/stream_chat_list.svelte";
    import ChatReader from "$lib/components/chat_reader.svelte";
    import type { ClientsideStreamChat } from "$lib/types";
    import SafeMarkdown from "$lib/components/safe_markdown.svelte";
    import { fade, slide } from "svelte/transition";
    import { enhance } from "$app/forms";
    import title from "$lib/title";

    onMount(() => title.set(data.stream.title));

    $: isOwnerOrAdmin =
        data.user && (data.user.id === data.stream.user?.id || data.isAdmin);

    let audioEl: HTMLAudioElement;
    let streamEnded = false;
    let isPlaying = false;
    interface IcecastPlayer {
        play(): void;
        stop(): void;
        detachAudioElement(): void;
    }

    let player: IcecastPlayer | null = null;

    let activeListeners = data.stream.activeListeners;
    let peekListeners = data.stream.peekListeners;

    let chats = (data.chats ?? []) as ClientsideStreamChat[];
    let latestChat: ClientsideStreamChat | null = null;
    let eventSource: EventSource | null = null;

    function connectSSE() {
        eventSource = new EventSource(`/live/${data.stream.id}/events`);

        eventSource.addEventListener("listeners", (e) => {
            const d = JSON.parse(e.data);
            activeListeners = d.activeListeners;
            peekListeners = d.peekListeners;
        });

        eventSource.addEventListener("state", (e) => {
            const d = JSON.parse(e.data);
            if (d.state === "finished") {
                streamEnded = true;
                player?.stop();
                eventSource?.close();
            }
        });

        eventSource.addEventListener("archived", () => {
            streamEnded = true;
            player?.stop();
            eventSource?.close();
            window.location.href = `/listen/${data.stream.id}`;
        });

        eventSource.addEventListener("chat", (e) => {
            const chat = JSON.parse(e.data) as ClientsideStreamChat;
            chats = [...chats.filter((c) => c.id !== chat.id), chat];
            handleNewChat(chat);
        });

        eventSource.addEventListener("chat_delete", (e) => {
            const { chatId } = JSON.parse(e.data);
            chats = chats.filter((c) => c.id !== chatId);
        });

        eventSource.onerror = () => {
            if (eventSource?.readyState === EventSource.CLOSED) {
                streamEnded = true;
                player?.stop();
                eventSource = null;
            }
            // Otherwise EventSource is retrying automatically
        };
    }

    function handleEndStream() {
        fetch(`/live/${data.stream.id}`, { method: "DELETE" });
    }

    function handleSendMessage(content: string) {
        fetch(`/live/${data.stream.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });
    }

    function handleDeleteChat(chatId: string) {
        fetch(`/live/${data.stream.id}/${chatId}`, { method: "DELETE" });
    }

    function handleNewChat(chat: ClientsideStreamChat) {
        latestChat = chat;
    }

    async function handlePlay() {
        isPlaying = true;
        await tick();
        const IcecastMetadataPlayer = (await import("icecast-metadata-player"))
            .default;
        player = new IcecastMetadataPlayer(
            `https://live.audiopub.site/${data.stream.user?.id}`,
            {
                audioElement: audioEl,
                metadataTypes: [],
                onRetryTimeout: () => {
                    streamEnded = true;
                    player?.stop();
                },
            },
        );
        player.play();
    }

    onMount(() => {
        connectSSE();
        return () => {
            player?.stop();
            player?.detachAudioElement();
            eventSource?.close();
        };
    });
</script>

<h1>{data.stream.title}</h1>

<div class="stream-player">
    {#if streamEnded}
        <p class="stream-ended">
            Stream has ended or is temporarily unavailable.
        </p>
    {:else if !isPlaying}
        <button
            class="play-button"
            on:click={handlePlay}
            transition:fade={{ duration: 200 }}
        >
            Play
        </button>
    {:else}
        <div transition:slide={{ duration: 300 }}>
            <audio controls id="player" bind:this={audioEl}>
                <p>Your browser doesn't support the audio element.</p>
            </audio>
        </div>
    {/if}
</div>

<div class="stream-details">
    <div class="stream-stats">
        <span>
            <strong>{activeListeners}</strong> listener{activeListeners === 1
                ? ""
                : "s"}
        </span>
        <span>Peak: {peekListeners}</span>
    </div>

    {#if data.stream.user}
        <p>
            Streaming by: <a href="/user/{data.stream.user.id}"
                >{data.stream.user.displayName}</a
            >
        </p>
    {/if}

    <p>Started: {new Date(data.stream.createdAt).toLocaleString()}</p>

    {#if isOwnerOrAdmin}
        <button class="end-stream-button" on:click={handleEndStream}>
            End Stream
        </button>
    {/if}

    {#if data.stream.description}
        <h2>Description:</h2>
        <SafeMarkdown source={data.stream.description} />
    {/if}
</div>

<StreamChatList
    streamId={data.stream.id}
    {chats}
    user={data.user}
    isAdmin={data.isAdmin}
    onDelete={handleDeleteChat}
    streamOwnerId={data.stream.user?.id ?? null}
    onSendMessage={handleSendMessage}
/>

<ChatReader chat={latestChat} />

<style>
    h1 {
        text-align: center;
        margin-bottom: 1rem;
        color: #333;
    }

    .stream-player {
        margin-bottom: 1rem;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .play-button {
        padding: 1rem 2rem;
        font-size: 1.25rem;
        border: none;
        border-radius: 8px;
        background-color: #007bff;
        color: white;
        cursor: pointer;
        transition:
            background-color 0.3s ease,
            transform 0.2s ease;
    }

    .play-button:hover {
        background-color: #0056b3;
        transform: scale(1.05);
    }

    .stream-player audio {
        width: 100%;
        margin-bottom: 0.5rem;
    }

    .stream-ended {
        padding: 1rem;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        color: #721c24;
        text-align: center;
    }

    .stream-details {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 1rem;
        background-color: #f9f9f9;
        margin-bottom: 1rem;
    }

    .stream-stats {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 12px;
    }

    .stream-stats span {
        font-weight: 500;
        color: #666;
    }

    .stream-details a {
        color: #007bff;
        text-decoration: none;
    }

    .stream-details a:hover {
        text-decoration: underline;
    }

    .stream-details h2 {
        margin-top: 1rem;
        color: #333;
    }

    .stream-details p {
        margin: 0.25rem 0;
        color: #555;
    }

    .end-stream-button {
        margin-top: 0.75rem;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        background-color: #dc3545;
        color: white;
        cursor: pointer;
        transition: background-color 0.3s ease;
    }

    .end-stream-button:hover {
        background-color: #a71d2a;
    }
</style>
