/* ============================================================================
   FILE: lib/extraction/images.ts
   ============================================================================
   
   PPTX Image Extraction
   
   Extracts diagram images from PPTX files by unzipping them and reading
   the ppt/media/ directory. Filters out small icons and bullets.
   
   Dependencies: jszip
   
============================================================================ */

import JSZip from 'jszip';

// ============================================================================
// Constants
// ============================================================================

/** Minimum image size to keep (bytes). Smaller images are likely icons/bullets */
const MIN_IMAGE_SIZE_BYTES = 5 * 1024; // 5 KB

/** Maximum image size to process (bytes). Skip extremely large embedded videos */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Supported image MIME types */
const IMAGE_MIME_MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.webp': 'image/webp',
    '.emf': 'image/x-emf',
    '.wmf': 'image/x-wmf',
};

// ============================================================================
// Types
// ============================================================================

export interface ExtractedImage {
    /** Original filename inside the PPTX (e.g., "image1.png") */
    filename: string;
    /** Raw image data as a Buffer */
    buffer: Buffer;
    /** MIME type of the image */
    mimeType: string;
    /** File size in bytes */
    sizeBytes: number;
    /** Index (0-based) among extracted images */
    index: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract images from a PPTX file buffer
 * 
 * PPTX files are ZIP archives. Images live in ppt/media/.
 * We filter out small images (likely icons/bullets) and unsupported formats.
 * 
 * @param pptxBuffer - Raw PPTX file as a Buffer
 * @returns Array of extracted images, sorted by filename
 */
export async function extractPPTXImages(pptxBuffer: Buffer): Promise<ExtractedImage[]> {
    console.log(`[Images] Extracting images from PPTX (${(pptxBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const zip = await JSZip.loadAsync(pptxBuffer);
    const images: ExtractedImage[] = [];
    let skippedSmall = 0;
    let skippedLarge = 0;
    let skippedUnsupported = 0;

    // Iterate over all files in the ZIP
    const mediaFiles = Object.keys(zip.files)
        .filter(path => path.startsWith('ppt/media/'))
        .sort(); // Sort by filename for consistent ordering

    console.log(`[Images] Found ${mediaFiles.length} files in ppt/media/`);

    let imageIndex = 0;

    for (const filePath of mediaFiles) {
        const zipEntry = zip.files[filePath];

        // Skip directories
        if (zipEntry.dir) continue;

        // Get file extension
        const filename = filePath.split('/').pop() || filePath;
        const ext = '.' + filename.split('.').pop()?.toLowerCase();

        // Check if supported image format
        const mimeType = IMAGE_MIME_MAP[ext];
        if (!mimeType) {
            skippedUnsupported++;
            continue;
        }

        // Extract the image data
        const imageData = await zipEntry.async('nodebuffer');
        const sizeBytes = imageData.length;

        // Filter by size
        if (sizeBytes < MIN_IMAGE_SIZE_BYTES) {
            skippedSmall++;
            continue;
        }

        if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
            skippedLarge++;
            console.warn(`[Images] Skipping oversized file: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
            continue;
        }

        images.push({
            filename,
            buffer: Buffer.from(imageData),
            mimeType,
            sizeBytes,
            index: imageIndex++,
        });
    }

    console.log(`[Images] Extracted ${images.length} images (skipped: ${skippedSmall} small, ${skippedLarge} large, ${skippedUnsupported} unsupported)`);

    return images;
}

/**
 * Check if a file is a PPTX by MIME type
 */
export function isPPTX(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}

// ============================================================================
// Step 8: Supabase Upload & Markdown Injection
// ============================================================================

export interface UploadedDiagram {
    /** Original filename from PPTX */
    filename: string;
    /** Public URL in Supabase Storage */
    publicUrl: string;
    /** Storage path in Supabase */
    storagePath: string;
    /** Image index */
    index: number;
}

/**
 * Upload extracted images to Supabase Storage
 * 
 * @param images - Array of extracted images from extractPPTXImages
 * @param supabase - Supabase client (service role)
 * @param uploadId - The notes metadata upload ID (for folder structure)
 * @returns Array of uploaded diagram info with public URLs
 */
export async function uploadDiagramsToSupabase(
    images: ExtractedImage[],
    supabase: any,
    uploadId: string
): Promise<UploadedDiagram[]> {
    if (images.length === 0) {
        console.log('[Images] No images to upload');
        return [];
    }

    console.log(`[Images] Uploading ${images.length} diagrams to Supabase Storage`);

    const uploaded: UploadedDiagram[] = [];

    for (const image of images) {
        const storagePath = `diagrams/${uploadId}/${image.filename}`;

        try {
            const { error: uploadError } = await supabase.storage
                .from('resources')
                .upload(storagePath, image.buffer, {
                    contentType: image.mimeType,
                    upsert: true, // Overwrite if re-processing
                });

            if (uploadError) {
                console.warn(`[Images] Failed to upload ${image.filename}:`, uploadError.message);
                continue;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('resources')
                .getPublicUrl(storagePath);

            uploaded.push({
                filename: image.filename,
                publicUrl: urlData.publicUrl,
                storagePath,
                index: image.index,
            });

        } catch (err) {
            console.warn(`[Images] Upload error for ${image.filename}:`, err);
        }
    }

    console.log(`[Images] Successfully uploaded ${uploaded.length}/${images.length} diagrams`);
    return uploaded;
}

/**
 * Inject diagram URLs into AI-extracted markdown
 * 
 * Replaces [DIAGRAM: "description"] tags with Markdown image syntax
 * that references the uploaded Supabase URL.
 * 
 * Images are matched to tags in order of appearance.
 * If there are more tags than images (or vice versa), extras are left alone.
 * 
 * @param markdown - AI-extracted markdown text
 * @param diagrams - Uploaded diagram info with public URLs
 * @returns Modified markdown with image URLs injected
 */
export function injectDiagramUrls(
    markdown: string,
    diagrams: UploadedDiagram[]
): string {
    if (diagrams.length === 0) return markdown;

    let diagramIndex = 0;

    // Replace each [DIAGRAM: "..."] tag with a Markdown image
    const result = markdown.replace(
        /\[DIAGRAM:\s*"([^"]+)"\]/g,
        (fullMatch, description) => {
            if (diagramIndex >= diagrams.length) {
                // More tags than images — leave the tag as-is
                return fullMatch;
            }

            const diagram = diagrams[diagramIndex++];
            // Return Markdown image syntax: ![alt text](url)
            return `![${description}](${diagram.publicUrl})`;
        }
    );

    console.log(`[Images] Injected ${diagramIndex} diagram URLs into markdown`);
    return result;
}
