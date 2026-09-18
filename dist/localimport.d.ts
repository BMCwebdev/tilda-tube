import type { Readable } from 'stream';
import { type Video } from './db.js';
/** A problem with what the user sent, as opposed to a server failure. */
export declare class ImportError extends Error {
}
/** Make a name safe to use as a single path component on an exFAT drive. */
export declare function sanitizeName(input: string, fallback: string): string;
/** Top-level library folders (channel folders plus anything else the parent made). */
export declare function listLibraryFolders(): string[];
export interface ImportOptions {
    folder: string;
    filename: string;
    title?: string;
    date?: string;
}
export declare function importLocalFile(stream: Readable, opts: ImportOptions): Promise<Video>;
//# sourceMappingURL=localimport.d.ts.map