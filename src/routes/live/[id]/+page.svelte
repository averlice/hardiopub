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

    import { onMount } from "svelte";
    import StreamChatList from "$lib/components/stream_chat_list.svelte";
    import SafeMarkdown from "$lib/components/safe_markdown.svelte";
    import { enhance } from "$app/forms";
    import title from "$lib/title";

    onMount(() => title.set(data.stream.title));

    $: isOwnerOrAdmin =
        data.user && (data.user.id === data.stream.user?.id || data.isAdmin);
</script>

<h1>{data.stream.title}</h1>

<div class="stream-player">
    <audio controls id="player" autoplay>
        <source src="https://live.audiopub.site/{data.stream.user?.id}" />
        <p>Your browser doesn't support the audio element.</p>
    </audio>
</div>

<div class="stream-details">
    <div class="stream-stats">
        <span>
            <strong>{data.stream.activeListeners}</strong> listener{data.stream
                .activeListeners === 1
                ? ""
                : "s"}
        </span>
        <span>Peak: {data.stream.peekListeners}</span>
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
        <button class="end-stream-button">End Stream</button>
    {/if}

    {#if data.stream.description}
        <h2>Description:</h2>
        <SafeMarkdown source={data.stream.description} />
    {/if}
</div>

<StreamChatList
    streamId={data.stream.id}
    chats={data.chats}
    user={data.user}
    isAdmin={data.isAdmin}
    onDelete={(chatId) => {
        fetch(`/live/${data.stream.id}/${chatId}`, { method: "DELETE" });
    }}
    streamOwnerId={data.stream.user?.id ?? null}
/>

<style>
    h1 {
        text-align: center;
        margin-bottom: 1rem;
        color: #333;
    }

    .stream-player {
        margin-bottom: 1rem;
    }

    .stream-player audio {
        width: 100%;
        margin-bottom: 0.5rem;
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
