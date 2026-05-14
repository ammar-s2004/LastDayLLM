/* ============================================================================
   FILE: trigger/tasks/cleanup-expired-notes.ts
   ============================================================================
   
   Scheduled Task: Cleanup Expired Notes
   
   Runs daily to:
   1. Delete expired points from Qdrant
   2. Update metadata records in Supabase
   3. Clean up storage files
   
============================================================================ */

import { schedules } from '@trigger.dev/sdk';
import { createClient } from '@supabase/supabase-js';
import { deleteExpiredNotes } from '@/lib/qdrant';

// Create service role Supabase client
function getSupabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

/**
 * Scheduled cleanup task - runs daily at 3 AM UTC
 */
export const cleanupExpiredNotesTask = schedules.task({
    id: 'cleanup-expired-notes',

    // Run at 3 AM UTC daily
    cron: '0 3 * * *',

    run: async () => {
        console.log('[Cleanup] Starting expired notes cleanup...');
        const supabase = getSupabaseAdmin();
        const now = new Date().toISOString();

        try {
            // 1. Find expired metadata records
            const { data: expiredRecords, error: fetchError } = await supabase
                .from('qdrant_notes_metadata')
                .select('id, storage_path, qdrant_point_ids')
                .lt('expires_at', now)
                .is('deleted_at', null);

            if (fetchError) {
                throw new Error(`Failed to fetch expired records: ${fetchError.message}`);
            }

            if (!expiredRecords || expiredRecords.length === 0) {
                console.log('[Cleanup] No expired notes to cleanup');
                return { success: true, deletedCount: 0 };
            }

            console.log(`[Cleanup] Found ${expiredRecords.length} expired records`);

            // 2. Delete from Qdrant
            const qdrantDeleted = await deleteExpiredNotes();
            console.log(`[Cleanup] Deleted ${qdrantDeleted} points from Qdrant`);

            // 3. Delete storage files
            const storagePaths = expiredRecords
                .map(r => r.storage_path)
                .filter((p): p is string => !!p);

            if (storagePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('resources')
                    .remove(storagePaths);

                if (storageError) {
                    console.error('[Cleanup] Storage delete error:', storageError);
                }
            }

            // 4. Soft delete metadata records
            const expiredIds = expiredRecords.map(r => r.id);
            const { error: updateError } = await supabase
                .from('qdrant_notes_metadata')
                .update({ deleted_at: now })
                .in('id', expiredIds);

            if (updateError) {
                console.error('[Cleanup] Metadata update error:', updateError);
            }

            console.log(`[Cleanup] Metadata update complete! Soft-deleted ${expiredIds.length} records`);

            // 5. Purge old FAILED records (> 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { count: purgedCount, error: purgeError } = await supabase
                .from('qdrant_notes_metadata')
                .delete({ count: 'exact' })
                .eq('processing_status', 'FAILED')
                .lt('created_at', sevenDaysAgo.toISOString());

            if (purgeError) {
                console.error('[Cleanup] Failed records purge error:', purgeError);
            } else {
                console.log(`[Cleanup] Purged ${purgedCount} orphan FAILED records older than 7 days`);
            }

            return {
                success: true,
                deletedCount: expiredRecords.length,
                qdrantPointsDeleted: qdrantDeleted,
                purgedFailures: purgedCount || 0,
            };

        } catch (error) {
            console.error('[Cleanup] Error:', error);
            throw error;
        }
    },
});
