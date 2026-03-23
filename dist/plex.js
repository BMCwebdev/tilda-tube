/**
 * Plex API integration for tagging videos with collections.
 *
 * After a video is downloaded, we:
 * 1. Trigger a partial Plex library scan for the video's folder
 * 2. Wait for Plex to index the file
 * 3. Find the item by its file path
 * 4. Add the collection tag (channel name)
 *
 * Requires PLEX_TOKEN env var. PLEX_URL defaults to http://localhost:32400.
 */
const PLEX_URL = (process.env.PLEX_URL || 'http://localhost:32400').replace(/\/$/, '');
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';
// Cache the library section ID so we only look it up once
let cachedSectionId = null;
function plexHeaders() {
    return {
        'X-Plex-Token': PLEX_TOKEN,
        'Accept': 'application/json',
    };
}
async function plexFetch(path, options) {
    const url = `${PLEX_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: { ...plexHeaders(), ...options?.headers },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Plex API ${res.status}: ${text.slice(0, 200)}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) {
        return res.json();
    }
    return null;
}
/**
 * Find the library section ID for the movie library that contains our media.
 */
async function getSectionId() {
    if (cachedSectionId)
        return cachedSectionId;
    const data = await plexFetch('/library/sections');
    const sections = data?.MediaContainer?.Directory || [];
    // Look for a movie library (type "movie")
    // Prefer one whose path matches our MEDIA_DIR
    const MEDIA_DIR = process.env.MEDIA_DIR || '/Volumes/TildaTube/media';
    for (const section of sections) {
        if (section.type === 'movie') {
            const locations = section.Location || [];
            for (const loc of locations) {
                if (loc.path && MEDIA_DIR.startsWith(loc.path)) {
                    cachedSectionId = String(section.key);
                    console.log(`[Plex] Found library section: "${section.title}" (id=${cachedSectionId})`);
                    return cachedSectionId;
                }
            }
        }
    }
    // Fallback: use the first movie library
    const movieSection = sections.find((s) => s.type === 'movie');
    if (movieSection) {
        cachedSectionId = String(movieSection.key);
        console.log(`[Plex] Using first movie library: "${movieSection.title}" (id=${cachedSectionId})`);
        return cachedSectionId;
    }
    throw new Error('No movie library found in Plex');
}
/**
 * Trigger a partial scan of a specific folder in the library.
 */
async function scanFolder(folderPath) {
    const sectionId = await getSectionId();
    const encodedPath = encodeURIComponent(folderPath);
    await plexFetch(`/library/sections/${sectionId}/refresh?path=${encodedPath}`, {
        method: 'GET',
    });
    console.log(`[Plex] Triggered scan for: ${folderPath}`);
}
/**
 * Search for a recently added item by its file path.
 * Retries a few times since Plex needs time to index after a scan.
 */
async function findItemByPath(filePath, maxRetries = 8) {
    const sectionId = await getSectionId();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait before checking (longer waits for later attempts)
        const delay = attempt <= 2 ? 3000 : 5000;
        await new Promise((r) => setTimeout(r, delay));
        // Search recently added items
        const data = await plexFetch(`/library/sections/${sectionId}/all?sort=addedAt:desc&limit=50`);
        const items = data?.MediaContainer?.Metadata || [];
        for (const item of items) {
            const media = item.Media || [];
            for (const m of media) {
                const parts = m.Part || [];
                for (const part of parts) {
                    if (part.file === filePath) {
                        return String(item.ratingKey);
                    }
                }
            }
        }
        if (attempt < maxRetries) {
            console.log(`[Plex] Item not found yet (attempt ${attempt}/${maxRetries}), waiting...`);
        }
    }
    return null;
}
/**
 * Add a collection tag to a Plex item.
 */
async function tagCollection(ratingKey, collectionName) {
    const encodedCollection = encodeURIComponent(collectionName);
    await plexFetch(`/library/metadata/${ratingKey}?collection%5B0%5D.tag.tag=${encodedCollection}`, { method: 'PUT' });
}
/**
 * Main entry point: after downloading a video, add it to a Plex collection.
 * Triggers a scan, waits for indexing, then tags the item.
 */
export async function addToPlexCollection(filePath, collectionName) {
    if (!PLEX_TOKEN) {
        console.log('[Plex] No PLEX_TOKEN set, skipping collection tagging');
        return;
    }
    try {
        // Trigger a scan of the folder containing the video
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        await scanFolder(folderPath);
        // Wait for Plex to index the file, then find it
        const ratingKey = await findItemByPath(filePath);
        if (!ratingKey) {
            console.warn(`[Plex] Could not find "${filePath}" in Plex after scanning`);
            return;
        }
        // Tag with collection
        await tagCollection(ratingKey, collectionName);
        console.log(`[Plex] Tagged "${collectionName}" collection for ratingKey=${ratingKey}`);
    }
    catch (err) {
        console.error(`[Plex] Failed to tag collection "${collectionName}":`, err);
    }
}
/**
 * Backfill: tag all downloaded videos that aren't already in a collection.
 * Useful for tagging videos downloaded before Plex API integration was added.
 */
export async function backfillPlexCollections(videos) {
    if (!PLEX_TOKEN) {
        console.log('[Plex] No PLEX_TOKEN set, skipping collection backfill');
        return;
    }
    const sectionId = await getSectionId();
    let tagged = 0;
    let skipped = 0;
    for (const video of videos) {
        if (!video.file_path || !video.channel_name) {
            skipped++;
            continue;
        }
        // Determine collection name based on path
        const isShort = video.file_path.includes('/Shorts/');
        const collectionName = isShort ? `Shorts - ${video.channel_name}` : video.channel_name;
        // Search for the item in Plex
        const data = await plexFetch(`/library/sections/${sectionId}/all?sort=addedAt:desc&limit=500`);
        const items = data?.MediaContainer?.Metadata || [];
        let ratingKey = null;
        for (const item of items) {
            const media = item.Media || [];
            for (const m of media) {
                const parts = m.Part || [];
                for (const part of parts) {
                    if (part.file === video.file_path) {
                        // Check if already in the right collection
                        const collections = item.Collection || [];
                        const alreadyTagged = collections.some((c) => c.tag === collectionName);
                        if (alreadyTagged) {
                            skipped++;
                            ratingKey = null; // skip tagging
                        }
                        else {
                            ratingKey = String(item.ratingKey);
                        }
                    }
                }
            }
        }
        if (ratingKey) {
            try {
                await tagCollection(ratingKey, collectionName);
                tagged++;
                console.log(`[Plex] Backfill: tagged "${collectionName}" for ratingKey=${ratingKey}`);
            }
            catch (err) {
                console.error(`[Plex] Backfill: failed to tag ratingKey=${ratingKey}:`, err);
            }
        }
    }
    if (tagged > 0) {
        console.log(`[Plex] Backfill complete: ${tagged} tagged, ${skipped} skipped`);
    }
    else {
        console.log(`[Plex] Backfill: all ${skipped} videos already tagged or skipped`);
    }
}
//# sourceMappingURL=plex.js.map