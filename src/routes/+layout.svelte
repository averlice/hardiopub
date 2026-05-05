<!--
  This file is part of the audiopub project.
  
  Copyright (C) 2025 the-byte-bender
  
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
    import { enhance } from "$app/forms";
    import title from "$lib/title";
    import { onDestroy, onMount } from "svelte";
    import { browser } from "$app/environment";
    import OneSignal from "react-onesignal";
    import type { LayoutData } from "./$types";
    import { PUBLIC_ONE_SIGNAL_APP_ID } from "$env/static/public";

    export let data: LayoutData;

    let unreadCount = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 60000;
    const maxBackoff = 5 * 60_000;
    const minBackoff = 30_000;
    let inFlight = false;
    let lastFetchTs = 0;
    const MIN_IMMEDIATE_INTERVAL = 20000;
    let onesignalReady = false;

    async function refreshUnread() {
        if (!data.user) return;
        if (document.visibilityState === "hidden") return;
        if (inFlight) return;

        try {
            inFlight = true;
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch("/notifications", {
                signal: ctrl.signal,
                headers: { "cache-control": "no-cache" },
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(String(res.status));
            const body = await res.json();
            unreadCount = Number(body?.unread ?? 0) || 0;

            // Reset backoff on success
            backoffMs = 60000;
        } catch (e) {
            backoffMs = Math.min(
                Math.max(backoffMs * 2, minBackoff),
                maxBackoff,
            );
        } finally {
            lastFetchTs = Date.now();
            inFlight = false;
        }
    }

    function scheduleNext() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            await refreshUnread();
            scheduleNext();
        }, backoffMs);
    }

    function kickImmediate() {
        const now = Date.now();
        if (inFlight) return;
        if (now - lastFetchTs < MIN_IMMEDIATE_INTERVAL) return;
        refreshUnread();
    }

    onMount(() => {
        refreshUnread().finally(scheduleNext);
        const onVis = () =>
            document.visibilityState === "visible" && kickImmediate();
        const onFocus = () => kickImmediate();
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("focus", onFocus);
        OneSignal.init({
            appId: PUBLIC_ONE_SIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
        }).then(() => {
            onesignalReady = true;
        });
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("focus", onFocus);
        };
    });

    async function loginOnesignal() {
        const res = await fetch("/user/notification-key");
        if (!res.ok) return;
        const { notificationKey } = await res.json();
        if (notificationKey) {
            await OneSignal.login(notificationKey);
        }
        if (OneSignal.Notifications.permissionNative === "default")
            OneSignal.Notifications.requestPermission();
    }

    $: if (browser && onesignalReady && data.user !== undefined) {
        if (data.user) {
            loginOnesignal();
        } else {
            OneSignal.logout();
        }
    }

    onDestroy(() => {
        if (timer) clearTimeout(timer);
    });
</script>

<svelte:head>
    <title
        >{unreadCount > 0 ? `(${unreadCount}) ` : ""}{$title} | audiopub</title
    >
</svelte:head>

<header>
    <nav>
        <a href="/">Home</a>
        <a href="/quickfeed">Quickfeed</a>
        {#if data.user}
            {#if !data.user.isVerified}
                <p>
                    <b>WARNING:</b> Your account is not verified. Please verify your
                    account to access all features.
                </p>
                <a href="/verify">Verify</a>
            {:else}
                <a href="/notifications" class="notifications-link">
                    Notifications
                    {#if unreadCount > 0}
                        <span
                            class="badge"
                            aria-label={`${unreadCount} unread notifications`}
                            >{unreadCount}</span
                        >
                    {/if}
                </a>
                <a href="/favorites">Favorites</a>
                <a href="/profile">Profile</a>
                <a href="/logout">Logout</a>
            {/if}
        {:else}
            <a href="/login">Login</a>
            <a href="/register">Register</a>
        {/if}

        {#if data.user && data.user.isVerified}
            <div class="action-buttons">
                <a href="/upload" class="btn-action">Upload</a>
                <a href="/live/new" class="btn-action btn-live">Go Live</a>
            </div>
        {/if}
    </nav>
    <form action="/search" method="get">
        <input type="text" name="q" placeholder="Search..." />
        <button type="submit">Search</button>
    </form>
</header>
<main>
    <slot />
</main>

<hr />
<footer>
    <div class="copyright">
        <p>
            All rights to the audio files and associated content uploaded to
            this platform remain with their respective creators or rightful
            owners.
        </p>
        <p>
            For inquiries regarding content ownership or usage, please contact:
            <a href="mailto:cccefg2@gmail.com"> cccefg2@gmail.com</a>
            I'm sorry for the unprofessional email address, I'm still working on
            it.
        </p>
        <a href="/agreement">Our Agreement</a>
        <p>
            Audiopub is open source software. The code is licensed under the GNU
            AFFERO GENERAL PUBLIC LICENSE. You can find the source code on
            <a href="https://github.com/the-byte-bender/audiopub-sv">GitHub</a>.
        </p>
    </div>
</footer>

<style>
    header {
        background-color: #f0f0f0;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    nav a {
        margin-right: 10px;
        text-decoration: none;
        color: #333;
    }

    nav a:hover {
        color: #000;
    }

    .notifications-link {
        font-weight: 600;
        position: relative;
    }
    .badge {
        margin-left: 0.4rem;
        background: #d00;
        color: #fff;
        border-radius: 999px;
        padding: 0 0.45rem;
        font-size: 0.8rem;
        line-height: 1.2rem;
        display: inline-block;
        min-width: 1.2rem;
        text-align: center;
    }

    .action-buttons {
        display: flex;
        gap: 0.5rem;
        margin-left: 1rem;
        padding-left: 1rem;
        border-left: 2px solid #ccc;
    }

    .btn-action {
        padding: 0.4rem 0.8rem;
        background-color: #333;
        color: #fff !important;
        text-decoration: none;
        border-radius: 4px;
        font-weight: 500;
    }

    .btn-action:hover {
        background-color: #555;
    }

    .btn-live {
        background-color: #d9534f;
    }

    .btn-live:hover {
        background-color: #c9302c;
    }

    main {
        padding: 20px;
        /* Account for sticky header - approximate height is 80px (40px padding + ~40px content) */
        padding-top: calc(20px + 80px);
    }

    footer {
        background-color: #eee;
        padding: 20px;
        text-align: center;
    }
</style>
