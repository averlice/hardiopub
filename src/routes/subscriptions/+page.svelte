<script lang="ts">
    import AudioList from "$lib/components/audio_list.svelte";
    import StreamCard from "$lib/components/stream_card.svelte";
    import title from "$lib/title";
    import type { PageProps } from "./$types";
    title.set("Subscriptions")

    let { data }: PageProps = $props();
</script>

<h1>Subscriptions</h1>

{#if data.streams && data.streams.length > 0}
        <h2 id="streams-heading">Currently live</h2>
        {#each data.streams as stream (stream.id)}
            <StreamCard {stream} />
        {/each}
{/if}

{#if data.audios.length > 0}
<AudioList
    audios={data.audios}
    page={data.page}
    totalPages={data.totalPages}
    currentUser={data.user}
    paginationBaseUrl="/subscriptions"
/>
{:else if data.streams.length > 0}
Nothing to show yet
{/if}
