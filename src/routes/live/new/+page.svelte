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
    import { enhance } from "$app/forms";
    import title from "$lib/title";
    import { onMount } from "svelte";
    onMount(() => title.set("Go Live"));

    let submitting = false;
</script>

<h1>Go Live</h1>

<p class="info">
    Streams are supported in <strong>MP3</strong> and <strong>AAC</strong>
    formats only.
</p>

<form
    use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
            await update();
            submitting = false;
        };
    }}
    method="POST"
>
    <div class="form-group">
        <label for="title">Title:</label>
        <input
            type="text"
            id="title"
            name="title"
            required
            autofocus
            minlength="1"
            maxlength="200"
            class="form-control"
        />
    </div>

    <div class="form-group">
        <label for="description">Description:</label>
        <textarea
            id="description"
            name="description"
            maxlength="2000"
            class="form-control"
        ></textarea>
    </div>

    <div class="warning-box">
        <p>
            As the stream owner, you have access to moderation tools for this
            stream. While platform staff may independently moderate, they are
            not always available for a live stream. As such, you are expected to
            take responsibility for keeping your live chat in good taste and
            within the law. Please moderate your chat accordingly. Your help in
            keeping the platform a decent place is appreciated.
        </p>
        <p>Note: Archiving will not work for very long streams.</p>
    </div>

    <div class="form-group">
        <label for="shouldArchive">
            <input type="checkbox" id="shouldArchive" name="shouldArchive" />
            Archive this stream when finished
        </label>
    </div>

    <button type="submit" disabled={submitting}>
        {submitting ? "Creating..." : "Create Stream"}
    </button>
</form>

<style>
    .info {
        margin-bottom: 1rem;
        color: #666;
    }

    .warning-box {
        background-color: #fef3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        padding: 1rem;
        margin-bottom: 1rem;
    }

    .warning-box p {
        margin: 0;
        font-size: 0.9rem;
    }

    .form-group {
        margin-bottom: 1rem;
    }

    label {
        display: block;
        margin-bottom: 0.25rem;
        font-weight: 500;
    }

    .form-control {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1rem;
    }

    textarea.form-control {
        min-height: 100px;
        resize: vertical;
    }

    button {
        padding: 0.75rem 1.5rem;
        background-color: #d9534f;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
    }

    button:hover:not(:disabled) {
        background-color: #c9302c;
    }

    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
</style>
